import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Modal, Spinner, EmptyState, Field, useForm, Confirm } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY = { name: '', course_id: '', days: '', time: '', status: 'active' };

function schedule(b) {
  const parts = [];
  if (b.days) parts.push(b.days);
  if (b.time) parts.push(b.time);
  return parts.join(' · ');
}

export default function Batches() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [assignments, setAssignments] = useState({});
  const [saving, setSaving] = useState(false);
  const formState = useForm(EMPTY);
  const { form, set } = formState;

  function load() {
    api.get('/batches').then(setData).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    api.get('/courses').then(setCourses).catch(() => {});
  }, []);

  function openCreate() {
    formState.setForm(EMPTY);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(b) {
    formState.setForm({
      name: b.name,
      course_id: b.course_id ? String(b.course_id) : '',
      days: b.days || '',
      time: b.time || '',
      status: b.status || 'active',
    });
    setEditing(b);
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const body = {
        name: form.name.trim(),
        course_id: form.course_id || null,
        days: form.days.trim() || null,
        time: form.time.trim() || null,
        status: form.status,
      };
      if (editing) {
        await api.put(`/batches/${editing.id}`, body);
        toast('Batch updated.');
      } else {
        await api.post('/batches', body);
        toast('Batch added.');
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function remove(b) {
    try {
      await api.del(`/batches/${b.id}`);
      toast('Batch deleted. Students in it were unassigned.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openUnassigned() {
    setAssignments({});
    setShowUnassigned(true);
  }

  function setAssign(enrollmentId, batchId) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (batchId) next[enrollmentId] = batchId;
      else delete next[enrollmentId];
      return next;
    });
  }

  async function saveAssignments() {
    const entries = Object.entries(assignments);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      let n = 0;
      for (const [enrollmentId, batchId] of entries) {
        await api.put(`/enrollments/${enrollmentId}`, { batch_id: batchId });
        n++;
      }
      toast(`Assigned ${n} student${n === 1 ? '' : 's'}.`);
      setShowUnassigned(false);
      setAssignments({});
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openStudent(id) {
    window.open(`/students/${id}`, '_blank');
  }

  const { batches = [], unassigned = [], counts = {} } = data || {};
  const activeBatches = batches.filter((b) => b.status === 'active');

  return (
    <>
      <div className="page-head">
        <h1>Batches</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Add batch
        </button>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="stat-grid summary">
            <div className="card stat">
              <span className="stat-label">Total batches</span>
              <span className="stat-value">{counts.total}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Active now</span>
              <span className="stat-value">{counts.active}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Students in batches</span>
              <span className="stat-value">{counts.students}</span>
            </div>
            {counts.unassigned > 0 ? (
              <div className="card stat" style={{ cursor: 'pointer' }} onClick={openUnassigned}>
                <span className="stat-label">Without a batch</span>
                <span className="stat-value">{counts.unassigned}</span>
                <span className="stat-sub" style={{ color: 'var(--brand)', fontWeight: 700 }}>
                  View students →
                </span>
              </div>
            ) : (
              <div className="card stat">
                <span className="stat-label">Without a batch</span>
                <span className="stat-value">{counts.unassigned}</span>
              </div>
            )}
          </div>

          {batches.length === 0 ? (
            <EmptyState>
              No batches yet.
              <button className="btn btn-primary" onClick={openCreate}>
                Add your first batch
              </button>
            </EmptyState>
          ) : (
            <div className="card">
              <div className="tablewrap">
                <table className="stack-cards">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Course</th>
                      <th>Schedule</th>
                      <th>Students</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td data-label="Batch">
                          <strong>{b.name}</strong>
                        </td>
                        <td data-label="Course">{b.course_name || <span className="muted">No course</span>}</td>
                        <td data-label="Schedule">{schedule(b) || <span className="muted">—</span>}</td>
                        <td data-label="Students">{b.students}</td>
                        <td data-label="Status">
                          <Badge status={b.status === 'active' ? 'active' : 'closed'} />
                        </td>
                        <td data-label="Actions">
                          <div className="row">
                            <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>
                              Edit
                            </button>
                            <Confirm
                              message={`Delete "${b.name}"? Students enrolled in it will be unassigned (no batch).`}
                              onConfirm={() => remove(b)}
                            >
                              Delete
                            </Confirm>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <Modal title={editing ? 'Edit batch' : 'Add batch'} onClose={() => setShowForm(false)}>
          <form className="form-grid" onSubmit={submit}>
            <Field label="Batch name *">
              <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Weekday Morning" />
            </Field>
            <Field label="Course">
              <select className="input" value={form.course_id} onChange={set('course_id')}>
                <option value="">No course</option>
                {courses.filter((c) => c.status !== 'inactive').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Days">
              <input className="input" value={form.days} onChange={set('days')} placeholder="e.g. Mon, Wed & Fri" />
            </Field>
            <Field label="Time">
              <input className="input" value={form.time} onChange={set('time')} placeholder="e.g. 9:30 AM" />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
            <div className="row end span-2">
              <button className="btn btn-primary">{editing ? 'Save changes' : 'Add batch'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showUnassigned && (
        <Modal
          title="Unassigned students (no batch)"
          onClose={() => setShowUnassigned(false)}
          footer={
            <div className="row end">
              <button className="btn btn-ghost" onClick={() => setShowUnassigned(false)} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveAssignments}
                disabled={saving || Object.keys(assignments).length === 0}
              >
                {saving ? 'Saving…' : `Save assignment${Object.keys(assignments).length === 1 ? '' : 's'}`}
              </button>
            </div>
          }
        >
          {unassigned.length === 0 ? (
            <EmptyState>Everyone has a batch assigned.</EmptyState>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Assign batch</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map((u) => {
                    return (
                      <tr key={u.enrollment_id}>
                        <td>
                          <strong>{u.name}</strong>
                          <span className="muted block">{u.course_name || 'No course'} · {u.phone}</span>
                        </td>
                        <td>
                          <select
                            className="input"
                            value={assignments[u.enrollment_id] || ''}
                            onChange={(e) => setAssign(u.enrollment_id, e.target.value)}
                            aria-label={`Assign batch for ${u.name}`}
                          >
                            <option value="">Leave unassigned…</option>
                            {activeBatches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} — {schedule(b) || 'open'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => openStudent(u.student_id)}>
                            View student →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}