import { Router } from 'express';
import { query, get, run } from '../db.js';

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

router.get('/', (req, res) => {
  const courses = query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS active_enrollments,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollments,
            (SELECT COUNT(*) FROM batches b WHERE b.course_id = c.id AND b.status = 'active') AS active_batches,
            (SELECT COUNT(*) FROM batches b WHERE b.course_id = c.id) AS total_batches
     FROM courses c
     ORDER BY (c.sort_order IS NULL), c.sort_order ASC, c.id ASC`,
  );
  res.json(courses);
});

router.post('/', (req, res) => {
  const b = courseBody(req.body || {});
  if (!b.name) return res.status(400).json({ error: 'Course name is required.' });
  const { lastInsertRowid } = run(
    `INSERT INTO courses (name, fee_mode, monthly_fee, duration_months, description, status, admission_fee, kit_fee, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  res.status(201).json(get('SELECT * FROM courses WHERE id = ?', lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const exists = get('SELECT id FROM courses WHERE id = ?', req.params.id);
  if (!exists) return res.status(404).json({ error: 'Course not found.' });
  const b = courseBody(req.body || {});
  if (!b.name) return res.status(400).json({ error: 'Course name is required.' });
  run(
    `UPDATE courses SET name=?, fee_mode=?, monthly_fee=?, duration_months=?, description=?, status=?,
            admission_fee=?, kit_fee=?, sort_order=? WHERE id=?`,
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
  res.json(get('SELECT * FROM courses WHERE id = ?', req.params.id));
});

router.delete('/:id', (req, res) => {
  const used = get('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?', req.params.id);
  if (used.n > 0) {
    return res.status(409).json({ error: 'This course has students enrolled. Move them to another course before deleting.' });
  }
  run('DELETE FROM courses WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default router;