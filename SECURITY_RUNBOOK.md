# Security runbook — 2026-10-26

> **Status 2026-10-26:** the admin password and recovery key were rotated directly in the
> production database, and all 32 pre-existing sessions were deleted. The new credentials are not
> in this repo. Priorities 1 and 2 are done; the user table was reviewed (two expected accounts)
> and the payment/reminder queries are still worth running. The live Railway service was returning
> `404 Application not found` when this was executed, so the code fixes below are committed but
> not yet deployed.

## What happened

Until this commit, `README.md` published the live URL **and a working admin login** of the
production CRM, and this GitHub repository is **public**. On 2026-10-24 that login was confirmed
against the live server: it returned `200` with a valid `admin` session. The session was destroyed
immediately and no data was read, but anyone who found the repo could have done the same.

Assume student PII, phone numbers and payment records may have been viewed, and that WhatsApp
messages or payment links may have been sent, until you prove otherwise.

**Rotating the password is mandatory.** Deleting the password from the README does not help on
its own — git history still contains it.

---

## Priority 1 — re-key the admin account

### Option A — CLI (recommended; also rotates the recovery key)

Run from the repo, with the same `DATABASE_URL` the live service uses (check Railway's variables
first if you are not sure `server/.env` points at production):

```powershell
cd server
$env:ADMIN_EMAIL="Radhakannan"        # must match the existing user ID exactly
$env:ADMIN_NAME="Radhakannan"
$env:ADMIN_PASSWORD="<new long unique password>"
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

The script prints a **new recovery key once** — store it offline (password manager / paper), not
in this repo. It updates the existing row, forces `role=admin`, `active=1`, and replaces the
recovery key hash.

### Option B — in the app

Sign in, open **Settings → Change password**, and enter a new password. The new code keeps your
current session and signs out every other device. You still need Priority 2 to kill sessions that
were created *before* this deploy.

---

## Priority 2 — invalidate every existing session

The code fix enforces expiry for new requests, but any session row that already exists stays valid
until its TTL. Delete them all:

```sql
-- Supabase dashboard → SQL Editor (or psql "$DATABASE_URL")
DELETE FROM sessions;
```

Everyone is signed out, including you. Sign in again afterwards.

Optional: shorten the live TTL so a future leak has a smaller window.

```
SESSION_TTL_DAYS=7
```

Set it in Railway → service → Variables, then redeploy/restart.

---

## Priority 3 — check for tampering

Run these in the Supabase SQL editor. Save the output before making changes.

```sql
-- Accounts: anything you did not create is suspicious.
SELECT id, email, name, role, active, created_at
FROM users ORDER BY created_at;

-- Sessions: count + last activity per account. Large counts or unknown IPs = investigate.
SELECT u.id, u.email, u.role, count(s.id) AS sessions,
       max(s.last_seen_at) AS last_seen
FROM users u LEFT JOIN sessions s ON s.user_id = u.id
GROUP BY u.id ORDER BY last_seen DESC NULLS LAST;

-- Payments: webhook-created rows always have a gateway_ref. Look for unexpected manual entries.
SELECT id, enrollment_id, amount, payment_date, method, fee_type, gateway_ref, created_at
FROM fee_payments ORDER BY created_at DESC LIMIT 100;

-- WhatsApp sends: did anyone message parents?
SELECT id, student_id, enrollment_id, amount_due, channel, status, sent_at
FROM reminder_logs ORDER BY sent_at DESC LIMIT 100;

-- Destructive edits: deleted students, course changes, archives.
SELECT id, student_id, type, course_id, from_course, to_course, remark, created_at
FROM student_events ORDER BY created_at DESC LIMIT 100;
```

Railway → service → **Logs**: filter for `POST /api/auth/login`, `POST /api/reminders/send`,
`DELETE /api/`, and `POST /api/users`. Successful logins from unexpected countries/IPs are the
signal to escalate.

If you find tampering: restore from Supabase point-in-time recovery / backup, then rotate the
Supabase database password, WhatsApp token and Razorpay keys as well.

---

## Priority 4 — remove the exposure

1. **Make the repo private** (GitHub → Settings → General → Danger Zone → Change visibility), or
   scrub the credentials from history with `git filter-repo` and force-push. Rotation already
   neutralises the leaked password; history rewriting is hygiene, not a substitute.
2. Never record credentials in `README.md`, code, issues or commit messages again. `.env*` stays
   gitignored; secrets live only in Railway variables.
3. Optional but recommended: create a second admin account for daily use, keep this one for
   recovery, and enable MFA at the identity layer if you add one.

---

## Verify the fix

From a machine that is not signed in:

```powershell
# Old password must now fail (expect 401).
curl.exe -i -X POST https://pravaha-crm-demo-production.up.railway.app/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"Radhakannan\",\"password\":\"<old password>\"}'

# An old cookie must be rejected (expect 401).
curl.exe -i https://pravaha-crm-demo-production.up.railway.app/api/auth/me `
  -H "Cookie: session=<old token>"
```

Then confirm the SQL side:

```sql
SELECT count(*) FROM sessions;          -- only your fresh login(s)
SELECT count(*) FROM sessions WHERE expires_at <= now();  -- should be 0
```

---

## What the 2026-10-26 code change does

| File | Change |
| ---- | ------ |
| `server/src/services/auth.js` | Enforces `expires_at > now()` on every request; sliding TTL; adds `revokeUserSessions()`; `clearExpiredSessions()` now returns the row count. |
| `server/src/index.js` | Sweeps expired sessions at boot and every 6 hours. |
| `server/src/routes/auth.js` | Password change keeps only the caller's session; recovery reset kills every session; recovery-key rotation signs out other devices; cookie `Max-Age` follows `SESSION_TTL_DAYS`. |
| `server/src/db.js` | Verifies the DB TLS certificate against the pinned Supabase Root 2021 CA instead of `rejectUnauthorized: false`. |
| `server/certs/supabase-root-2021-ca.pem` | Public root CA (valid until 2031). Not a secret. |
| `server/package-lock.json` | `npm audit fix` — removes the high `body-parser` DoS and the `ip-address` moderate. |

Deploying happens on push to `master` (Railway builds the `Dockerfile`). **Run Priority 2 after the
deploy** so pre-existing sessions are gone.

---

## If the database stops connecting (CA rotation)

Symptom in Railway logs: `SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE` at boot.

1. Supabase dashboard → **Settings → Database → SSL configuration** → download the current CA.
2. Save it as a PEM file, add it to the repo (or bake it into the image), and set
   `PGSSL_CA=/app/certs/<file>.pem` in Railway.
3. Redeploy. **Do not** set `PGSSL_NO_VERIFY=true` in production.

`PGSSL_NO_VERIFY=true` exists only for local databases with self-signed certs; it logs a warning
and disables verification.

---

## Other secrets

`server/.env` was never committed (`git log --all -- server/.env` returns nothing) and the
Supabase / WhatsApp / Razorpay secrets are not in the repository. If you have reason to believe the
server itself was accessed (not just the app login), rotate all of them:

- Supabase database password (updates `DATABASE_URL` everywhere),
- WhatsApp Cloud API access token,
- Razorpay `KEY_SECRET` and `WEBHOOK_SECRET`.
