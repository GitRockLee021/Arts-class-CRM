export function monthsBetween(startISO, now = new Date()) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return 0;
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) m -= 1;
  return Math.max(0, m);
}

export function formatMoney(amount) {
  return '₹' + (Math.round(Number(amount) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Everyone's monthly fee is due by this day of the month. */
export const MONTHLY_DUE_DAY = 5;
/** Students who join after this day of the month pay half the first month's fee. */
export const PRO_RATE_AFTER_DAY = 15;

/** First-month fee ratio: full month (1) or half month (0.5) for late joins. */
function firstMonthRatio(startISO) {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return 1;
  return d.getDate() > PRO_RATE_AFTER_DAY ? 0.5 : 1;
}

/**
 * Compute fee status for an enrollment.
 * @param {{monthly_fee:number, fee_mode:string, duration_months:number|null, start_date:string}} enrollment
 * @param {number} paidTotal
 * @returns {{expected:number, paid:number, due:number, dueDate:string|null, monthsElapsed:number}}
 */
export function computeFeeStatus(enrollment, paidTotal) {
  const monthly = Number(enrollment.monthly_fee) || 0;
  const mode = enrollment.fee_mode || 'monthly';
  const duration = Number(enrollment.duration_months) || Infinity;

  const elapsed = monthsBetween(enrollment.start_date);
  const monthsElapsed = mode === 'one_time' ? 1 : elapsed + 1;
  const ratio = mode === 'one_time' ? 1 : firstMonthRatio(enrollment.start_date);
  // Full-month equivalents: month N−1..2 are full, the starting month is prorated on late joins.
  const equivalents = Math.min(monthsElapsed - 1 + ratio, duration);
  const expectedTotal = equivalents * monthly;

  const paid = Number(paidTotal) || 0;
  const due = expectedTotal - paid;

  let dueDate = null;
  if (due > 0 && mode !== 'one_time') {
    const now = new Date();
    dueDate = new Date(now.getFullYear(), now.getMonth(), MONTHLY_DUE_DAY);
    if (now.getDate() > MONTHLY_DUE_DAY) {
      dueDate = new Date(now.getFullYear(), now.getMonth() + 1, MONTHLY_DUE_DAY);
    }
  }

  return {
    expected: expectedTotal,
    paid,
    due: Math.round(due * 100) / 100,
    dueDate,
    monthsElapsed,
  };
}