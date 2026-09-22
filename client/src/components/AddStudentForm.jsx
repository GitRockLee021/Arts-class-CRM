import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, FieldError, PHONE_RE, useForm } from './ui.jsx';

export default function AddStudentForm({
  onSave,
  onCancel,
  initial = null,
  enrollment = null,
  submitLabel = 'Save',
}) {
  const editing = Boolean(initial);
  const { form, set } = useForm({
    name: initial?.name || '',
    age: initial?.age ?? '',
    phone: initial?.phone || '',
    guardian_name: initial?.guardian_name || '',
    course_id: enrollment?.course_id ? String(enrollment.course_id) : '',
    date_of_admission: initial?.date_of_admission || '',
    batch_id: enrollment?.batch_id ? String(enrollment.batch_id) : '',
  });
  const [courses, setCourses] = useState(null);
  const [batches, setBatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    api.get('/courses').then(setCourses).catch(() => {});
    api.get('/batches').then((data) => setBatches(data.batches || [])).catch(() => {});
  }, []);

  function validateFields(mode) {
    const fe = {};
    if (!form.name.trim()) fe.name = 'Full name is required.';
    if (!form.phone.trim()) fe.phone = 'Phone (WhatsApp) is required.';
    else if (!PHONE_RE.test(form.phone.trim())) fe.phone = 'Phone must be exactly 10 digits.';
    if (!form.date_of_admission) fe.date_of_admission = 'Date of admission is required.';
    if (mode === 'save') {
      const age = Number(form.age);
      if (!form.age || !Number.isInteger(age) || age < 3 || age > 120) fe.age = 'Please enter a valid age.';
      if (!editing && !form.course_id) fe.course_id = 'Select a course to enroll in.';
      if (!editing && !form.batch_id) fe.batch_id = 'Select a batch to enroll in.';
    }
    return fe;
  }

  function blurField(key) {
    const fe = validateFields('blur');
    setFieldErrors((prev) => ({ ...prev, [key]: fe[key] || '' }));
  }

  function changeField(key) {
    return (e) => {
      set(key)(e);
      setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    };
  }

  async function submit(e, mode) {
    e.preventDefault();
    const fe = validateFields(mode);
    setFieldErrors(fe);
    if (Object.values(fe).some(Boolean)) return;
    setError('');
    setBusy(true);
    try {
      await onSave(
        {
          name: form.name.trim(),
          age: form.age ? Number(form.age) : null,
          phone: form.phone.trim(),
          guardian_name: form.guardian_name.trim() || null,
          course_id: form.course_id || null,
          date_of_admission: form.date_of_admission,
          batch_id: form.batch_id || null,
        },
        mode,
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const courseOptions = (courses || []).filter((c) => c.status !== 'inactive');
  const batchOptions = (batches || []).filter((b) => b.status === 'active');

  return (
    <form className="form-grid" onSubmit={(e) => submit(e, 'save')}>
      {error && <p className="form-error">{error}</p>}

      <Field label="Full name *">
        <input className="input" value={form.name} onChange={changeField('name')} onBlur={() => blurField('name')} placeholder="e.g. Aarav Sharma" />
        <FieldError>{fieldErrors.name}</FieldError>
      </Field>
      <Field label="Age *">
        <input
          className="input"
          type="number"
          min="3"
          max="120"
          value={form.age}
          onChange={changeField('age')}
          onBlur={() => blurField('age')}
          placeholder="e.g. 12"
          inputMode="numeric"
        />
        <FieldError>{fieldErrors.age}</FieldError>
      </Field>
      <Field label="Phone (WhatsApp) *">
        <input className="input" value={form.phone} onChange={changeField('phone')} onBlur={() => blurField('phone')} placeholder="e.g. 9876543210" inputMode="tel" maxLength={10} />
        <FieldError>{fieldErrors.phone}</FieldError>
      </Field>
      <Field label="Parent name">
        <input className="input" value={form.guardian_name} onChange={set('guardian_name')} placeholder="Parent name" />
      </Field>
      <Field label="Date of admission *">
        <input className="input" type="date" value={form.date_of_admission} onChange={changeField('date_of_admission')} onBlur={() => blurField('date_of_admission')} />
        <FieldError>{fieldErrors.date_of_admission}</FieldError>
      </Field>
      <Field label="Course *" hint={editing ? 'Only shown when adding. Edit course under Enrollments.' : ''}>
        {courseOptions.length === 0 ? (
          <span className="muted">No courses yet — add one under Courses first.</span>
        ) : (
          <select className="input" value={form.course_id} onChange={changeField('course_id')} onBlur={() => blurField('course_id')} disabled={editing}>
            <option value="">Select course…</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.monthly_fee}/mo
              </option>
            ))}
          </select>
        )}
        <FieldError>{fieldErrors.course_id}</FieldError>
      </Field>
      <Field label="Batch *" hint={editing ? 'Only shown when adding. Edit batch under Enrollments.' : ''}>
        {batchOptions.length === 0 ? (
          <span className="muted">No batches yet — add one under Batches first.</span>
        ) : (
          <select className="input" value={form.batch_id} onChange={changeField('batch_id')} onBlur={() => blurField('batch_id')} disabled={editing}>
            <option value="">Select batch…</option>
            {batchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.days || b.time ? ` — ${[b.days, b.time].filter(Boolean).join(' · ')}` : ''}
              </option>
            ))}
          </select>
        )}
        <FieldError>{fieldErrors.batch_id}</FieldError>
      </Field>

      <div className="row end span-2 form-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {!editing && (
          <button
            type="button"
            className="btn"
            disabled={busy || !courses || !batches}
            onClick={(e) => submit(e, 'draft')}
            title="Save a partial record without enrolling"
          >
            {busy ? 'Saving…' : 'Save as draft'}
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !courses || !batches}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}