import { Router } from 'express';
import { query, get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';
import { requireIntId } from '../lib/validate.js';

const router = Router();

function batchBody(body) {
  return {
    name: String(body.name || '').trim(),
    course_id: body.course_id ? Number(body.course_id) : null,
    days: String(body.days || '').trim() || null,
    time: String(body.time || '').trim() || null,
    status: body.status === 'closed' ? 'closed' : 'active',
  };
}

router.get(
  '/',
  ah(async (req, res) => {
    const batches = await query(
      `SELECT b.*,
              c.name AS course_name,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.batch_id = b.id AND e.status = 'active') AS students
       FROM batches b
       LEFT JOIN courses c ON c.id = b.course_id
       ORDER BY b.status = 'active' DESC, b.id DESC`,
    );
    const unassigned = await query(
      `SELECT s.id AS student_id,
              s.name,
              s.phone,
              s.status,
              (SELECT string_agg(c2.name, ', ')
                 FROM enrollments e2
                 LEFT JOIN courses c2 ON c2.id = e2.course_id
                WHERE e2.student_id = s.id AND e2.status = 'active') AS course_name,
              (SELECT e3.id
                 FROM enrollments e3
                WHERE e3.student_id = s.id AND e3.status = 'active' AND e3.batch_id IS NULL
                ORDER BY e3.id DESC LIMIT 1) AS enrollment_id
       FROM students s
       WHERE EXISTS (SELECT 1 FROM enrollments e
                       WHERE e.student_id = s.id AND e.status = 'active' AND e.batch_id IS NULL)
         AND (SELECT e3.id
                FROM enrollments e3
               WHERE e3.student_id = s.id AND e3.status = 'active' AND e3.batch_id IS NULL
               ORDER BY e3.id DESC LIMIT 1) IS NOT NULL`,
    );
    const counts = {
      total: batches.length,
      active: batches.filter((b) => b.status === 'active').length,
      students: batches.reduce((sum, b) => sum + b.students, 0),
      unassigned: unassigned.length,
    };
    res.json({ batches, unassigned, counts });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const b = batchBody(req.body || {});
    if (!b.name) return res.status(400).json({ error: 'Batch name is required.' });
    const { lastInsertRowid } = await run(
      `INSERT INTO batches (name, course_id, days, time, status)
       VALUES ($1, $2, $3, $4, $5)`,
      b.name,
      b.course_id,
      b.days,
      b.time,
      b.status,
    );
    res.status(201).json(await get('SELECT * FROM batches WHERE id = $1', lastInsertRowid));
  }),
);

router.put(
  '/:id',
  requireIntId,
  ah(async (req, res) => {
    const exists = await get('SELECT id FROM batches WHERE id = $1', req.params.id);
    if (!exists) return res.status(404).json({ error: 'Batch not found.' });
    const b = batchBody(req.body || {});
    if (!b.name) return res.status(400).json({ error: 'Batch name is required.' });
    await run(
      `UPDATE batches SET name=$1, course_id=$2, days=$3, time=$4, status=$5 WHERE id=$6`,
      b.name,
      b.course_id,
      b.days,
      b.time,
      b.status,
      req.params.id,
    );
    res.json(await get('SELECT * FROM batches WHERE id = $1', req.params.id));
  }),
);

router.delete(
  '/:id',
  requireIntId,
  ah(async (req, res) => {
    const exists = await get('SELECT id FROM batches WHERE id = $1', req.params.id);
    if (!exists) return res.status(404).json({ error: 'Batch not found.' });
    await run('DELETE FROM batches WHERE id = $1', req.params.id);
    res.json({ ok: true });
  }),
);

export default router;