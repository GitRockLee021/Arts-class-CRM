import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Modal, Spinner, EmptyState, Field, Confirm } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../auth.jsx';

function OneTimeKey({ title, recoveryKey, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="key-card">
        <p className="muted">This is the only time this key will be shown. Write it down and keep it safe.</p>
        <code className="recovery-key">{recoveryKey}</code>
        <p className="muted">
          If this person forgets their password, they click <b>Forgot password?</b> on the login screen and enter
          this key.
        </p>
      </div>
      <div className="row end">
        <button className="btn btn-primary" onClick={onClose}>
          I have saved it
        </button>
      </div>
    </Modal>
  );
}

function UserForm({ onDone, defaultRole }) {
  const [form, setForm] = useState({ email: '', name: '', role: defaultRole || 'faculty', password: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/users', form);
      setResult(res);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  if (result) return <OneTimeKey title="User created" recoveryKey={result.recoveryKey} onClose={onDone} />;

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="Full name *" className="span-2">
        <input className="input" value={form.name} onChange={set('name')} required />
      </Field>
      <Field label="Email (login id) *" className="span-2">
        <input className="input" type="email" value={form.email} onChange={set('email')} required />
      </Field>
      <Field label="Role">
        <select className="input" value={form.role} onChange={set('role')}>
          <option value="faculty">Faculty</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Field label="Password *">
        <input className="input" type="password" value={form.password} onChange={set('password')} minLength={8} required />
      </Field>
      <p className="muted span-2">The recovery key will be shown next, only once — save it before closing.</p>
      <div className="row end span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { password });
      toast(`Password reset for ${user.name}.`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="New password *" className="span-2">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      </Field>
      <div className="row end span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </form>
  );
}

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [keyFor, setKeyFor] = useState(null);

  function load() {
    api.get('/users').then(setUsers).catch(() => {});
  }
  useEffect(load, []);

  async function toggleActive(u) {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      toast(u.active ? `${u.name} deactivated.` : `${u.name} activated.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function remove(u) {
    try {
      await api.del(`/users/${u.id}`);
      toast(`User ${u.name} deleted.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function onCreated() {
    setShowForm(false);
    load();
  }

  function onKeyShown(data) {
    setKeyFor(data);
  }

  function Regenerate({ user }) {
    const [busy, setBusy] = useState(false);
    return (
      <button
        className="btn btn-sm btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api.post(`/users/${user.id}/regenerate-recovery-key`);
            onKeyShown({ title: `New recovery key for ${user.name}`, recoveryKey: res.recoveryKey });
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        New key
      </button>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Users & Permissions</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          Add user
        </button>
      </div>

      {!users ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState>No users yet.</EmptyState>
      ) : (
        <div className="card">
          <div className="tablewrap">
            <table className="stack-cards">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name">
                      <strong>
                        {u.name}
                        {u.id === me?.id && <span className="muted"> (you)</span>}
                      </strong>
                    </td>
                    <td data-label="Email">{u.email}</td>
                    <td data-label="Role">
                      <Badge status={u.role === 'admin' ? 'active' : 'info'} />
                      <span className="muted"> {u.role === 'admin' ? 'Admin' : 'Faculty'}</span>
                    </td>
                    <td data-label="Status">
                      <Badge status={u.active ? 'active' : 'inactive'} />
                    </td>
                    <td data-label="Actions">
                      <div className="row">
                        <button className="btn btn-sm btn-ghost" onClick={() => setResetFor(u)}>
                          Reset password
                        </button>
                        <Regenerate user={u} />
                        {u.id !== me?.id && (
                          <>
                            <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(u)}>
                              {u.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <Confirm message={`Delete ${u.name}? Their login will be removed immediately.`} onConfirm={() => remove(u)}>
                              Delete
                            </Confirm>
                          </>
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
        <Modal title="Add user" onClose={() => setShowForm(false)}>
          <UserForm onDone={onCreated} />
        </Modal>
      )}
      {resetFor && (
        <Modal title={`Reset password — ${resetFor.name}`} onClose={() => setResetFor(null)}>
          <ResetPasswordForm user={resetFor} onDone={() => setResetFor(null)} />
        </Modal>
      )}
      {keyFor && <OneTimeKey {...keyFor} onClose={() => setKeyFor(null)} />}
    </>
  );
}