import { Router } from 'express';

import { get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';
import {
  hashPassword,
  verifyPassword,
  issueSession,
  destroySession,
  generateRecoveryKey,
  hashToken,
  requireAuth,
  publicUser,
  sessionCookie,
  clearSessionCookie,
  sleep,
} from '../services/auth.js';

const router = Router();

async function findUserByEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  return get('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', email.trim());
}

router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    const user = await findUserByEmail(email);
    const ok = !!user && !!user.active && verifyPassword(password, user.password_hash);
    if (!ok) {
      await sleep(600);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = await issueSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(token, 30 * 24 * 60 * 60));
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/logout',
  requireAuth,
  ah(async (req, res) => {
    await destroySession(req.sessionToken);
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { current_password: current, new_password: next } = req.body || {};
    if (typeof next !== 'string' || next.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const user = await get('SELECT * FROM users WHERE id = $1', req.user.id);
    if (!verifyPassword(current, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', hashPassword(next), user.id);
    res.json({ ok: true });
  }),
);

router.post(
  '/regenerate-recovery-key',
  requireAuth,
  ah(async (req, res) => {
    const recoveryKey = generateRecoveryKey();
    await run('UPDATE users SET recovery_key_hash = $1 WHERE id = $2', hashToken(recoveryKey), req.user.id);
    res.json({ recoveryKey });
  }),
);

router.post(
  '/forgot-password',
  ah(async (req, res) => {
    const { email, recovery_key: recoveryKey, new_password: newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      await sleep(600);
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const user = await findUserByEmail(email);
    const withKey = user?.recovery_key_hash && typeof recoveryKey === 'string' && recoveryKey.trim();
    const keyHash = withKey ? hashToken(recoveryKey.trim().toUpperCase()) : null;
    if (!user || !keyHash || keyHash !== user.recovery_key_hash) {
      await sleep(600);
      return res.status(400).json({ error: 'Could not reset with the provided details' });
    }
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', hashPassword(newPassword), user.id);
    res.json({ ok: true, message: 'Password reset complete. Sign in with your new password.' });
  }),
);

export default router;