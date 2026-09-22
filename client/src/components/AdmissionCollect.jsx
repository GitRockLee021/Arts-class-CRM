import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { inr, today } from '../format.js';
import { Modal, Field, Spinner } from './ui.jsx';
import { useToast } from './Toast.jsx';

const METHODS = ['cash', 'upi', 'card', 'bank transfer', 'other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function proratedFirstMonthFee(monthlyFee, startDate) {
  const d = new Date(startDate);
  const ratio = !Number.isNaN(d.getTime()) && d.getDate() > 15 ? 0.5 : 1;
  return Math.round((Number(monthlyFee) || 0) * ratio);
}

export default function AdmissionCollect({ enrollment, onClose, onSaved, onBack }) {
  const toast = useToast();
  const [courses, setCourses] = useState(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [courseOn, setCourseOn] = useState(true);
  const [tuition, setTuition] = useState('');
  const [admissionOn, setAdmissionOn] = useState(true);
  const [admission, setAdmission] = useState('');
  const [kitOn, setKitOn] = useState(true);
  const [kit, setKit] = useState('');

  useEffect(() => {
    api
      .get('/courses')
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  const course = useMemo(() => (courses || []).find((c) => Number(c.id) === Number(enrollment?.course_id)), [courses, enrollment]);
  const kitNa = !course || course.kit_fee == null;

  useEffect(() => {
    if (enrollment) setTuition(String(proratedFirstMonthFee(enrollment.monthly_fee, enrollment.start_date)));
  }, [enrollment]);
  useEffect(() => {
    if (course) setAdmission(String(course.admission_fee || 0));
  }, [course]);
  useEffect(() => {
    if (course && !kitNa) setKit(String(course.kit_fee || 0));
  }, [course, kitNa]);

  const start = new Date(enrollment.start_date);
  const monthLabel = Number.isNaN(start.getTime())
    ? ''
    : `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;

  const amountOf = (v) => Math.round(Number(v) * 100) / 100 || 0;
  const total =
    (courseOn ? amountOf(tuition) : 0) +
    (admissionOn ? amountOf(admission) : 0) +
    (kitOn ? amountOf(kit) : 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!courseOn && !admissionOn && !kitOn) {
      setError('Select at least one fee to collect.');
      return;
    }
    if (total <= 0) {
      setError('Enter valid amounts — total must be greater than ₹0.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/enrollments/${enrollment.id}/admission`, {
        payment_date: paymentDate,
        method,
        notes: notes.trim() || null,
        tuition: courseOn ? { amount: amountOf(tuition) } : null,
        admission: admissionOn ? { amount: amountOf(admission) } : null,
        kit: kitOn ? { amount: amountOf(kit) } : null,
      });
      toast(`${enrollment.student_name}'s admission fees recorded — receipt sent to parent.`);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!enrollment) return null;

  return (
    <Modal
      title={`Collect on admission — ${enrollment.student_name}`}
      onClose={onClose}
      footer={
        <div className="row between">
          <button className="btn btn-ghost" disabled={busy} onClick={() => (onBack ? onBack() : onClose())}>
            ← Back
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Recording…' : `Collect ${inr(total)}`}
          </button>
        </div>
      }
    >
      {!courses ? (
        <Spinner />
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <p className="muted span-2" style={{ margin: 0 }}>
            Course: <strong>{enrollment.course_name || '—'}</strong> — all collected now share one receipt and are
            never part of monthly dues.
          </p>
          {error && <p className="form-error span-2">{error}</p>}

          <div className="pay-lines span-2">
            <div className="pay-line">
              <label className="pay-check">
                <input type="checkbox" checked={courseOn} onChange={(e) => setCourseOn(e.target.checked)} />
              </label>
              <div className="pay-line-main">
                <span className="pay-line-title">First month course fee</span>
                <span className="pay-line-sub">
                  Course fee — {monthLabel} ({Number(enrollment.monthly_fee) || 0}/mo
                  {new Date(enrollment.start_date).getDate() > 15 ? ' · prorated for late join' : ''})
                </span>
              </div>
              <input
                className="input pay-line-amt"
                type="number"
                min="0"
                disabled={!courseOn}
                value={tuition}
                onChange={(e) => setTuition(e.target.value)}
              />
            </div>

            <div className="pay-line">
              <label className="pay-check">
                <input type="checkbox" checked={admissionOn} onChange={(e) => setAdmissionOn(e.target.checked)} />
              </label>
              <div className="pay-line-main">
                <span className="pay-line-title">Admission fee</span>
                <span className="pay-line-sub">One-time admission fee — {enrollment.course_name || 'course'}</span>
              </div>
              <input
                className="input pay-line-amt"
                type="number"
                min="0"
                disabled={!admissionOn}
                value={admission}
                onChange={(e) => setAdmission(e.target.value)}
              />
            </div>

            <div className="pay-line">
              <label className="pay-check">
                <input type="checkbox" checked={kitOn} onChange={(e) => setKitOn(e.target.checked)} />
              </label>
              <div className="pay-line-main">
                <span className="pay-line-title">Kit fee</span>
                {kitNa ? (
                  <span className="pay-line-sub">Not applicable for {enrollment.course_name} — kit procured on MRP if requested</span>
                ) : (
                  <span className="pay-line-sub">{enrollment.course_name} kit</span>
                )}
              </div>
              <input
                className="input pay-line-amt"
                type="number"
                min="0"
                disabled={!kitOn || kitNa}
                value={kit}
                onChange={(e) => setKit(e.target.value)}
              />
            </div>
          </div>

          <p className="pay-total span-2">
            Total to collect <strong>{inr(total)}</strong>
          </p>

          <Field label="Payment date *">
            <input className="input" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
          <Field label="Method">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="span-2">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </Field>
        </form>
      )}
    </Modal>
  );
}