import { Router } from 'express';
import { query, run } from '../db.js';
import { monthReport, parseYm } from '../lib/monthly.js';
import { receiptHtml, receiptNumber, studentRef } from '../lib/receipts.js';
import { getPaymentRow, paymentReceiptPayload, shareBase } from '../lib/paymentReceipt.js';

const router = Router();

// List all payments, newest first. Query params: month (YYYY-MM), or from/to (YYYY-MM-DD), course_id
router.get('/', (req, res) => {
  const month = parseYm(req.query.month);
  let from = String(req.query.from || '').slice(0, 10);
  let to = String(req.query.to || '').slice(0, 10);
  const courseId = Number(req.query.course_id) || null;

  if (month) {
    from = `${month.key}-01`;
    const d = new Date(month.y, month.mo, 0);
    to = `${month.y}-${String(month.mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const conds = [];
  const params = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conds.push('fp.payment_date >= ?');
    params.push(from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conds.push('fp.payment_date <= ?');
    params.push(to);
  }
  if (courseId) {
    conds.push('e.course_id = ?');
    params.push(courseId);
  }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

  const payments = query(
    `SELECT fp.*, s.name AS student_name, s.phone AS student_phone, e.student_id,
            c.name AS course_name, b.name AS batch_name
     FROM fee_payments fp
     JOIN enrollments e ON e.id = fp.enrollment_id
     JOIN students s ON s.id = e.student_id
     LEFT JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     ${where}
     ORDER BY fp.payment_date DESC, fp.id DESC`,
    ...params,
  );

  const rows = payments.map((p) => ({
    ...p,
    receipt_no: receiptNumber(p),
    student_ref: studentRef(p.student_id),
    share_url: p.share_token ? `${shareBase()}/share/r/${p.share_token}` : '',
  }));

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  res.json({ payments: rows, summary: { total, count: payments.length } });
});

// Month-level fee report: expected vs paid vs outstanding for active enrollments.
router.get('/summary', (req, res) => {
  const ym = parseYm(req.query.month);
  if (!ym) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const enrollments = query(
    `SELECT e.id, e.student_id, e.start_date, e.status,
            s.name AS student_name,
            c.monthly_fee, c.fee_mode, c.duration_months,
            (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp
             WHERE fp.enrollment_id = e.id AND substr(fp.payment_date, 1, 7) = ? AND fp.fee_type = 'tuition') AS paidInMonth
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN courses c ON c.id = e.course_id
     WHERE e.status = 'active'`,
    ym.key,
  );

  res.json(monthReport(enrollments, ym));
});

// Printable receipt page for one payment (prints to PDF, WhatsApp share).
router.get('/:id/receipt', (req, res) => {
  const payment = getPaymentRow(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });

  const r = paymentReceiptPayload(payment);
  res.type('html').send(receiptHtml(r));
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM fee_payments WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default router;