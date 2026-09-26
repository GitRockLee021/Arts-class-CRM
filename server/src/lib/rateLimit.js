import rateLimit from 'express-rate-limit';

/**
 * Rate limits for the credential endpoints (security audit #2).
 *
 * These are the only two unauthenticated write endpoints that can be abused: `/login` for
 * password guessing and `/forgot-password` for recovery-key brute forcing. Everything else
 * sits behind `requireAuth`.
 *
 * The store is in-memory, which is correct for the single-instance Railway deployment. If the
 * app is ever scaled to more than one instance, swap in a shared store (e.g. the `rate-limit-
 * redis` package) or the limits become per-instance and therefore weaker.
 */

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const WINDOW_MIN = positive(process.env.AUTH_RATE_WINDOW_MIN, 15);
const LOGIN_MAX = positive(process.env.AUTH_RATE_LOGIN_MAX, 10);
const RECOVERY_MAX = positive(process.env.AUTH_RATE_RECOVERY_MAX, 5);

const shared = {
  windowMs: WINDOW_MIN * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
};

/** Counts only FAILED sign-ins, so a legitimate user mistyping is never locked out. */
export const loginLimiter = rateLimit({
  ...shared,
  limit: LOGIN_MAX,
  skipSuccessfulRequests: true,
});

/** Counts every request: a successful reset is worth exactly one attempt, so this is tight. */
export const recoveryLimiter = rateLimit({
  ...shared,
  limit: RECOVERY_MAX,
  message: { error: 'Too many password-reset attempts. Please wait a few minutes and try again.' },
});
