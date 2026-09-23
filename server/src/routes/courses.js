import { Router } from 'express';
import { query, get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();

function courseBody(body) {
  return {
    name: String(body.name || '').trim(),
    fee_mode: body.fee_mode === 'one_time' ? 'one_time' : 'monthly',
    monthly_fee: Number(body.monthly_fee) || 0,
    duration_months: Number(body.duration_months) || null,
    description: String(body.description || '').trim() || null,
    status: ['active', 'inactive'].includes(body.status) ? body.status : 'active',
    admission_fee: Math.max(0, Number(body.admission_fee) || 0),
    kit_fee: body.kit_fee === '' || body.kit_fee === null || body.kit_fee === undefined ? null : Math.max(0, Number(body.kit_fee) || 0),
    sort_order: Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : null,
  };
}

router.get(
  '/',
  ah(async (req, res) => {
    const courses = await query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS active_enrollments,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollments,
              (SELECT COUNT(*)::int FROM batches b WHERE b.course_id = c.id AND b.status = 'active') AS active_batches,
              (SELECT COUNT(*)::int FROM batches b WHERE b.course_id = c.id) AS total_batches
       FROM courses c
       ORDER BY (c.sort_order IS NULL), c.sort_order ASC, c.id ASC`,
    );
    res.json(courses);
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const b = courseBody(req.body || {});
    if (!b.name) return res.status(400).json({ error: 'Course name is required.' });
    const { lastInsertRowid } = await run(
      `INSERT INTO courses (name, fee_mode, monthly_fee, duration_months, description, status, admission_fee, kit_fee, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      b.name,
      b.fee_mode,
      b.monthly_fee,
      b.duration_months,
      b.description,
      b.status,
      b.admission_fee,
      b.kit_fee,
      b.sort_order,
    );
    res.status(201).json(await get('SELECT * FROM courses WHERE id = $1', lastInsertRowid));
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const exists = await get('SELECT id FROM courses WHERE id = $1', req.params.id);
    if (!exists) return res.status(404).json({ error: 'Course not found.' });
    const b = courseBody(req.body || {});
    if (!b.name) return res.status(400).json({ error: 'Course name is required.' });
    await run(
      `UPDATE courses SET name=$1, fee_mode=$2, monthly_fee=$3, duration_months=$4, description=$5, status=$6,
              admission_fee=$7, kit_fee=$8, sort_order=$9 WHERE id=$10`,
      b.name,
      b.fee_mode,
      b.monthly_fee,
      b.duration_months,
      b.description,
      b.status,
      b.admission_fee,
      b.kit_fee,
      b.sort_order,
      req.params.id,
    );
    res.json(await get('SELECT * FROM courses WHERE id = $1', req.params.id));
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const used = await get('SELECT COUNT(*)::int AS n FROM enrollments WHERE course_id = $1', req.params.id);
    if (used.n > 0) {
      return res.status(409).json({ error: 'This course has students enrolled. Move them to another course before deleting.' });
    }
    await run('DELETE FROM courses WHERE id = $1', req.params.id);
    res.json({ ok: true });
  }),
);

export default router;