/** Shared input validation helpers (security audit #4). */

// local@label(.label)*.tld — the TLD must be alphabetic and 2+ chars (no 1-char TLDs exist in
// the DNS root zone), which also rejects a trailing dot such as "a@b.com.".
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** Digits only, 1-15 chars (fits a Postgres integer/bigint). Returns null when not an int. */
export function toInt(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

export function isEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

/**
 * Login identifier. The demo signs in by user ID, which may be a display name
 * (e.g. "Radhakannan") rather than an email, so only shape is enforced: non-empty after
 * trimming, no control characters, and within the 120-char budget of `users.email`.
 * Empty or malformed input is still rejected with a 400 before any query runs.
 */
export function isLoginId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return false;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

/** Optional email: null/undefined/'' pass through, anything present must look like an email. */
export function isEmailOrEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  return isEmail(value);
}

/**
 * Route guard for `:id` params. Rejects "abc", "1; DROP", "1.5", "-1" with a 400 before the
 * value ever reaches a query, and normalises the param ("007" -> "7") so downstream string
 * comparisons behave.
 */
export function requireIntId(req, res, next) {
  const id = toInt(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  req.params.id = String(id);
  return next();
}
