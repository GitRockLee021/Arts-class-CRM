import crypto from 'node:crypto';

import { get, run } from '../db.js';

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000;
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Recovery key: RLLA-XXXX-XXXX-XXXX, unambiguous alphabet (no 0/O/1/I)
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryKey() {
  const chars = [];
  for (let i = 0; i < 12; i += 1) {
    chars.push(KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)]);
  }
  const body = chars.join('');
  return `RLLA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export async function issueSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run('INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES ($1, $2, $3, $4)', tokenHash, userId, expiresAt, new Date().toISOString());
  return token;
}

export async function destroySession(token) {
  if (!token) return;
  await run('DELETE FROM sessions WHERE token_hash = $1', hashToken(token));
}

export async function clearExpiredSessions() {
  await run('DELETE FROM sessions WHERE expires_at <= $1', new Date().toISOString());
}

export async function getUserFromToken(token) {
  if (!token) return null;
  const row = await get(
    `SELECT u.id, u.email, u.name, u.role, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    hashToken(token),
  );
  if (!row) return null;
  if (!row.active) return null;
  await run('UPDATE sessions SET last_seen_at = $1 WHERE token_hash = $2', new Date().toISOString(), hashToken(token));
  return row;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(value, maxAgeSec) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (COOKIE_SECURE) parts.push('Secure');
  parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export async function requireAuth(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const user = token ? await getUserFromToken(token) : null;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = user;
    req.sessionToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, active: !!user.active };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));