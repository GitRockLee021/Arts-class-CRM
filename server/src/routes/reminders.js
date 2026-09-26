import { Router } from 'express';
import { query, get, run } from '../db.js';
import { fetchEnrollments, getEnrollmentWithFees } from '../lib/enrollments.js';
import { formatMoney, formatDate } from '../lib/fees.js';
import { enrollmentOverdue } from '../lib/monthly.js';
import { sendFeeReminder, sendTestMessage, waStatus } from '../services/whatsapp.js';
import { createPaymentLink, isRazorpayConfigured, isWebhookConfigured } from '../services/razorpay.js';
import { requireRole } from '../services/auth.js';
import { toInt } from '../lib/validate.js';

const router = Router();

router.get('/status', requireRole('admin'), (req, res) => {
  res.json({ ...waStatus(), razorpayConfigured: isRazorpayConfigured(), razorpayWebhookConfigured: isWebhookConfigured() });
});

function dueDateLabel(d) {
  if (!d) return '';
  return formatDate(d);
}

/** Overdue students (unpaid after the 7th), with days-late + link-sent info. */
router.get('/dues', async (req, res, next) => {
  try {
    const now = new Date();
    const enrollments = await fetchEnrollments({ status: 'active' });

    const byEnrollment = new Map();
    for (const r of await query(
      `SELECT enrollment_id, substr(payment_date, 1, 7) AS ym, SUM(amount) AS paid
       FROM fee_payments
       WHERE fee_type = 'tuition'
       GROUP BY enrollment_id, substr(payment_date, 1, 7)`,
    )) {
      if (!byEnrollment.has(r.enrollment_id)) byEnrollment.set(r.enrollment_id, new Map());
      byEnrollment.get(r.enrollment_id).set(r.ym, Number(r.paid || 0));
    }

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const linked = new Set(
      (
        await query(
          `SELECT DISTINCT enrollment_id FROM reminder_logs
           WHERE substr(sent_at::text, 1, 7) = $1 AND status != 'error'`,
          monthKey,
        )
      ).map((r) => r.enrollment_id),
    );

    const rows = [];
    for (const e of enrollments) {
      const overdue = enrollmentOverdue(e, byEnrollment.get(e.id) || new Map(), now);
      if (!overdue || overdue.amount <= 0) continue;
      rows.push({
        id: e.id,
        student_id: e.student_id,
        student_name: e.student_name,
        student_phone: e.student_phone,
        notify_phone: e.guardian_phone || e.student_phone,
        course_name: e.course_name || null,
        batch_name: e.batch_name || e.batch || null,
        amount_due: overdue.amount,
        days_late: overdue.daysLate,
        months_overdue: overdue.months,
        since: overdue.since,
        link_sent: linked.has(e.id),
      });
    }
    rows.sort((a, b) => b.days_late - a.days_late || b.amount_due - a.amount_due);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

async function sendForEnrollment(enrollment) {
  const due = enrollment.fee.due;
  if (due <= 0) {
    return { enrollment_id: enrollment.id, student_name: enrollment.student_name, status: 'skipped', error: 'No dues.' };
  }

  const notify = enrollment.guardian_phone || enrollment.student_phone;
  const payment = await createPaymentLink({
    amount: due,
    customerName: enrollment.student_name,
    customerPhone: notify,
    description: `${enrollment.course_name || 'Course'} fee — ${enrollment.batch_name || enrollment.batch || ''}`.trim(),
    notes: { enrollment_id: String(enrollment.id), student_id: String(enrollment.student_id) },
  });
  const paymentLink = payment.short_url || null;

  const result = await sendFeeReminder({
    phone: notify,
    name: `${enrollment.student_name}${process.env.WHATSAPP_NAME_SUFFIX || "'s parent"}`,
    amount: formatMoney(due),
    dueDate: dueDateLabel(enrollment.fee.dueDate),
    batch: process.env.WHATSAPP_BATCH_LABEL || enrollment.batch_name || enrollment.batch || enrollment.course_name,
    paymentLink,
  });

  const linkNote = paymentLink ? ` Payment link: ${paymentLink}` : '';
  const message = `Fee reminder for ${enrollment.student_name} — due ${formatMoney(due)}.${linkNote}`;
  await run(
    `INSERT INTO reminder_logs (enrollment_id, student_id, amount_due, channel, status, message, error)
     VALUES ($1, $2, $3, 'whatsapp', $4, $5, $6)`,
    enrollment.id,
    enrollment.student_id,
    due,
    result.status === 'error' ? 'failed' : result.status,
    message,
    result.status === 'error' ? result.message : null,
  );

  return {
    enrollment_id: enrollment.id,
    student_name: enrollment.student_name,
    student_phone: enrollment.student_phone,
    notify_phone: notify,
    amount_due: due,
    payment_link: paymentLink,
    rzp_status: payment.status,
    status: result.status,
    message: result.message || null,
  };
}

/**
 * Send reminders. Body:
 *   { enrollmentIds: [...] }  → specific enrollments, or
 *   {}                        → all students with dues
 *
 * Admin-only, like /status and /test. Omitting `enrollmentIds` messages *every* parent with dues,
 * and each send is a billable WhatsApp conversation, so this was reachable by any faculty login:
 * a compromised or careless faculty account could message the whole school and run up Meta's
 * per-conversation fees. Faculty can still see dues and the send log (read-only).
 */
router.post('/send', requireRole('admin'), async (req, res) => {
  try {
    let targets;
    const requested = req.body?.enrollmentIds;
    let ids = null;
    if (requested !== undefined && requested !== null) {
      // An explicit id list must be a non-empty array of valid ids. Anything else (wrong type,
      // empty, all-invalid) is a 400 — never a fall-through to "remind every student with dues".
      if (!Array.isArray(requested)) {
        return res.status(400).json({ error: 'enrollmentIds must be an array of ids' });
      }
      ids = requested.map(toInt);
      if (ids.some((x) => x === null) || ids.length === 0) {
        return res.status(400).json({ error: 'enrollmentIds must contain at least one valid id' });
      }
    }
    if (ids) {
      const fetched = [];
      for (const id of ids) {
        const e = await getEnrollmentWithFees(id);
        if (e) fetched.push(e);
      }
      targets = fetched;
    } else {
      targets = await fetchEnrollments({ status: 'active', due_only: true });
    }
    if (!targets.length) return res.json({ results: [], message: 'No dues to remind.' });

    const results = [];
    for (const t of targets) {
      results.push(await sendForEnrollment(t));
    }
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const conds = [];
    const params = [];
    const month = String(req.query.month || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      conds.push('substr(rl.sent_at::text, 1, 7) = $' + (params.length + 1));
      params.push(month);
    }
    const enrollmentId = toInt(req.query.enrollment_id);
    if (enrollmentId !== null) {
      conds.push('rl.enrollment_id = $' + (params.length + 1));
      params.push(enrollmentId);
    }
    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';

    const logs = await query(
      `SELECT rl.*, s.name AS student_name, c.name AS course_name
       FROM reminder_logs rl
       JOIN enrollments e ON e.id = rl.enrollment_id
       JOIN students s ON s.id = rl.student_id
       LEFT JOIN courses c ON c.id = e.course_id
       ${where}
       ORDER BY rl.id DESC
       LIMIT 300`,
      ...params,
    );
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.post('/test', requireRole('admin'), async (req, res) => {
  try {
    const phone = req.body?.phone;
    if (!phone) return res.status(400).json({ error: 'Provide a phone number.' });
    const payment = await createPaymentLink({
      amount: 1,
      customerName: 'Test Student',
      customerPhone: phone,
      description: 'CRM test — Pay Now button check',
    }).catch(() => ({ status: 'error', short_url: null, error: 'Failed to create test payment link.' }));
    const result = await sendTestMessage(phone, { paymentLink: payment.short_url });
    res.json({ ...result, payment_link: payment.short_url, rzp_status: payment.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

export default router;