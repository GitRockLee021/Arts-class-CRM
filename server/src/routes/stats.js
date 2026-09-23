import { Router } from 'express';
import { get, query } from '../db.js';
import { fetchEnrollments } from '../lib/enrollments.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();

router.get(
  '/',
  ah(async (req, res) => {
    const totals = await get(`
      SELECT
        (SELECT COUNT(*)::int FROM students)                          AS total_students,
        (SELECT COUNT(*)::int FROM students WHERE status = 'active')  AS active_students,
        (SELECT COUNT(*)::int FROM courses)                           AS total_courses,
        (SELECT COUNT(*)::int FROM enrollments)                       AS total_enrollments,
        (SELECT COUNT(*)::int FROM enrollments WHERE status = 'active') AS active_enrollments,
        (SELECT COALESCE(SUM(amount), 0) FROM fee_payments)             AS collected_all_time,
        (SELECT COALESCE(SUM(amount), 0) FROM fee_payments
           WHERE substr(payment_date, 1, 7) = to_char(CURRENT_DATE, 'YYYY-MM')) AS collected_this_month,
        (SELECT COALESCE(SUM(amount), 0) FROM fee_payments
           WHERE substr(payment_date, 1, 7) = to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM')) AS collected_last_month
    `);

    const enrollments = await fetchEnrollments({ status: 'active' });
    const activeEnrollments = enrollments.filter((e) => e.status === 'active');
    const dues = activeEnrollments.filter((e) => e.fee.due > 0);
    const monthlyExpectation = activeEnrollments.reduce((s, e) => s + (Number(e.monthly_fee) || 0), 0);

    const recentPayments = await query(
      `SELECT fp.*, s.name AS student_name, c.name AS course_name
       FROM fee_payments fp
       JOIN enrollments e ON e.id = fp.enrollment_id
       JOIN students s ON s.id = e.student_id
       LEFT JOIN courses c ON c.id = e.course_id
       ORDER BY fp.id DESC
       LIMIT 6`,
    );

    res.json({
      counts: totals,
      monthlyExpectation,
      dues: { count: dues.length, total: dues.reduce((s, e) => s + e.fee.due, 0) },
      recentPayments,
    });
  }),
);

export default router;