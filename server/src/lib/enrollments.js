import { query } from '../db.js';
import { computeFeeStatus } from './fees.js';

/**
 * Fetch enrollments joined with student + course info and computed fee status.
 * @param {{student_id?: string, status?: string, due_only?: boolean}} filters
 */
export function fetchEnrollments(filters = {}) {
  const conds = [];
  const params = [];
  if (filters.student_id) {
    conds.push('e.student_id = ?');
    params.push(filters.student_id);
  }
  if (filters.status && filters.status !== 'all') {
    conds.push('e.status = ?');
    params.push(filters.status);
  }
  if (filters.due_only) {
    conds.push(`e.status = 'active'`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = query(
     `SELECT e.*,
            s.name AS student_name,
            s.phone AS student_phone,
            s.guardian_phone,
            c.name AS course_name,
            c.fee_mode,
            c.monthly_fee,
            c.duration_months,
            b.name AS batch_name,
            b.days AS batch_days,
            b.time AS batch_time,
            (SELECT COALESCE(SUM(amount), 0) FROM fee_payments fp WHERE fp.enrollment_id = e.id AND fp.fee_type = 'tuition') AS paid
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     ${where}
     ORDER BY e.created_at DESC, e.id DESC`,
    ...params,
  );

  const all = rows.map((r) => ({ ...r, fee: computeFeeStatus(r, r.paid) }));
  if (filters.due_only) return all.filter((e) => e.fee.due > 0);
  return all;
}

export function getEnrollmentWithFees(id) {
  const row = query(
     `SELECT e.*,
            s.name AS student_name,
            s.phone AS student_phone,
            s.guardian_phone,
            c.name AS course_name,
            c.fee_mode,
            c.monthly_fee,
            c.duration_months,
            b.name AS batch_name,
            b.days AS batch_days,
            b.time AS batch_time,
            (SELECT COALESCE(SUM(amount), 0) FROM fee_payments fp WHERE fp.enrollment_id = e.id AND fp.fee_type = 'tuition') AS paid
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     WHERE e.id = ?`,
    id,
  )[0];
  if (!row) return null;
  return { ...row, fee: computeFeeStatus(row, row.paid) };
}