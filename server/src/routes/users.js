import { Router } from 'express';

import { query, get, run } from '../db.js';
import { hashPassword, hashToken, generateRecoveryKey, publicUser, requireAuth, requireRole } from '../services/auth.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json(query('SELECT id, email, name, role, active, created_at FROM users ORDER BY role, name'));
});

router.post('/', (req, res) => {
  const { email, name, role, password } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });
  const finalRole = role === 'faculty' ? 'faculty' : 'admin';
  const finalPassword = typeof password === 'string' && password.length >= 8 ? password : null;
  if (!finalPassword) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const exists = get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email.trim());
  if (exists) return res.status(409).json({ error: 'A user with this email already exists' });

  const recoveryKey = generateRecoveryKey();
  const result = run(
    'INSERT INTO users (email, name, password_hash, recovery_key_hash, role) VALUES (?, ?, ?, ?, ?)',
    email.trim(),
    name.trim(),
    hashPassword(finalPassword),
    hashToken(recoveryKey),
    finalRole,
  );
  const user = get('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?', result.lastInsertRowid);
  res.status(201).json({ user, recoveryKey });
});

router.patch('/:id', (req, res) => {
  const target = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { name, role, active } = req.body || {};
  const next = {
    name: typeof name === 'string' && name.trim() ? name.trim() : target.name,
    role: role === 'faculty' || role === 'admin' ? role : target.role,
    active: typeof active === 'boolean' ? (active ? 1 : 0) : target.active,
  };

  if (target.id === req.user.id && (!next.active || next.role !== 'admin')) {
    return res.status(400).json({ error: 'You cannot deactivate yourself or remove your own admin role' });
  }

  run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', next.name, next.role, next.active, target.id);
  res.json({ user: publicUser({ ...target, ...next }) });
});

router.post('/:id/reset-password', (req, res) => {
  const target = get('SELECT id FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), target.id);
  run('DELETE FROM sessions WHERE user_id = ?', target.id);
  res.json({ ok: true });
});

router.post('/:id/regenerate-recovery-key', (req, res) => {
  const target = get('SELECT id FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const recoveryKey = generateRecoveryKey();
  run('UPDATE users SET recovery_key_hash = ? WHERE id = ?', hashToken(recoveryKey), target.id);
  res.json({ recoveryKey, user_id: target.id });
});

router.delete('/:id', (req, res) => {
  const target = get('SELECT id FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  run('DELETE FROM users WHERE id = ?', target.id);
  res.json({ ok: true });
});

export default router;