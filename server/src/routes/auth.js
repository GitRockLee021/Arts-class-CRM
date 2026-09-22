import { Router } from 'express';

import { get, run } from '../db.js';
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

function findUserByEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  return get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email.trim());
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  const ok = !!user && !!user.active && verifyPassword(password, user.password_hash);
  if (!ok) {
    await sleep(600);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = issueSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token, 30 * 24 * 60 * 60));
  res.json({ user: publicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password: current, new_password: next } = req.body || {};
  if (typeof next !== 'string' || next.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), user.id);
  res.json({ ok: true });
});

router.post('/regenerate-recovery-key', requireAuth, (req, res) => {
  const recoveryKey = generateRecoveryKey();
  run('UPDATE users SET recovery_key_hash = ? WHERE id = ?', hashToken(recoveryKey), req.user.id);
  res.json({ recoveryKey });
});

router.post('/forgot-password', async (req, res) => {
  const { email, recovery_key: recoveryKey, new_password: newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    await sleep(600);
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = findUserByEmail(email);
  const withKey = user?.recovery_key_hash && typeof recoveryKey === 'string' && recoveryKey.trim();
  const keyHash = withKey ? hashToken(recoveryKey.trim().toUpperCase()) : null;
  if (!user || !keyHash || keyHash !== user.recovery_key_hash) {
    await sleep(600);
    return res.status(400).json({ error: 'Could not reset with the provided details' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
  res.json({ ok: true, message: 'Password reset complete. Sign in with your new password.' });
});

export default router;