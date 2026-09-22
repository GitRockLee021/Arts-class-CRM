import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { inr, fmtDate } from '../format.js';
import { Badge, Spinner, EmptyState } from '../components/ui.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/stats').then(setData).catch(() => {});
  }, []);

  if (!data) return <Spinner />;

  const { counts, monthlyExpectation, dues, recentPayments } = data;

  const cards = [
    { label: 'Active students', value: counts.active_students, sub: `${counts.total_students} total` },
    { label: 'Active enrollments', value: counts.active_enrollments, sub: `${counts.total_enrollments} all time` },
    { label: 'Monthly fee expectation', value: inr(monthlyExpectation), money: true, sub: 'active batches' },
    { label: 'Collected this month', value: inr(counts.collected_this_month), money: true, sub: `last month: ${inr(counts.collected_last_month)}` },
    { label: 'Outstanding dues', value: inr(dues.total), money: true, sub: `${dues.count} students` },
  ];

  return (
    <>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <span className="stat-label">{c.label}</span>
            <strong className={`stat-value${c.money ? ' money' : ''}`}>
              {c.money ? (
                <>
                  <span className="cur">₹</span>
                  {c.value.slice(1)}
                </>
              ) : (
                c.value
              )}
            </strong>
            <span className="stat-sub">{c.sub}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Recent payments</h2>
          <Link className="btn btn-sm btn-ghost" to="/fees">
            View dues
          </Link>
        </div>
        {recentPayments.length === 0 ? (
          <EmptyState>No payments recorded yet.</EmptyState>
        ) : (
          <div className="tablewrap">
            <table className="stack-cards">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Student">{p.student_name}</td>
                    <td data-label="Course">{p.course_name || '—'}</td>
                    <td data-label="Amount">
                      <strong>{inr(p.amount)}</strong>
                    </td>
                    <td data-label="Date">{fmtDate(p.payment_date)}</td>
                    <td data-label="Method">
                      <Badge status={p.method} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}