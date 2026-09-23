import { Router } from 'express';
import { query, get, run } from '../db.js';
import { fetchEnrollments } from '../lib/enrollments.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();

function studentBody(body) {
  const ageNum = Number(body.age);
  return {
    name: String(body.name || '').trim(),
    phone: String(body.phone || '').trim(),
    age: Number.isInteger(ageNum) && ageNum >= 3 && ageNum <= 120 ? ageNum : null,
    email: String(body.email || '').trim() || null,
    guardian_name: String(body.guardian_name || '').trim() || null,
    guardian_phone: String(body.guardian_phone || '').trim() || null,
    address: String(body.address || '').trim() || null,
    date_of_birth: body.date_of_birth || null,
    date_of_admission: body.date_of_admission || null,
    notes: String(body.notes || '').trim() || null,
    status: ['active', 'inactive', 'draft'].includes(body.status) ? body.status : 'active',
  };
}

function validatePhone(b) {
  if (!/^\d{10}$/.test(b.phone || '')) {
    return 'Phone must be exactly 10 digits.';
  }
  if (b.guardian_phone && !/^\d{10}$/.test(b.guardian_phone)) {
    return 'Parent phone must be exactly 10 digits.';
  }
  return null;
}

router.get(
  '/',
  ah(async (req, res) => {
    const { search, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || 10);
    const conds = [];
    const params = [];
    if (search) {
      conds.push('(s.name ILIKE $' + (params.length + 1) + ' OR s.phone ILIKE $' + (params.length + 2) + ')');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status && status !== 'all') {
      conds.push('s.status = $' + (params.length + 1));
      params.push(status);
    }
    if (req.query.course && req.query.course !== 'all') {
      conds.push(
        `EXISTS (SELECT 1 FROM enrollments e2
                   JOIN courses c2 ON c2.id = e2.course_id
                  WHERE e2.student_id = s.id AND e2.status = 'active' AND c2.id = $` +
          (params.length + 1) +
          ')',
      );
      params.push(req.query.course);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const totalRow = await get(`SELECT COUNT(*)::int AS n FROM students s ${where}`, ...params);
    const total = totalRow.n;

    const students = await query(
      `SELECT s.*,
              (SELECT string_agg(c.name, ', ')
                 FROM enrollments e
                 LEFT JOIN courses c ON c.id = e.course_id
                WHERE e.student_id = s.id AND e.status = 'active') AS current_course,
              (SELECT COALESCE(SUM(amount), 0) FROM fee_payments fp
                 JOIN enrollments e ON e.id = fp.enrollment_id AND e.student_id = s.id
                WHERE fp.fee_type = 'tuition') AS total_paid
       FROM students s
       ${where}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    );

    const dueByStudent = {};
    for (const e of await fetchEnrollments({})) {
      dueByStudent[e.student_id] = (dueByStudent[e.student_id] || 0) + (e.fee?.due || 0);
    }
    const dueCount = Object.values(dueByStudent).filter((d) => d > 0).length;
    const dueTotal = Object.values(dueByStudent).reduce((sum, d) => sum + (d > 0 ? d : 0), 0);

    const overall = await get(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int AS active,
              SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END)::int AS inactive
       FROM students`,
    );
    const counts = {
      total: overall.total,
      active: overall.active || 0,
      inactive: overall.inactive || 0,
      dueCount,
      dueTotal,
    };

    res.json({
      students: students.map((s) => ({ ...s, total_due: dueByStudent[s.id] || 0 })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      counts,
    });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const b = studentBody(req.body || {});
    if (!b.name || !b.phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }
    if (!b.date_of_admission) {
      return res.status(400).json({ error: 'Date of admission is required.' });
    }
    const phoneError = validatePhone(b);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }
    const { lastInsertRowid } = await run(
      `INSERT INTO students (name, phone, email, age, guardian_name, guardian_phone, address, date_of_birth, date_of_admission, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      b.name,
      b.phone,
      b.email,
      b.age,
      b.guardian_name,
      b.guardian_phone,
      b.address,
      b.date_of_birth,
      b.date_of_admission,
      b.notes,
      b.status,
    );
    res.status(201).json(await get('SELECT * FROM students WHERE id = $1', lastInsertRowid));
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const student = await get('SELECT * FROM students WHERE id = $1', req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const enrollments = (await fetchEnrollments({ student_id: req.params.id })).map(async (e) => ({
      ...e,
      payments: await query('SELECT * FROM fee_payments WHERE enrollment_id = $1 ORDER BY payment_date DESC, id DESC', e.id),
    }));
    const resolvedEnrollments = await Promise.all(enrollments);
    const logs = await query(
      `SELECT * FROM (
         SELECT 'reminder' AS type, status, message, to_char(sent_at, 'YYYY-MM-DD HH24:MI') AS at, 1 AS seq
           FROM reminder_logs WHERE student_id = $1
         UNION ALL
         SELECT 'payment' AS type, 'ok' AS status,
                'Payment of ₹' || round(fp.amount)::numeric::text || ' via ' || fp.method AS message,
                fp.payment_date AS at, 0 AS seq
           FROM fee_payments fp JOIN enrollments e ON e.id = fp.enrollment_id WHERE e.student_id = $2
         UNION ALL
         SELECT type,
                'ok' AS status,
                CASE type
                   WHEN 'enrolled' THEN 'Enrolled in ' || COALESCE(to_course, 'course')
                   WHEN 'upgraded' THEN 'Upgraded to ' || COALESCE(to_course, 'course') || COALESCE('  From: ' || from_course, '')
                   WHEN 'course_changed' THEN 'Course changed: ' || COALESCE(from_course, '—') || ' → ' || COALESCE(to_course, '—')
                   WHEN 'certificate' THEN 'Certificate sent: ' || COALESCE(remark, '')
                   WHEN 'profile_updated' THEN COALESCE(remark, 'Profile updated')
                   ELSE type
                 END || CASE WHEN type <> 'profile_updated' AND remark IS NOT NULL THEN ' — ' || remark ELSE '' END AS message,
                to_char(created_at, 'YYYY-MM-DD HH24:MI') AS at,
                2 AS seq
           FROM student_events
          WHERE student_id = $3
         UNION ALL
         SELECT 'enrolled' AS type,
                'ok' AS status,
                'Enrolled in ' || COALESCE(c.name, 'course') AS message,
                to_char(e.created_at, 'YYYY-MM-DD HH24:MI') AS at,
                2 AS seq
           FROM enrollments e
           LEFT JOIN courses c ON c.id = e.course_id
          WHERE e.student_id = $4
            AND NOT EXISTS (SELECT 1 FROM student_events se
                             WHERE se.enrollment_id = e.id AND se.type = 'enrolled')
       ) t ORDER BY at DESC, seq DESC LIMIT 15`,
      req.params.id,
      req.params.id,
      req.params.id,
      req.params.id,
    );
    res.json({ ...student, enrollments: resolvedEnrollments, logs });
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const existing = await get('SELECT * FROM students WHERE id = $1', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Student not found.' });
    const b = studentBody(req.body || {});
    if (!b.name || !b.phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }
    const phoneError = validatePhone(b);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }
    await run(
      `UPDATE students SET name=$1, phone=$2, email=$3, age=$4, guardian_name=$5, guardian_phone=$6, address=$7,
              date_of_birth=$8, date_of_admission=$9, notes=$10, status=$11 WHERE id=$12`,
      b.name,
      b.phone,
      b.email,
      b.age,
      b.guardian_name,
      b.guardian_phone,
      b.address,
      b.date_of_birth,
      b.date_of_admission,
      b.notes,
      b.status,
      req.params.id,
    );

    const changed = [];
    const track = (field, before, after) => {
      const v1 = before == null || before === '' ? '—' : String(before);
      const v2 = after == null || after === '' ? '—' : String(after);
      if (v1 !== v2) changed.push(`${field}: ${v1} → ${v2}`);
    };
    track('name', existing.name, b.name);
    track('phone', existing.phone, b.phone);
    track('email', existing.email, b.email);
    track('age', existing.age, b.age);
    track('parent name', existing.guardian_name, b.guardian_name);
    track('parent phone', existing.guardian_phone, b.guardian_phone);
    track('address', existing.address, b.address);
    track('date_of_admission', existing.date_of_admission, b.date_of_admission);
    track('status', existing.status, b.status);
    if (changed.length > 0) {
      await run(
        `INSERT INTO student_events (student_id, type, remark) VALUES ($1, 'profile_updated', $2)`,
        req.params.id,
        `Profile updated — ${changed.join('; ')}`,
      );
    }

    res.json(await get('SELECT * FROM students WHERE id = $1', req.params.id));
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    await run('DELETE FROM students WHERE id = $1', req.params.id);
    res.json({ ok: true });
  }),
);

export default router;