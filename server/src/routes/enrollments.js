import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query, get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';
import { fetchEnrollments, getEnrollmentWithFees } from '../lib/enrollments.js';
import { generateCertificate, defaultCertNumber } from '../services/certificate.js';
import { sendImage, normalizeNumber } from '../services/whatsapp.js';
import { formatDate } from '../lib/fees.js';
import { getPaymentRow } from '../lib/paymentReceipt.js';
import { sendPaymentReceiptForPayment } from '../services/paymentReceipts.js';

const FEE_TYPES = ['tuition', 'admission', 'kit', 'other'];

function toFeeType(v) {
  return FEE_TYPES.includes(v) ? v : 'tuition';
}

const router = Router();

router.get(
  '/',
  ah(async (req, res) => {
    res.json(await fetchEnrollments({ student_id: req.query.student_id, status: req.query.status }));
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const enrollment = await getEnrollmentWithFees(req.params.id);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    const payments = await query(
      'SELECT * FROM fee_payments WHERE enrollment_id = $1 ORDER BY payment_date DESC, id DESC',
      req.params.id,
    );
    res.json({ ...enrollment, payments });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const b = req.body || {};
    const student = await get('SELECT id FROM students WHERE id = $1', b.student_id);
    if (!student) return res.status(400).json({ error: 'Select a valid student.' });
    if (!b.start_date) return res.status(400).json({ error: 'Start date is required.' });
    if (b.course_id) {
      const course = await get('SELECT status FROM courses WHERE id = $1', b.course_id);
      if (!course) return res.status(400).json({ error: 'Select a valid course.' });
      if (course.status === 'inactive') {
        return res.status(400).json({ error: 'This course is inactive. Re-activate it before adding students.' });
      }
    }

    const { lastInsertRowid } = await run(
      `INSERT INTO enrollments (student_id, course_id, batch, batch_id, start_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      b.student_id,
      b.course_id || null,
      b.batch || null,
      b.batch_id || null,
      b.start_date,
      b.status === 'completed' || b.status === 'left' ? b.status : 'active',
      b.notes || null,
    );
    const firstCourse = b.course_id ? await get('SELECT name FROM courses WHERE id = $1', b.course_id) : null;
    await run(
      `INSERT INTO student_events (student_id, enrollment_id, type, course_id, to_course, remark)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      b.student_id,
      lastInsertRowid,
      'enrolled',
      b.course_id || null,
      firstCourse?.name || null,
      b.notes || null,
    );
    res.status(201).json(await getEnrollmentWithFees(lastInsertRowid));
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const existing = await get('SELECT * FROM enrollments WHERE id = $1', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Enrollment not found.' });
    const b = req.body || {};
    const course_id = b.course_id !== undefined ? (b.course_id || null) : existing.course_id;
    const batch = b.batch !== undefined ? (b.batch || null) : existing.batch;
    const batch_id = b.batch_id !== undefined ? (b.batch_id || null) : existing.batch_id;
    const start_date = b.start_date !== undefined ? b.start_date : existing.start_date;
    const status =
      b.status !== undefined && ['active', 'completed', 'left'].includes(b.status) ? b.status : existing.status;
    const notes = b.notes !== undefined ? (b.notes || null) : existing.notes;
    if (course_id) {
      const course = await get('SELECT status FROM courses WHERE id = $1', course_id);
      if (course && course.status === 'inactive') {
        return res.status(400).json({ error: 'This course is inactive. Re-activate it before adding students.' });
      }
    }
    await run(
      `UPDATE enrollments SET course_id=$1, batch=$2, batch_id=$3, start_date=$4, status=$5, notes=$6 WHERE id=$7`,
      course_id,
      batch,
      batch_id,
      start_date,
      status,
      notes,
      req.params.id,
    );
    if (course_id !== existing.course_id) {
      const from = existing.course_id ? await get('SELECT name FROM courses WHERE id = $1', existing.course_id) : null;
      const to = course_id ? await get('SELECT name FROM courses WHERE id = $1', course_id) : null;
      await run(
        `INSERT INTO student_events (student_id, enrollment_id, type, course_id, from_course, to_course, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        existing.student_id,
        req.params.id,
        b.is_upgrade ? 'upgraded' : 'course_changed',
        course_id,
        from?.name || null,
        to?.name || null,
        b.remark !== undefined ? (b.remark || null) : null,
      );
    }
    res.json(await getEnrollmentWithFees(req.params.id));
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    await run('DELETE FROM enrollments WHERE id = $1', req.params.id);
    res.json({ ok: true });
  }),
);

async function buildCert(enrollmentId) {
  const enrollment = await get(
    `SELECT e.*, s.name AS student_name, s.phone AS student_phone,
            s.guardian_name, s.guardian_phone,
            c.name AS course_name
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN courses c ON c.id = e.course_id
     WHERE e.id = $1`,
    enrollmentId,
  );
  if (!enrollment) return null;

  const lastUpgrade = await get(
    `SELECT from_course, to_course FROM student_events
     WHERE enrollment_id = $1 AND type IN ('upgraded','course_changed')
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    enrollmentId,
  );

  const fromCourse = lastUpgrade?.from_course || null;
  const toCourse = lastUpgrade?.to_course || enrollment.course_name;
  const certNumber = defaultCertNumber({ enrollmentId: Number(enrollmentId) });
  const dateLabel = formatDate(new Date().toISOString().slice(0, 10));

  const cert = await generateCertificate({
    studentName: enrollment.student_name,
    fromCourse,
    toCourse,
    dateLabel,
    certNumber,
  });

  return { enrollment, fromCourse, toCourse, certNumber, dateLabel, cert };
}

router.get('/:id/certificate', async (req, res) => {
  try {
    const data = await buildCert(req.params.id);
    if (!data) return res.status(404).json({ error: 'Enrollment not found.' });
    const { enrollment, fromCourse, toCourse, certNumber, cert } = data;
    const phone = enrollment.guardian_phone || enrollment.student_phone;
    res.json({
      ok: true,
      image: `data:image/png;base64,${cert.buffer.toString('base64')}`,
      certNumber,
      fromCourse,
      toCourse,
      dateLabel: data.dateLabel,
      studentName: enrollment.student_name,
      phone,
      filename: cert.filename,
    });
  } catch (err) {
    console.error('[certificate preview]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/certificate', async (req, res) => {
  try {
    const data = await buildCert(req.params.id);
    if (!data) return res.status(404).json({ error: 'Enrollment not found.' });
    const { enrollment, fromCourse, toCourse, certNumber, cert } = data;

    const phone = enrollment.guardian_phone || enrollment.student_phone;
    const to = normalizeNumber(phone);
    if (!to) {
      return res.status(400).json({ error: `No valid parent/student phone for this enrollment (${phone || 'none'}).` });
    }

    const caption = `${enrollment.student_name} has completed a level at ${process.env.CERT_BRAND || 'Pravaha Art Space'} — certificate ${certNumber}.`;
    const result = await sendImage(to, cert.buffer, cert.filename, caption);

    const ok = result.status === 'sent';
    const message = ok
      ? `Certificate ${certNumber} sent: ${enrollment.student_name}${toCourse ? ` promoted to ${toCourse}` : ''}.`
      : `Certificate ${certNumber} send failed: ${result.message || 'unknown error'}`;

    await run(
      `INSERT INTO student_events (student_id, enrollment_id, type, from_course, to_course, remark)
       VALUES ($1, $2, 'certificate', $3, $4, $5)`,
      enrollment.student_id,
      req.params.id,
      fromCourse,
      toCourse,
      message,
    );

    res.json({ ok: true, certificate: { certNumber, fromCourse, toCourse, dateLabel: data.dateLabel, filename: cert.filename }, delivery: result });
  } catch (err) {
    console.error('[certificate]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get(
  '/:id/payments',
  ah(async (req, res) => {
    const payments = await query(
      'SELECT * FROM fee_payments WHERE enrollment_id = $1 ORDER BY payment_date DESC, id DESC',
      req.params.id,
    );
    res.json(payments);
  }),
);

router.post(
  '/:id/payments',
  ah(async (req, res) => {
    const enrollment = await get('SELECT id FROM enrollments WHERE id = $1', req.params.id);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    const b = req.body || {};
    const amount = Number(b.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });

    const { lastInsertRowid } = await run(
      `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes, fee_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      req.params.id,
      amount,
      b.payment_date || new Date().toISOString().slice(0, 10),
      b.method || 'cash',
      b.notes || null,
      toFeeType(b.fee_type),
    );

    const payment = await getPaymentRow(lastInsertRowid);
    if (payment) {
      sendPaymentReceiptForPayment(payment).catch((err) => console.error('[payment-receipt]', err));
    }

    res.status(201).json(await get('SELECT * FROM fee_payments WHERE id = $1', lastInsertRowid));
  }),
);

/**
 * Record the one-time admission collection (Course + Admission + Kit) as a
 * single group of fee_payment rows sharing one admission_group, so they print
 * on one combined receipt. Body: { payment_date, method, notes,
 *   tuition: {amount} | null, admission: {amount} | null, kit: {amount} | null }
 */
router.post(
  '/:id/admission',
  ah(async (req, res) => {
    const enrollment = await get('SELECT id FROM enrollments WHERE id = $1', req.params.id);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    const b = req.body || {};
    const date = b.payment_date || new Date().toISOString().slice(0, 10);
    const method = b.method || 'cash';
    const notes = b.notes || null;

    const items = [];
    const push = (feeType, amount) => {
      const amt = Math.round(Number(amount) * 100) / 100;
      if (feeType && amt > 0) items.push({ fee_type: toFeeType(feeType), amount: amt });
    };
    push('tuition', b.tuition?.amount);
    push('admission', b.admission?.amount);
    push('kit', b.kit?.amount);

    if (items.length === 0) {
      return res.status(400).json({ error: 'Collect at least one fee amount.' });
    }

    const group = randomUUID();
    const created = [];
    for (const item of items) {
      const { lastInsertRowid } = await run(
        `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes, fee_type, admission_group)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        req.params.id,
        item.amount,
        date,
        method,
        notes,
        item.fee_type,
        group,
      );
      created.push(await get('SELECT * FROM fee_payments WHERE id = $1', lastInsertRowid));
    }

    // One combined receipt + WhatsApp message for the whole admission group.
    const primary = await getPaymentRow(created[0].id);
    if (primary) {
      sendPaymentReceiptForPayment(primary).catch((err) => console.error('[admission-receipt]', err));
    }

    res.status(201).json({ ok: true, group, items: created, total: items.reduce((s, it) => s + it.amount, 0) });
  }),
);

export default router;