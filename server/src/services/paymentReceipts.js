import { run } from '../db.js';
import { formatMoney, formatDate } from '../lib/fees.js';
import { paymentReceiptPayload } from '../lib/paymentReceipt.js';
import { sendReceipt } from './whatsapp.js';

/**
 * Send the parent an auto receipt (template + View Receipt button) for a
 * confirmed payment row, and record the delivery in reminder_logs.
 * @param {object} payment full fee_payments row joined via getPaymentRow()
 * @returns {Promise<{status, message, payload}>}
 */
export async function sendPaymentReceiptForPayment(payment) {
  const r = await paymentReceiptPayload(payment);
  if (!r) return { status: 'error', message: 'Payment not found.', payload: null };

  const phone = payment.guardian_phone || payment.student_phone;
  if (!phone) {
    await run(
      `INSERT INTO reminder_logs (enrollment_id, student_id, amount_due, channel, status, message, error)
       VALUES ($1, $2, $3, 'whatsapp', 'failed', $4, $5)`,
      payment.enrollment_id,
      payment.student_id,
      r.amount,
      `Payment receipt not sent for ${r.studentName} — no parent/student phone.`,
      'No phone number.',
    );
    return { status: 'error', message: 'No parent or student phone number.', payload: r };
  }

  const result = await sendReceipt({
    phone,
    name: r.studentName,
    amount: formatMoney(r.amount),
    date: formatDate(payment.payment_date),
    shareToken: r.shareToken,
  });
  const ok = result.status === 'sent';

  await run(
    `INSERT INTO reminder_logs (enrollment_id, student_id, amount_due, channel, status, message, error)
     VALUES ($1, $2, $3, 'whatsapp', $4, $5, $6)`,
    payment.enrollment_id,
    payment.student_id,
    r.amount,
    ok ? 'sent' : 'failed',
    ok
      ? `Payment receipt ${r.receipt_no} for ${r.studentName} — ${formatMoney(r.amount)} received on ${formatDate(payment.payment_date)}. ${r.shareUrl ? `Receipt link: ${r.shareUrl}` : ''}`
      : null,
    ok ? null : result.message || 'Receipt send failed.',
  );

  return { status: result.status, message: result.message || null, payload: r };
}