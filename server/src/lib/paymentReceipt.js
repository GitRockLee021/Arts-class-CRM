import { get, query } from '../db.js';
import { expectedForMonth, parseYm } from './monthly.js';
import { receiptNumber, studentRef, methodLabel, padDateLabel, monthName, amountWords } from './receipts.js';

/** Host used to build the parent-facing receipt link. */
export function shareBase() {
  return (process.env.WHATSAPP_RECEIPT_SHARE_BASE || process.env.APP_URL || `http://localhost:5001`).replace(/\/$/, '');
}

const PAYMENT_SQL = `
SELECT fp.*, e.student_id, e.start_date,
       s.name AS student_name, s.phone AS student_phone,
       s.guardian_name, s.guardian_phone,
       c.name AS course_name, c.monthly_fee, c.fee_mode, c.duration_months
FROM fee_payments fp
JOIN enrollments e ON e.id = fp.enrollment_id
JOIN students s ON s.id = e.student_id
LEFT JOIN courses c ON c.id = e.course_id`;

export async function getPaymentRow(id) {
  return get(`${PAYMENT_SQL} WHERE fp.id = $1`, id);
}

export async function getPaymentRowByToken(token) {
  return get(`${PAYMENT_SQL} WHERE fp.share_token = $1`, token);
}

function lineTitle(feeType, courseName) {
  if (feeType === 'tuition') return courseName || 'Course fee';
  if (feeType === 'admission') return 'Admission fee';
  if (feeType === 'kit') return 'Kit fee';
  return 'Payment';
}

function lineSub(line, payment) {
  if (line.fee_type === 'tuition') {
    return `Course fee — ${monthName(String(line.date || '').slice(0, 7))}`;
  }
  if (line.fee_type === 'admission') return `One-time admission fee — ${payment.course_name || 'course'}`;
  if (line.fee_type === 'kit') return `Kit fee — ${payment.course_name || 'course'}`;
  return line.notes || 'Other fee';
}

/** All fee_payment rows in the same admission collection group, or null. */
export async function groupLines(payment) {
  if (!payment.admission_group) return null;
  const group = await query(
    `SELECT * FROM fee_payments fp
     WHERE fp.enrollment_id = $1 AND fp.admission_group = $2
     ORDER BY fp.id ASC`,
    payment.enrollment_id,
    payment.admission_group,
  );
  if (!group || group.length < 2) return null;
  return group.map((row) => ({
    fee_type: row.fee_type,
    amount: Number(row.amount),
    date: row.payment_date,
    notes: row.notes,
  }));
}

/**
 * Build the fields needed to render a receipt page / WhatsApp message for a
 * payment row (must be fetched via getPaymentRow/getPaymentRowByToken).
 * Rows that belong to an admission collection group produce one multi-line
 * receipt covering all the fees collected together that day.
 */
export async function paymentReceiptPayload(payment) {
  if (!payment) return null;

  const ym = String(payment.payment_date || '').slice(0, 7);
  const ymObj = parseYm(ym);
  let outstanding = 0;
  if (ymObj) {
    const row = await get(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM fee_payments
       WHERE enrollment_id = $1 AND substr(payment_date, 1, 7) = $2 AND fee_type = 'tuition'`,
      payment.enrollment_id,
      ym,
    );
    const paidInMonth = Number(row?.paid || 0);
    outstanding = Math.max(expectedForMonth(payment, ymObj) - paidInMonth, 0);
  }

  const guardian = payment.guardian_name || '—';
  const mobile = payment.guardian_phone || payment.student_phone || '—';

  const base = {
    id: payment.id,
    shareToken: payment.share_token || '',
    shareUrl: payment.share_token ? `${shareBase()}/share/r/${payment.share_token}` : '',
    receipt_no: receiptNumber(payment),
    dateLabel: padDateLabel(payment.payment_date),
    method: payment.method,
    methodLabel: methodLabel(payment.method),
    studentId: payment.student_id,
    studentRef: studentRef(payment.student_id),
    studentName: payment.student_name,
    guardian,
    mobile,
    course: payment.course_name || 'Course fee',
    month: monthName(ym),
    monthKey: ym,
    outstanding,
    halfCourseMonth: false,
  };

  const lines = await groupLines(payment);
  if (!lines) {
    return { ...base, amount: Number(payment.amount), amountWords: amountWords(payment.amount) };
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const anchor = lines.find((l) => l.fee_type === 'tuition') || lines[0];
  const groupYm = String(anchor.date || payment.payment_date || '').slice(0, 7);

  const tuitionLine = lines.find((l) => l.fee_type === 'tuition');
  const startDate = new Date(payment.start_date);
  const halfCourseMonth = Boolean(
    tuitionLine &&
      !Number.isNaN(startDate.getTime()) &&
      startDate.getDate() > 15 &&
      Math.round(Number(tuitionLine.amount)) === Math.round(Number(payment.monthly_fee || 0) * 0.5),
  );

  return {
    ...base,
    month: monthName(groupYm),
    monthKey: groupYm,
    amount: total,
    amountWords: amountWords(total),
    grouped: true,
    halfCourseMonth,
    lines: lines.map((l) => {
      const ln = {
        fee_type: l.fee_type,
        amount: l.amount,
        title: lineTitle(l.fee_type, payment.course_name),
        sub: lineSub(l, payment),
      };
      if (halfCourseMonth && l.fee_type === 'tuition') {
        ln.sub += ' · 50% fee — joined after the 15th';
      }
      return ln;
    }),
  };
}