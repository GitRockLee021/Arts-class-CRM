# Secret rotation — what can be automated

The short version: **database-backed secrets can be rotated automatically; third-party keys cannot
all be rotated by API, and rotating them blindly causes outages.** This page is the inventory and
the safe automation pattern.

## Inventory

| Secret | Stored in | How to rotate | Automation | Cadence |
| ------ | --------- | ------------- | ---------- | ------- |
| Admin password | Postgres `users.password_hash` | `npm run rotate:admin` (below) | **Yes** — but a human must collect the new credential | On incident + every 6 months |
| Admin recovery key | Postgres `users.recovery_key_hash` | same script | **Yes** | With the password |
| Session tokens | Postgres `sessions` | automatic: expiry + 6-hour sweep + revoke on credential change | **Yes, already live** | Continuous |
| Public receipt tokens | Postgres `fee_payments.share_token` | per-payment CSPRNG trigger | **Do not bulk-rotate** — it breaks links already sent to parents | Per payment |
| Supabase DB password | Supabase + host env + `server/.env` | Supabase Management API + host API + redeploy | **Yes**, with rollback (pattern below) | 6–12 months |
| WhatsApp access token | Meta Business Manager + host env | Business Manager → system user token | **No**; automate *expiry monitoring* only | 60 days (temporary) / 6 months |
| Razorpay key secret | Razorpay dashboard + host env | Dashboard → Regenerate Keys | **No** (dashboard-only) | 6 months |
| Razorpay webhook secret | Razorpay + host env | Dashboard / webhook API | **Semi** — update both sides together | 6 months |
| Hosting API key (Render/Railway) | Provider dashboard | Provider dashboard | No | 6 months |
| GitHub token | GitHub settings | GitHub settings | No | 6 months |

Only the admin password and recovery key were ever published. `server/.env` was never committed,
so the Supabase/WhatsApp/Razorpay secrets were **not** exposed through git. Rotate them anyway if
you believe the running server itself (not just the app login) was accessed.

## Already automated

- **Session expiry and revocation** (`server/src/services/auth.js`, `index.js`): `expires_at` is
  enforced on every request, the TTL slides on activity, expired rows are swept at boot and every
  6 hours, and password change / recovery reset / recovery-key rotation revoke the right sessions.
- **Admin rotation tool**: `npm run rotate:admin` in `server/`.
  - Generates a 24-character password (~140 bits) and a new recovery key.
  - Verifies the new hash before writing, updates the user, revokes every session.
  - Writes the credentials once to `%LOCALAPPDATA%\Pravaha\` (or `--out <path>`), refuses paths
    inside the repo, and restricts the file ACL on Windows.
  - `--dry-run` validates everything without touching the database.
- **GitHub secret scanning + push protection**: enabled.
- **Dependabot alerts + automated security fixes**: enabled.

## Rotating the Supabase DB password safely

Changing the DB password invalidates `DATABASE_URL` everywhere (the README warns about this). The
only safe sequence is: change password → update the host env var → redeploy → verify health →
roll back if unhealthy.

Supabase exposes `PATCH /v1/projects/{ref}/database/password` (confirmed in their OpenAPI spec).
Render exposes env-var updates and deploy triggers. A manual-dispatch GitHub Action can do this:

```yaml
name: Rotate database password
on:
  workflow_dispatch:
    inputs:
      confirm:
        description: Type ROTATE to run for real
        required: true
      dry_run:
        description: Dry run (no changes)
        type: boolean
        default: true

permissions:
  contents: read
concurrency: rotate-db-password

jobs:
  rotate:
    runs-on: ubuntu-latest
    environment: production          # add required reviewers in repo settings
    steps:
      - uses: actions/checkout@v4
      - name: Rotate with rollback
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
          RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
          RENDER_SERVICE_ID: ${{ secrets.RENDER_SERVICE_ID }}
          APP_URL: ${{ vars.APP_URL }}
          CONFIRM: ${{ inputs.confirm }}
          DRY_RUN: ${{ inputs.dry_run }}
        run: node scripts/rotate-db-password.mjs
```

`scripts/rotate-db-password.mjs` (not shipped yet) should:

1. Refuse to run unless `CONFIRM == ROTATE` and `DRY_RUN == false`.
2. Generate `openssl rand -base64 32`-strength password; `::add-mask::` it.
3. `PATCH https://api.supabase.com/v1/projects/$REF/database/password` with `{ "password": ... }`.
4. Build a new `DATABASE_URL` with the password URL-encoded.
5. `PATCH https://api.render.com/v1/services/$SERVICE/env-vars/DATABASE_URL` with the new value.
6. `POST https://api.render.com/v1/services/$SERVICE/deploys` and poll `$APP_URL/api/health` for
   up to 5 minutes.
7. On any failure: PATCH the old password back, restore the old env var, redeploy, and fail loudly.
8. On success: store the new URL in the password manager (CLI) — **never** in an artifact or log.

Test it with `DRY_RUN=true` first, on a staging service, with a database backup taken immediately
before. A free-tier single-instance app will have a short restart window.

## Why not rotate everything on a cron

- **Admin password**: a cron rotation locks the owner out unless a password manager is the
  distribution channel. Rotate on demand, with a reminder.
- **WhatsApp / Razorpay**: the new key must be updated on both the provider and the host at the same
  time. A cron job that rotates one side breaks payments or messaging until the other side catches
  up. Keep these as a reviewed quarterly task.
- **Receipt share tokens**: each token is the only key to a parent-facing receipt. Bulk rotation
  invalidates links already sent over WhatsApp.
- **DB password**: without the atomic env update + health check + rollback above, it is an outage.

## Recommended operating model

1. Use a password manager (1Password/Bitwarden) as the source of truth for the admin credential and
   `DATABASE_URL`; its CLI can receive rotated secrets automatically.
2. Put the DB-rotation Action behind a GitHub `production` environment with required reviewers.
3. Run `npm run rotate:admin` whenever an admin leaves, a laptop is lost, or the credential may
   have been seen — and at least every 6 months.
4. Open a tracked issue every quarter for the manual keys (WhatsApp, Razorpay, hosting, GitHub).
5. Monitor the WhatsApp token's `expires_at` via Meta's `debug_token` endpoint and alert 14 days
   before expiry; that part *is* automatable.
6. Keep `server/.env` gitignored and keep the repo private.

## What is needed to build the DB-rotation Action

- Decision: Render (the current `render.yaml`) or Railway.
- Supabase personal access token + project ref.
- Hosting API key + service ID.
- A password-manager CLI or another secret sink for the new `DATABASE_URL`.
- A staging service (or an accepted restart window) for the first test.

Until those exist, `npm run rotate:admin` covers the credential that actually leaked.
