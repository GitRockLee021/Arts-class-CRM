import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { inr } from '../format.js';
import { Badge, Modal, Spinner, EmptyState, Field, useForm, Confirm } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Courses() {
  const toast = useToast();
  const [courses, setCourses] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const formState = useForm({
    name: '',
    fee_mode: 'monthly',
    monthly_fee: '',
    duration_months: '',
    description: '',
    status: 'active',
    admission_fee: '',
    kit_fee: '',
    sort_order: '',
  });
  const { form, set } = formState;

  function load() {
    api.get('/courses').then(setCourses).catch(() => {});
  }
  useEffect(load, []);

  function openCreate() {
    formState.setForm({ name: '', fee_mode: 'monthly', monthly_fee: '', duration_months: '', description: '', status: 'active', admission_fee: '', kit_fee: '', sort_order: '' });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(c) {
    formState.setForm({
      name: c.name,
      fee_mode: c.fee_mode,
      monthly_fee: c.monthly_fee,
      duration_months: c.duration_months || '',
      description: c.description || '',
      status: c.status || 'active',
      admission_fee: c.admission_fee ?? '',
      kit_fee: c.kit_fee ?? '',
      sort_order: c.sort_order ?? '',
    });
    setEditing(c);
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/courses/${editing.id}`, form);
        toast('Course updated.');
      } else {
        await api.post('/courses', form);
        toast('Course added.');
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function remove(c) {
    try {
      await api.del(`/courses/${c.id}`);
      toast('Course deleted.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Courses</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Add course
        </button>
      </div>

      {!courses ? (
        <Spinner />
      ) : courses.length === 0 ? (
        <EmptyState>
          No courses yet.
          <button className="btn btn-primary" onClick={openCreate}>
            Add your first course
          </button>
        </EmptyState>
      ) : (
        <div className="card">
          <div className="tablewrap">
            <table className="stack-cards">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Fee</th>
                  <th>Admission / Kit</th>
                  <th>Duration</th>
                  <th>Active batches</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Course">
                      <strong>{c.name}</strong>
                      {c.description && <span className="muted block">{c.description}</span>}
                    </td>
                    <td data-label="Fee">
                      {inr(c.monthly_fee)}
                      <span className="muted"> / {c.fee_mode === 'one_time' ? 'one time' : 'month'}</span>
                    </td>
                    <td data-label="Admission / Kit">
                      {inr(c.admission_fee || 0)} admission
                      <span className="muted block">
                        {c.kit_fee == null ? 'Kit on MRP' : `${inr(c.kit_fee)} kit`}
                      </span>
                    </td>
                    <td data-label="Duration">{c.duration_months ? `${c.duration_months} months` : '—'}</td>
                    <td data-label="Active batches">{c.active_enrollments}</td>
                    <td data-label="Status">
                      <Badge status={c.status || 'active'} />
                    </td>
                    <td data-label="Actions">
                      <div className="row">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>
                          Edit
                        </button>
                        {c.enrollments > 0 ? (
                          <button className="btn btn-sm btn-ghost" disabled title="Cannot delete — remove all students from this course first.">
                            Delete
                          </button>
                        ) : (
                          <Confirm message="Delete this course?" onConfirm={() => remove(c)}>
                            Delete
                          </Confirm>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Edit course' : 'Add course'} onClose={() => setShowForm(false)}>
          <form className="form-grid" onSubmit={submit}>
            <Field label="Course name *">
              <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Charcoal & Pencil" />
            </Field>
            <Field label="Fee mode">
              <select className="input" value={form.fee_mode} onChange={set('fee_mode')}>
                <option value="monthly">Monthly</option>
                <option value="one_time">One time</option>
              </select>
            </Field>
            <Field label={form.fee_mode === 'one_time' ? 'Total fee (₹) *' : 'Monthly fee (₹) *'}>
              <input className="input" type="number" min="0" value={form.monthly_fee} onChange={set('monthly_fee')} />
            </Field>
            <Field label="Admission fee (₹)" hint="One-time fee collected at admission.">
              <input className="input" type="number" min="0" value={form.admission_fee} onChange={set('admission_fee')} placeholder="0" />
            </Field>
            <Field label="Kit fee (₹)" hint="Leave blank when kit is procured on MRP.">
              <input className="input" type="number" min="0" value={form.kit_fee} onChange={set('kit_fee')} placeholder="optional" />
            </Field>
            <Field label="Level / order" hint="1 = beginner. Orders the course ladder.">
              <input className="input" type="number" min="1" value={form.sort_order} onChange={set('sort_order')} placeholder="optional" />
            </Field>
            <Field label="Duration (months)">
              <input className="input" type="number" min="1" value={form.duration_months} onChange={set('duration_months')} placeholder="optional" />
            </Field>
            <Field label="Description" className="span-2">
              <textarea className="input" rows="2" value={form.description} onChange={set('description')} />
            </Field>
            <Field label="Status" hint="Inactive courses cannot have new students added.">
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <div className="row end span-2">
              <button className="btn btn-primary">{editing ? 'Save changes' : 'Add course'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}