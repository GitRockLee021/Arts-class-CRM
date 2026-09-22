import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import { Icon } from './components/icons.jsx';
import { Spinner, Modal, Field } from './components/ui.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import { api } from './api.js';
import { useToast } from './components/Toast.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Enrollments from './pages/Enrollments.jsx';
import Dues from './pages/Dues.jsx';
import Billing from './pages/Billing.jsx';
import Courses from './pages/Courses.jsx';
import Batches from './pages/Batches.jsx';
import Attendance from './pages/Attendance.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', admin: false },
  { to: '/students', label: 'Students', icon: 'users', admin: false },
  { to: '/attendance', label: 'Attendance', icon: 'clipboard', admin: false },
  { to: '/fees', label: 'Dues', icon: 'rupee', admin: false },
  { to: '/billing', label: 'Billing', icon: 'card', admin: false },
  { to: '/courses', label: 'Courses', icon: 'book', admin: false },
  { to: '/batches', label: 'Batches', icon: 'calendar', admin: false },
  { to: '/users', label: 'Users', icon: 'key', admin: true },
  { to: '/settings', label: 'Settings', icon: 'gear', admin: true },
];

function Nav({ items, onNavigate }) {
  return (
    <nav className="nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onNavigate}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  return user && user.role === 'admin' ? children : <Navigate to="/" replace />;
}

function AccountModal({ onClose }) {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [newKey, setNewKey] = useState(null);

  async function changePassword(e) {
    e.preventDefault();
    if (next !== confirm) {
      toast('New passwords do not match.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      toast('Password changed.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function regenKey() {
    setKeyBusy(true);
    try {
      const res = await api.post('/auth/regenerate-recovery-key');
      setNewKey(res.recoveryKey);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <Modal title={`My account — ${user.name}`} onClose={onClose}>
      {newKey && (
        <div className="key-card">
          <p className="muted">New recovery key (shown once — save it):</p>
          <code className="recovery-key">{newKey}</code>
          <div className="row end">
            <button className="btn btn-primary" onClick={() => setNewKey(null)}>
              I have saved it
            </button>
          </div>
        </div>
      )}
      {!newKey && (
        <>
          <form className="form-grid" onSubmit={changePassword}>
            <h2 className="span-2" style={{ margin: '0 0 4px' }}>
              Change password
            </h2>
            <Field label="Current password" className="span-2">
              <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" className="span-2">
              <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
            </Field>
            <Field label="Confirm new password" className="span-2">
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
            </Field>
            <div className="row end span-2">
              <button className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
          <div className="key-card">
            <p className="muted">
              Your recovery key is how you reset a forgotten password. If you lost it, generate a new one now and
              save it.
            </p>
            <button className="btn btn-ghost" onClick={regenKey} disabled={keyBusy}>
              {keyBusy ? 'Generating…' : 'Generate new recovery key'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Shell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, logout } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const nav = NAV.filter((n) => !n.admin || isAdmin);
  const secondary = nav.slice(4);

  async function doLogout() {
    await logout();
    toast('Signed out.');
  }

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png?v=3" alt="R&L Academy" />
          <div>
            <strong>Pravaha Art Space</strong>
            <small>CRM</small>
          </div>
        </div>
        <Nav items={nav} />
        <div className="sidebar-foot">
          <button className="btn btn-ghost" onClick={() => setAccountOpen(true)}>
            <Icon name="key" size={16} /> My account
          </button>
          <button className="btn btn-ghost" onClick={doLogout}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="brand brand-sm">
<img className="brand-mark" src="/logo.png?v=3" alt="R&L Academy" />
            <strong>Pravaha Art Space CRM</strong>
          </div>
          <div className="row">
            <span className="user-chip">
              {user?.name}
              <small>{user?.role === 'admin' ? 'Admin' : 'Faculty'}</small>
            </span>
            <button className="btn btn-ghost" onClick={() => setAccountOpen(true)}>
              My account
            </button>
            <button className="btn btn-ghost" onClick={doLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content" key={loading}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/enrollments" element={<Enrollments />} />
            <Route path="/fees" element={<Dues />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="bottomnav">
        {nav.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `bn-item${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className={`bn-item bn-more${moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen(true)}>
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>More</strong>
              <button className="icon-btn" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </div>
            <Nav
              items={secondary}
              onNavigate={() => {
                setMoreOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}

      {loading && (
        <div className="overlay" onClick={() => setLoading(false)}>
          <div className="overlay-card card">
            <Spinner />
            <p className="muted">Reload page to refresh all data</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setLoading(false);
                window.location.reload();
              }}
            >
              Reload now
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AuthGate() {
  const { status } = useAuth();
  const [mode, setMode] = useState('login');

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <Spinner />
      </div>
    );
  }

  if (status === 'out') {
    return mode === 'login' ? (
      <Login onForgot={() => setMode('forgot')} />
    ) : (
      <ForgotPassword onBack={() => setMode('login')} />
    );
  }

  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  );
}