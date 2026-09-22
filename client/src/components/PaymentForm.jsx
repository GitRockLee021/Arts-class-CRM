import { useState } from 'react';
import { today } from '../format.js';
import { Field, useForm } from './ui.jsx';

const METHODS = ['cash', 'upi', 'card', 'bank transfer', 'other'];
const FEE_TYPES = ['tuition', 'admission', 'kit', 'other'];

export default function PaymentForm({ defaultAmount, onSave, submitLabel = 'Record payment', defaultFeeType = 'tuition' }) {
  const { form, set } = useForm({
    amount: defaultAmount || '',
    payment_date: today(),
    method: 'cash',
    notes: '',
    fee_type: defaultFeeType,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...form, amount });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {error && <p className="form-error">{error}</p>}
      <Field label="Amount (₹) *">
        <input className="input" type="number" inputMode="decimal" min="1" value={form.amount} onChange={set('amount')} autoFocus />
      </Field>
      <Field label="Payment date *">
        <input className="input" type="date" value={form.payment_date} onChange={set('payment_date')} />
      </Field>
      <Field label="Fee type">
        <select className="input" value={form.fee_type} onChange={set('fee_type')}>
          {FEE_TYPES.map((t) => (
            <option key={t} value={t}>
              {(t.charAt(0).toUpperCase() + t.slice(1))}
              {t === 'tuition' ? ' (monthly course fee)' : t === 'other' ? ' (miscellaneous)' : ' (one-time)'}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Method">
        <select className="input" value={form.method} onChange={set('method')}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" className="span-2">
        <input className="input" value={form.notes} onChange={set('notes')} placeholder="optional" />
      </Field>
      <div className="row end span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}