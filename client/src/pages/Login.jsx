import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Login({ onForgot }) {
  const toast = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      toast(err.message, 'error');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <img className="brand-mark" src="/logo.png?v=3" alt="R&L Academy" />
          <strong>Pravaha Art Space CRM</strong>
        </div>
        <p className="muted center">Sign in to manage students, fees and reminders.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rlla.app"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button type="button" className="auth-link" onClick={onForgot}>
          Forgot password?
        </button>
      </div>
    </div>
  );
}