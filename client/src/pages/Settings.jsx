import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, useForm, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Settings() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const { form, set } = useForm({ phone: '' });
  const [testing, setTesting] = useState(false);

  function load() {
    api.get('/reminders/status').then(setStatus).catch(() => {});
  }
  useEffect(load, []);

  async function sendTest(e) {
    e.preventDefault();
    if (!form.phone.trim()) return;
    setTesting(true);
    try {
      const result = await api.post('/reminders/test', { phone: form.phone.trim() });
      toast(result.message || 'Test message sent.', result.status === 'error' ? 'error' : 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!status) return <Spinner />;

  const rows = [
    ['Status', status.configured ? 'Configured' : 'Not configured'],
    ['Phone number ID', status.phoneNumberId || '—'],
    ['Access token', status.hasAccessToken ? 'Set' : '—'],
    ['Template language', status.templateLanguage || '—'],
    ['Country code', status.countryCode || '—'],
    ['Mode', status.dryRun ? 'Dry-run (logs only)' : 'Live'],
    ['Razorpay', status.razorpayConfigured ? 'Configured' : 'Not configured'],
    ['Razorpay webhook', status.razorpayWebhookConfigured ? 'Configured' : 'Not configured'],
  ];

  return (
    <>
      <h1>Settings</h1>

      <h2>WhatsApp Business API</h2>
      <div className="card">
        <div className="info-grid">
          {rows.map(([label, value]) => (
            <div key={label}>
              <span className="kv-label">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <p className="muted note">
          Credentials come from the <code>server/.env</code> file (copy <code>.env.example</code>). No keys are stored
          in the database.
        </p>
      </div>

      <h2>Send a test message</h2>
      <form className="card form-grid" onSubmit={sendTest}>
        <Field label="WhatsApp number (with country code)">
          <input
            className="input"
            value={form.phone}
            onChange={set('phone')}
            placeholder="e.g. 919876543210"
            inputMode="tel"
          />
        </Field>
        <div className="row end">
          <button className="btn btn-primary" disabled={testing || !form.phone.trim()}>
            {testing ? 'Sending…' : 'Send test message'}
          </button>
        </div>
      </form>

      <h2>How it works</h2>
      <div className="card how">
        <ol>
          <li>
            Create a Meta app and get a WhatsApp test number at{' '}
            <code>developers.facebook.com</code> (WhatsApp Cloud API guide).
          </li>
          <li>
            Create a template named <code>fee_reminder</code> with 4 body variables (name, amount, due date, batch)
            and one <strong>URL button "Pay Now"</strong> whose website URL is <code>https://rzp.io/{'{{1}}'}</code>.
          </li>
          <li>
            Put <code>WHATSAPP_PHONE_NUMBER_ID</code>, <code>WHATSAPP_ACCESS_TOKEN</code>,{' '}
            <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in <code>server/.env</code>.
          </li>
          <li>
            Set <code>WHATSAPP_DRY_RUN=false</code> to start sending real messages.
          </li>
          <li>
            Open <strong>Fees & Dues</strong> and hit <strong>Remind all</strong>. Each reminder gets its own Razorpay
            payment link, so the parent can tap <strong>Pay Now</strong> and settle directly.
          </li>
        </ol>
      </div>
    </>
  );
}