import { PRO_RATE_AFTER_DAY } from './fees.js';

/** Parse 'YYYY-MM' into { y, mo, key } or null. */
export function parseYm(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, mo, key: `${y}-${String(mo).padStart(2, '0')}` };
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fee amount attributable to a single calendar month for an enrollment.
 * The starting month is prorated for late joins; `duration_months` caps the total.
 */
export function expectedForMonth(enrollment, ym) {
  const monthly = Number(enrollment.monthly_fee || 0);
  if (!monthly) return 0;

  const start = new Date(enrollment.start_date);
  if (Number.isNaN(start.getTime())) return 0;

  const startKey = monthKeyOf(start);
  if (ym.key < startKey) return 0;
  const monthsFromStart = (ym.y - start.getFullYear()) * 12 + (ym.mo - (start.getMonth() + 1));

  if (enrollment.fee_mode === 'one_time') {
    return monthsFromStart === 0 ? monthly : 0;
  }

  const duration = Number(enrollment.duration_months) || Infinity;
  if (monthsFromStart >= duration) return 0;

  const ratio = start.getDate() > PRO_RATE_AFTER_DAY ? 0.5 : 1;
  return monthsFromStart === 0 ? monthly * ratio : monthly;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Unpaid fees become overdue from this day (due on the 5th + 3-day grace). */
export const OVERDUE_DAY = 8;

/**
 * Work out what an enrollment actually owes in overdue fees, month by month.
 * A month's shortfall is only overdue once we are on/after the 8th of that month
 * (earlier months are always overdue). Returns null when nothing is overdue.
 *
 * @param {object} enrollment  needs monthly_fee / fee_mode / duration_months / start_date
 * @param {Map<string, number>} paidByMonth  'YYYY-MM' → amount paid in that month
 * @param {Date} now
 * @returns {{amount:number, months:number, daysLate:number, since:string}|null}
 */
export function enrollmentOverdue(enrollment, paidByMonth, now = new Date()) {
  const start = new Date(enrollment.start_date);
  if (Number.isNaN(start.getTime())) return null;

  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  let amount = 0;
  let months = 0;
  let oldest = null;

  while (y < curY || (y === curY && m <= curM)) {
    const ym = { y, mo: m, key: `${y}-${pad2(m)}` };
    const expected = expectedForMonth(enrollment, ym);
    if (expected > 0) {
      const paid = Number(paidByMonth.get(ym.key) || 0);
      const shortfall = expected - paid;
      const overdueFrom = new Date(y, m - 1, OVERDUE_DAY);
      const isPast = y < curY || (y === curY && m < curM);
      if (shortfall > 0.5 && (isPast || today >= overdueFrom)) {
        amount += shortfall;
        months += 1;
        if (!oldest) oldest = overdueFrom;
      }
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  if (!oldest) return null;
  const daysLate = Math.round((today - oldest) / 86400000) + 1;
  return { amount: round2(amount), months, daysLate, since: `${oldest.getFullYear()}-${pad2(oldest.getMonth() + 1)}-${pad2(oldest.getDate())}` };
}

/**
 * Month-level fee report over a list of enrollments (each carrying
 * monthly_fee / fee_mode / duration_months / start_date / paidInMonth).
 * Returns paid = what was recorded for the month, outstanding = unpaid remainder.
 */
export function monthReport(enrollments, ymInput) {
  const ym = typeof ymInput === 'string' ? parseYm(ymInput) : ymInput;
  if (!ym) return { expected: 0, paid: 0, outstanding: 0, count: 0, total: 0, paidCount: 0, pct: 0 };

  let expected = 0;
  let paid = 0;
  let outstanding = 0;
  let count = 0;
  let total = 0;
  let paidCount = 0;

  for (const e of enrollments) {
    const exp = expectedForMonth(e, ym);
    const p = Number(e.paidInMonth || 0);
    const o = Math.max(exp - p, 0);
    expected += exp;
    paid += p;
    outstanding += o;
    if (exp > 0) total += 1;
    if (o > 0) count += 1;
    if (exp > 0 && o === 0) paidCount += 1;
  }

  return {
    expected: round2(expected),
    paid: round2(paid),
    outstanding: round2(outstanding),
    count,
    total,
    paidCount,
    pct: expected > 0 ? Math.round((paid / expected) * 100) : 0,
  };
}