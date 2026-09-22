import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { inr, fmtDate } from '../format.js';
import { Badge, Modal, Spinner, EmptyState } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import EnrollmentForm from '../components/EnrollmentForm.jsx';
import AdmissionCollect from '../components/AdmissionCollect.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Enrollments() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [admissionEnroll, setAdmissionEnroll] = useState(null);
  const [editCtx, setEditCtx] = useState(null);

  function load() {
    api
      .get(`/enrollments${status !== 'all' ? `?status=${status}` : ''}`)
      .then(setRows)
      .catch(() => {});
  }
  useEffect(load, [status]);

  async function createEnrollment(form) {
    if (editCtx) {
      const updated = await api.put(`/enrollments/${editCtx.id}`, {
        student_id: form.student_id,
        course_id: form.course_id || null,
        batch_id: form.batch_id || null,
        start_date: form.start_date,
        status: form.status,
        notes: form.notes,
      });
      toast('Enrollment updated.');
      setShowForm(false);
      setEditCtx(null);
      setAdmissionEnroll(updated);
      load();
      return;
    }
    const created = await api.post('/enrollments', form);
    toast('Enrollment added.');
    setShowForm(false);
    setAdmissionEnroll(created);
    load();
  }

  return (
    <>
      <div className="page-head">
        <h1>Enrollments</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={16} /> Add enrollment
        </button>
      </div>

      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="left">Left</option>
          <option value="all">All</option>
        </select>
      </div>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>No enrollments in this view.</EmptyState>
      ) : (
        <div className="card">
          <div className="tablewrap">
            <table className="stack-cards">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Batch</th>
                  <th>Started</th>
                  <th>Monthly</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Student">{e.student_name}</td>
                    <td data-label="Course">{e.course_name || '—'}</td>
                    <td data-label="Batch">{e.batch_name || e.batch || '—'}</td>
                    <td data-label="Started">{fmtDate(e.start_date)}</td>
                    <td data-label="Monthly">{inr(e.monthly_fee)}</td>
                    <td data-label="Paid">{inr(e.fee.paid)}</td>
                    <td data-label="Due">
                      <strong className={e.fee.due > 0 ? 'text-danger' : 'text-ok'}>{inr(e.fee.due)}</strong>
                    </td>
                    <td data-label="Status">
                      <Badge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <Modal
          title={editCtx ? 'Edit enrollment' : 'Add enrollment'}
          onClose={() => {
            setShowForm(false);
            setEditCtx(null);
          }}
        >
          <EnrollmentForm
            onSave={createEnrollment}
            initial={editCtx || null}
            submitLabel={editCtx ? 'Save' : 'Save & continue'}
          />
        </Modal>
      )}

      {admissionEnroll && (
        <AdmissionCollect
          enrollment={admissionEnroll}
          onClose={() => setAdmissionEnroll(null)}
          onBack={() => {
            setEditCtx(admissionEnroll);
            setAdmissionEnroll(null);
            setShowForm(true);
          }}
          onSaved={load}
        />
      )}
    </>
  );
}