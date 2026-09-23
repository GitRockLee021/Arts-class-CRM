import { Router } from 'express';

import { query, get, run } from '../db.js';
import { hashPassword, hashToken, generateRecoveryKey, publicUser, requireAuth, requireRole } from '../services/auth.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  ah(async (req, res) => {
    res.json(await query('SELECT id, email, name, role, active, created_at FROM users ORDER BY role, name'));
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const { email, name, role, password } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });
    const finalRole = role === 'faculty' ? 'faculty' : 'admin';
    const finalPassword = typeof password === 'string' && password.length >= 8 ? password : null;
    if (!finalPassword) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const exists = await get('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', email.trim());
    if (exists) return res.status(409).json({ error: 'A user with this email already exists' });

    const recoveryKey = generateRecoveryKey();
    const result = await run(
      'INSERT INTO users (email, name, password_hash, recovery_key_hash, role) VALUES ($1, $2, $3, $4, $5)',
      email.trim(),
      name.trim(),
      hashPassword(finalPassword),
      hashToken(recoveryKey),
      finalRole,
    );
    const user = await get('SELECT id, email, name, role, active, created_at FROM users WHERE id = $1', result.lastInsertRowid);
    res.status(201).json({ user, recoveryKey });
  }),
);

router.patch(
  '/:id',
  ah(async (req, res) => {
    const target = await get('SELECT * FROM users WHERE id = $1', req.params.id);
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

    await run('UPDATE users SET name = $1, role = $2, active = $3 WHERE id = $4', next.name, next.role, next.active, target.id);
    res.json({ user: publicUser({ ...target, ...next }) });
  }),
);

router.post(
  '/:id/reset-password',
  ah(async (req, res) => {
    const target = await get('SELECT id FROM users WHERE id = $1', req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', hashPassword(password), target.id);
    await run('DELETE FROM sessions WHERE user_id = $1', target.id);
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/regenerate-recovery-key',
  ah(async (req, res) => {
    const target = await get('SELECT id FROM users WHERE id = $1', req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const recoveryKey = generateRecoveryKey();
    await run('UPDATE users SET recovery_key_hash = $1 WHERE id = $2', hashToken(recoveryKey), target.id);
    res.json({ recoveryKey, user_id: target.id });
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const target = await get('SELECT id FROM users WHERE id = $1', req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    await run('DELETE FROM users WHERE id = $1', target.id);
    res.json({ ok: true });
  }),
);

export default router;