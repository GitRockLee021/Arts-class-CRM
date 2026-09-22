import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function ForgotPassword({ onBack }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', {
        email,
        recovery_key: recoveryKey,
        new_password: password,
      });
      setDone(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <div className="auth-brand">
            <strong>Pravaha Art Space CRM</strong>
          </div>
          <p className="center">Password reset complete.</p>
          <button className="btn btn-primary btn-lg" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <strong>Forgot password</strong>
        </div>
        <p className="muted center">
          Enter the email of your account and the recovery key you saved when it was created, then choose a new
          password.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Recovery key</span>
            <input
              className="input"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="RLLA-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">New password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <button type="button" className="auth-link" onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </div>
  );
}