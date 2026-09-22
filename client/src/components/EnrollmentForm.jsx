import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { today } from '../format.js';
import { Field, useForm } from './ui.jsx';

export default function EnrollmentForm({ initial, fixedStudentId, onSave, submitLabel = 'Save enrollment' }) {
  const { form, set, setRaw, setForm } = useForm({
    student_id: initial?.student_id || fixedStudentId || '',
    course_id: initial?.course_id || '',
    batch_id: initial?.batch_id ? String(initial.batch_id) : '',
    start_date: initial?.start_date || today(),
    status: initial?.status || 'active',
    notes: initial?.notes || '',
  });
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/students?status=all')
      .then(setStudents)
      .catch(() => {});
    api
      .get('/courses')
      .then(setCourses)
      .catch(() => {});
    api
      .get('/batches')
      .then((data) => setBatches((data.batches || []).filter((b) => b.status === 'active')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initial?.batch_id) setRaw('batch_id', String(initial.batch_id));
  }, [initial?.batch_id]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.student_id || !form.start_date) {
      setError('Student and start date are required.');
      return;
    }
    setBusy(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {error && <p className="form-error">{error}</p>}
      <Field label="Student *">
        <select
          className="input"
          value={form.student_id}
          onChange={(e) => setRaw('student_id', e.target.value)}
          disabled={Boolean(fixedStudentId)}
        >
          <option value="">Select student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Course">
        <select
          className="input"
          value={form.course_id}
          onChange={(e) => setRaw('course_id', e.target.value)}
        >
          <option value="">No course</option>
          {courses.filter((c) => c.status !== 'inactive').map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.monthly_fee}/mo
            </option>
          ))}
        </select>
      </Field>
      <Field label="Batch / schedule">
        {batches.length === 0 ? (
          <span className="muted">No batches yet — add one under Batches.</span>
        ) : (
          <select className="input" value={form.batch_id} onChange={set('batch_id')}>
            <option value="">No batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.days || b.time ? ` — ${[b.days, b.time].filter(Boolean).join(' · ')}` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Start date *">
        <input className="input" type="date" value={form.start_date} onChange={set('start_date')} />
      </Field>
      <Field label="Status">
        <select className="input" value={form.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="left">Left</option>
        </select>
      </Field>
      <Field label="Notes" className="span-2">
        <textarea className="input" rows="2" value={form.notes} onChange={set('notes')} />
      </Field>
      <div className="row end span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}