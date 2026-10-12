import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { inr, fmtDate } from '../format.js';
import { Badge, Spinner, EmptyState, Modal } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import AddStudentForm from '../components/AddStudentForm.jsx';
import AdmissionCollect from '../components/AdmissionCollect.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Dashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [lastStudent, setLastStudent] = useState(null);
  const [admissionEnroll, setAdmissionEnroll] = useState(null);

  function load() {
    api.get('/stats').then(setData).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function createStudent(form, mode) {
    const student = await api.post('/students', {
      name: form.name,
      age: form.age,
      phone: form.phone,
      guardian_name: form.guardian_name,
      date_of_admission: form.date_of_admission,
      status: mode === 'draft' ? 'draft' : 'active',
    });
    if (mode === 'save' && form.course_id) {
      const enrollment = await api.post('/enrollments', {
        student_id: student.id,
        course_id: form.course_id,
        batch_id: form.batch_id || null,
        start_date: form.date_of_admission,
        status: 'active',
      });
      toast('Student added and enrolled.');
      setLastStudent(student);
      setAdmissionEnroll(enrollment);
    } else {
      toast('Draft saved.');
    }
    setShowForm(false);
    load();
  }

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
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> Add student
          </button>
        </div>
      </div>
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

      {showForm && (
        <Modal title="Add student" onClose={() => setShowForm(false)}>
          <AddStudentForm
            onSave={createStudent}
            onCancel={() => setShowForm(false)}
            submitLabel="Save & continue"
          />
        </Modal>
      )}

      {admissionEnroll && (
        <AdmissionCollect
          enrollment={admissionEnroll}
          onClose={() => {
            setAdmissionEnroll(null);
            setLastStudent(null);
          }}
          onSaved={load}
        />
      )}
    </>
  );
}
