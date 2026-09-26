# Pravaha Art Space CRM

Client-server CRM for **Pravaha Art Space / Right & Left Learning Academy** (arts class).
Manages students, enrollments, attendance, fees, dues, billing, receipts, and WhatsApp
parent communication.

> This file is the single source of truth: it merges the old `README.md` (setup + integration
> docs) and `SESSION_MEMORY.md` (project state + feature history). Duplicated content was
> collapsed into one entry per topic.

Last updated: 2026-09-26

---

## Tech stack

- **Server** — Node.js (ESM), Express 4, PostgreSQL via `pg` (hosted on Supabase),
  `exceljs` for imports, `@napi-rs/canvas` for certificates. Custom **scrypt + session-cookie**
  auth (no external auth library).
- **Client** — React 18 + Vite, `react-router-dom` v6, hand-rolled CSS, no UI framework.
- **WhatsApp** — Meta WhatsApp Business Cloud API (template messages).
- **Payments** — Razorpay Payment Links + webhook.

Requires Node.js **18+** (Node 22 LTS recommended).

---

## Project layout

```
server/
  src/
    index.js              Express app, middleware order, route mounting, static client
    db.js                 Postgres pool + schema (auto-created on boot)
    seed.js               sample data
    lib/
      fees.js             monthly-fee due calculation (MONTHLY_DUE_DAY, PRO_RATE_AFTER_DAY)
      monthly.js          per-calendar-month dues, monthReport, enrollmentOverdue
      enrollments.js      shared enrollment + fee queries
      receipts.js         receipt no, student ref, amount-in-words, receiptHtml template
      paymentReceipt.js   shared row fetch + receipt payload builder (staff + share routes)
      asyncHandler.js
    validate.js           requireIntId (all /:id routes), isEmail, toInt
    rateLimit.js          loginLimiter, recoveryLimiter (express-rate-limit, in-memory)
    routes/               students, courses, batches, enrollments, payments, reminders,
                          attendance, stats, imports, users, auth, webhooks, share
    services/
      auth.js             scrypt hashing, sessions, requireAuth / requireRole
      whatsapp.js         template sends (reminder + receipt + test)
      paymentReceipts.js  sendPaymentReceiptForPayment (fire-and-forget after a payment)
      razorpay.js         createPaymentLink
      certificate.js      canvas certificate PNG generation
  scripts/create-admin.js
  assets/                 pravaha-logo.jpeg, signature.png, logo.png
client/
  src/pages/              Dashboard, Students, StudentDetail, Enrollments, Dues, Billing,
                          Courses, Batches, Attendance, Users, Settings, Login, ForgotPassword
  src/components/         forms, modals, badges, toast, icons, UI kit (Modal/Field/useForm)
  src/auth.jsx            auth context + RequireAdmin
  src/styles.css
design-*.html             static design mocks (see "Design mocks")
```

Sidebar order (desktop) / bottom nav (first 4 on mobile):
`Dashboard | Students | Attendance | Dues | Billing | Courses | Batches | Users | Settings`

Routes: `/`, `/students`, `/students/:id`, `/enrollments`, `/fees` (Dues), `/billing`,
`/courses`, `/batches`, `/attendance`, `/users` (admin), `/settings` (admin).

---

## Quick start

```bash
npm run setup      # installs root, server, and client dependencies
npm run seed       # add sample students/courses/payments
npm run dev        # API on http://localhost:5001 + web app on http://localhost:5173
```

- The server needs `DATABASE_URL` in `server/.env` (copy from `server/.env.example`);
  without it the server exits with a clear message.
- Create the first admin: `npm run create-admin` **inside `server/`**. It prompts, or reads
  `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD`. It is **idempotent** — if the email already
  exists it resets the password and recovery key.
- Open http://localhost:5173. On a phone on the same Wi-Fi use the laptop's LAN IP
  (Vite runs with `host: true`).
- Not using the dev server? `npm run build`, then start the server and open
  http://localhost:5001 — the built client is served from the API port.

---

## Environment & workflow quirks

- Server runs as plain `node src/index.js` from `server/` — **manual restart after every
  server-side change** is required.
- PowerShell blocks `npm.ps1` → build the client with `cmd /c "npm run build"` from `client/`.
  Use `railway.cmd` (not `railway`) for the Railway CLI.
- API is bound to `http://localhost:5001`.
- **Hosting: Railway** — project `soothing-ambition`, service `pravaha-crm-demo`,
  repo `GitRockLee021/Arts-class-CRM`. A `Dockerfile` exists at the repo root.
  - Live URL: **https://pravaha-crm-demo-production.up.railway.app**
  - Check status with `railway.cmd status` from the repo root. Railway builds the repo itself.
- DB is PostgreSQL (Supabase) via `DATABASE_URL`; the schema is auto-created on boot from
  `server/src/db.js`. (Was SQLite `server/data/crm.db` pre-migration.)
- **`DATABASE_URL` must use the pooler host and a project-qualified username**:
  `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
  (currently ref `zvflqcmshacrvaqoioye`, region `ap-south-1`). Two traps, both of which have
  bitten this project:
  - Supabase's **direct** host `db.<project-ref>.supabase.co` resolves to **AAAA only** (IPv6) on
    newer projects, so it can never connect from Railway's IPv4-only containers — it fails with
    `ENOTFOUND`, and the Supabase dashboard's connection string offers it as if it were valid.
  - The pooler needs the **project ref in the username** (`postgres.<ref>`, not `postgres`).
    Plain `postgres` gets `no tenant identifier provided (external_id or sni_hostname required)`.
  - The project ref is baked into Railway's `DATABASE_URL`, so moving to a different Supabase
    project means rebuilding the URL. Also note that resetting the Supabase **password**
    invalidates the URL everywhere (Railway + `server/.env`) and the server crash-loops at boot
    with `28P01 password authentication failed`, so every route returns 502 - the app cannot boot
    without the DB, there is no degraded mode.

---

## Auth & roles (Phase 1 — implemented)

- Email + password, **scrypt** hashing (`node:crypto`), HttpOnly `SameSite=Lax` cookie session,
  30-day sliding TTL (`SESSION_TTL_DAYS`).
- **Roles**: `admin` (everything) vs `faculty` (everything **except** Users / roles /
  permissions, Settings, and reminder status+test). Faculty can use students, courses, batches,
  payments, imports, reminders, attendance, and certificates.
- **Recovery key** (chosen instead of a mail service): one-time key `RLLA-XXXX-XXXX-XXXX` shown
  once at user creation. "Forgot password?" = email + recovery key + new password. Admins can
  regenerate any key.
- Route guard in `server/src/index.js`: public = `/api/health`, `/api/auth/*`, `/api/webhooks/*`,
  `/share/*`, `/assets/*`. Everything else under `/api` requires auth; admin-only is enforced
  per-router with `requireRole('admin')`.
- Env: `SESSION_TTL_DAYS`, `COOKIE_SECURE` (**must be `true` on live HTTPS**).

### Test accounts (local/dev only)

| Role | Login (user ID) | Password |
| ---- | --------------- | -------- |
| Admin | `Radhakannan` | `Radhakannan` (reset via `npm run create-admin`) |

Login identifier is a **user ID**, not necessarily an email - the demo signs in by name. The
server validates it with `isLoginId` (non-empty, no control chars, <=120 chars) in
`POST /api/auth/login`, `POST /api/auth/forgot-password` and `POST /api/users`, so it accepts
`Radhakannan` as well as a real address. `isEmail` is still used for the optional **student**
email, which must be a real address.

> These accounts live in the shared Supabase database, so they are the **same on local and on the
> live Railway site** - changing a password changes both.

---

## Features

- **Students** — add/edit/delete, guardian info, status, search by name/phone, per-student
  event **timeline** (`student_events`, e.g. `Profile updated - <changed fields>`).
- **Enrollments** — enroll in a course + batch, status active/completed/left.
- **Batches** — day/time scheduling per course.
- **Attendance** — per-batch daily register (see below).
- **Dues** — overdue-only collections view with collect + remind (see below).
- **Billing** — month-picker payment ledger with clickable receipts (see below).
- **Receipts** — server-rendered HTML, printable to PDF, public share link, WhatsApp auto-send.
- **Certificates** — course-completion certificate PNG via `@napi-rs/canvas`, with logo,
  signature image, brand/owner text, and a certificate number.
- **Admission collect** — records Course + Admission + Kit as **one group of `fee_payment` rows**
  sharing an `admission_group` so they print on a single combined receipt.
- **Imports** — CSV/XLSX student import (`exceljs`) + downloadable `.xlsx` template.
- **Dashboard** — active students, monthly fee expectation, collections, outstanding dues.
- Mobile-first: bottom navigation, card-style tables, responsive layout.

---

## Fees logic

Fees are **monthly**. `server/src/lib/fees.js` is the single source of the constants:

- `MONTHLY_DUE_DAY = 5` — dues are payable by the **5th** for every student (the joining day
  no longer drives the due date).
- `PRO_RATE_AFTER_DAY = 15` — a student who **joins after the 15th** is charged **half fee**
  for the starting month.
- expected installments = months since start + 1, prorated as above, capped by
  `duration_months`.
- `one_time` fee mode = a single expected installment.
- due = (expected installments × monthly fee) − payments recorded.

`server/src/lib/monthly.js` attributes fees to **calendar months** for reporting:

- `expectedForMonth` — start month prorated if joined after the 15th, capped by
  `duration_months`; `one_time` counted only in its start month.
- `monthReport` — Σ `max(expected − payments in that month, 0)` per active enrollment, plus
  `total` (enrollments with expected > 0), `paidCount`, and `pct` (feeds the collection ring).
- `OVERDUE_DAY = 8` — `enrollmentOverdue()` returns `{amount, months, daysLate, since}` for
  per-month shortfalls once past the 8th. **3-day grace**: an unpaid month M is overdue when
  today ≥ 8th of M, and `daysLate = today − 7` (so on 21 Sep, a 5-Sep due = "14 days late").
  Multi-month overdue amount is the sum of every unpaid month's shortfall; `daysLate` counts
  from the **oldest** overdue month's 8th.

Known fee data in the current dev DB: Varnam ₹1000, Arumbu ₹1200, Malar ₹1500.

---

## Dues page (`/fees`, `client/src/pages/Dues.jsx`)

Design mock `design-dues.html` is **frozen and approved**. Overdue only — upcoming dues are
deliberately not shown.

- Page head (`Dues` + "As of <today> · month in progress"; right = Billing link + **Remind all**).
- **Card 1 — Collection gauge**: SVG donut % + collected ₹ of expected ₹ for the month, from
  `GET /api/payments/summary?month=`.
- **Card 2 — Overdue**: ₹ total + student count + "oldest N days late".
- Table: Student (avatar + name, **no phone**) | Course / batch | Due (chip = "Overdue" +
  "N days late", optional "· N months") | Due amount (red) | Actions
  (**Collect** dark-red, **Remind** ghost, **Resend link** ghost when a link was already sent
  this month). Totals footer + hint line below.
- **Remind all / Remind** do **not** send immediately — they open a roster-picker modal
  (attendance-style card grid: avatar + name + "₹amount due · +91 …", tap to toggle, all
  selected by default) and a "Send to N students" button, then a "Reminders sent" confirmation
  with per-recipient status chips. No message preview (it is a fixed Meta template).
  Per-row **Remind** opens the same modal locked to that student.
- **Reminder history**: page-head **Reminder history** button → modal showing only the
  **current month's** reminders, **grouped by date** (newest first), each row = time, amount,
  delivery-status chip. Each row has a clock **Log** button → that student's **full** history.
  Chips: **Read** blue / **Delivered** green / **Sent** grey / **Failed** red. Statuses come from
  WhatsApp **status webhooks** (`sent→delivered→read`, `failed`) — requires storing `wamid` +
  a `delivery_status` column per send. Design-preview only; no polling API.
- **Collect modal method branch**: method ≠ Razorpay → plain "Record payment", recorded
  immediately. Method = **Razorpay** → payment-date field hidden, submit becomes
  **"Send payment link"**, shows a "Payment link sent" confirmation, and the row action becomes
  **"Resend link"**. Recipient number is shown in the modal helper. Recipient rule is
  `guardian_phone || student_phone`. When the parent pays, the Razorpay webhook records it and
  the row returns to normal automatically.

Backend: `GET /api/reminders/dues` returns overdue rows
`{id, student_id, student_name, student_phone, notify_phone, course_name, batch_name, amount_due,
days_late, months_overdue, since, link_sent}` sorted by days-late desc;
`notify_phone = guardian_phone || student_phone`; `link_sent` = a non-failed reminder logged
for that enrollment in the current month.

---

## Billing page + receipts (`/billing`)

Designs `design-billing.html` / `design-receipt.html` are approved and implemented.

- **Billing.jsx** — `input type="month"` picker (top-right) drives the list and the cards.
  3 cards: **Collected (month)** ₹ + count, **Outstanding dues (month)** ₹ + student count,
  **Method split (month)** chips + bars (Cash/UPI/Card/Razorpay/other). Table columns:
  **Receipt no** (link → `/api/payments/:id/receipt`, new tab) | Date | **Student ID**
  (link → `/students/:id`, new tab, `PAS-2026-XXXX`) | Student | Course (no batch) |
  Method (pill) | Amount.
- Backend `server/src/routes/payments.js`:
  - `GET /api/payments?month=YYYY-MM` (also `from`/`to`/`course_id`) → rows including
    `receipt_no` (`RCPT-<year>-<id pad 4>`), `student_ref`, `share_url`; newest first.
  - `GET /api/payments/summary?month=` → `{expected, paid, outstanding, count}`.
  - `GET /api/payments/:id/receipt` → server-rendered HTML receipt, authed by the same session
    cookie in the new tab.
  - `DELETE /api/payments/:id` → undo a payment.
- **Receipt page essentials** (all derived from existing data): header meta 4-col grid
  (Receipt no | Date | Month | Payment mode as plain text — no chip/label), then
  **Student ID | Student name | Parent | Mobile no.** with the label stacked above the value,
  fee particulars = course row + "Course fee (Month)" line, total paid banner + amount in words,
  and an outstanding balance pill. Toolbar = **Share on WhatsApp** (staff, `wa.me` deep link
  prefilled with the parent number) + **Download PDF** (`window.print()`; no `pdf-lib`, no
  canvas PDF generation). Batch is not shown on the receipt (course name only, stripped after
  ` ·`). Student ID is linkable to the student page (new tab). Razorpay is its own blue method
  pill. **Products & Materials is intentionally absent** — it is a separate planned feature.
- `server/src/lib/receipts.js` holds `receiptNumber`, `studentRef`, `amountWords` (Indian
  units), `inr`, `methodLabel`, `padDateLabel`, `monthName`, `escapeHtml`, and `receiptHtml()`.
  `server/src/lib/paymentReceipt.js` holds the shared `getPaymentRow`, `getPaymentRowByToken`,
  `paymentReceiptPayload`, `shareBase` so the staff and share routes share one formula.
- **Logo** — `Pravaha_logo.jpeg` (repo root) copied to `server/assets/pravaha-logo.jpeg`, served
  by `app.use('/assets', express.static(...))` in `server/src/index.js` (mounted **before** the
  `/api` auth guard). Displayed in a white square tile with
  `object-fit: cover; transform: scale(1.3)` (1.3 was signed off; 1.65 fills fully).
- **Public share link** — every payment gets a `share_token` (24-hex random, generated in
  `db.js`, applies to all inserts including imports/seed) → parent page at `GET /share/r/:token`
  (public, no auth; missing token → 404 page). Shared page omits staff chrome (no
  "Back to Billing", no "Share on WhatsApp") but keeps "Download PDF".
  Base URL from `WHATSAPP_RECEIPT_SHARE_BASE` else `APP_URL` else `http://localhost:5001`.

---

## Attendance (`/attendance`)

Static design at repo root: `design-attendance-alt.html` (chosen over the calendar-based
`design-attendance.html`, which was dropped).

- Single page = "Today's batches" table + "Unlogged days" table, both structured
  **Date | Batch | Timing | Course | Students | action**. A "View past attendance" link
  (right of the Today's heading) switches to a *Past attendance* sub-view
  ("← Back to attendance" returns). Intro hint renders as `.att-note`.
- Backend `server/src/routes/attendance.js`: `GET /api/attendance/day`,
  `GET /api/attendance/sessions?days=10`, `GET /api/attendance/batch/:id?date=`,
  `POST /api/attendance` (upsert); tables `attendance_logs` / `attendance_entries`.
- Semantics: roster = active enrollments of a batch (`batch_id`) deduped by student;
  save = replace (DELETE + INSERT) for that `(batch_id, batch_date)`; future dates rejected.
  Default day window = 10 days; the date field is the machine clock's "today".
- Known data note: the dev DB has one active batch — "Sunday batch" (id 1, Sundays, Malar).
  The mock's fictional batches (a–e, 25-student roster) exist only in the static HTML.

---

## WhatsApp (Meta WhatsApp Business Cloud API)

Business-initiated messages need **approved templates**, so all sends go through the template
path (free-form `sendText` is only valid inside Meta's 24-hour customer-service window).

### Setup

1. Create an app at https://developers.facebook.com (Business type).
2. **WhatsApp > Getting Started** → pick the **Cloud API** and connect a number (a free test
   number is available).
3. Copy the **Phone number ID** and generate a **temporary access token**.
4. Create the templates below in **Account tools > WhatsApp Manager > Message Templates**.
5. Fill in `server/.env` (see `server/.env.example`), restart the server, and use **Settings →
   send a test message** to confirm the status shows "configured".

Send endpoint: `graph.facebook.com/v21.0/{phone_number_id}/messages`
(version overridable via `WHATSAPP_API_VERSION`).

### Template 1 — fee reminder

Env `WHATSAPP_TEMPLATE_NAME`; **code default `fee_reminder`**, but the live `.env` currently sets
`payment_reminder_test` (the variant pending Meta re-approval after a bold-text edit).

- **4 body placeholders in this order**: `{{1}}` student name, `{{2}}` amount (e.g. "₹1,500"),
  `{{3}}` due date (e.g. "05 Oct 2026"), `{{4}}` batch/course.
- **1 URL button** "Pay Now" → the Razorpay link slug is substituted automatically.
- `WHATSAPP_TEMPLATE_LANGUAGE` must match the approved template's language
  (code default `en_US`; the live `.env` uses `en`).
- Real test recipient: Athuzhai (enrollment 7, `9176462333`).
- Reminders pause while the template is in review.

### Template 2 — `payment_receipt` (definitive spec)

- **Name** `payment_receipt` · **Category** Utility · **Language** `en` (must match
  `WHATSAPP_TEMPLATE_LANGUAGE`). Env `WHATSAPP_RECEIPT_TEMPLATE_NAME`.
- **Body** (3 params, order = name → amount → date, matching `sendReceipt()`):
  `Hello {{1}}, your payment of {{2}} received on {{3}} is confirmed. Thank you! Open your
  receipt using the button below.`
- **Button**: Website URL, text `View Receipt`, and this exact URL:
  `https://pravaha-crm-demo-production.up.railway.app/share/r/{{1}}`
  The host is fixed in the template and only the 24-hex `share_token` varies, so `sendReceipt()`
  sends the **bare token** as the button parameter (see `sendReceipt()` in `services/whatsapp.js`).
- Sample values: body `Nithilan`, `₹1,220`, `6 Sept 2026`. The button sample must be a **full
  URL** — Meta's editor requires that even though the API takes only the suffix — e.g.
  `https://pravaha-crm-demo-production.up.railway.app/share/r/9f3a1b7c2d4e5f6a8b0c1d2e`.
- **When the business subdomain replaces the Railway URL, update two things together**: the
  button URL in this Meta template *and* `WHATSAPP_RECEIPT_SHARE_BASE`. Missing either one means
  the button keeps pointing at the old host, since the template's host is frozen at creation.
- If the template is not approved, the **payment is still recorded** and the failed receipt send is
  written to `reminder_logs`. Note there is **no resend button** - receipts only fire when a
  payment is created (`routes/enrollments.js`) or the Razorpay webhook confirms one
  (`routes/webhooks.js`), so a failed send means messaging that parent manually.
- **Status: using the Railway URL for now.** The Railway host is a shared `*.up.railway.app`
  domain, so it *cannot* be verified with Meta — submitting anyway to avoid burning an approval
  attempt. If Meta rejects the template over the domain, the fix is the business subdomain
  (verify it in Meta Business Manager → Brand safety → Domains), not a code change.
- For a real PDF/image receipt you'd send a **document message** instead (media upload +
  document header, or an open 24h window) — not implemented.

### Dry run & notes

- `WHATSAPP_DRY_RUN=true` (or unset credentials) logs each intended message to the server
  console instead of sending. Default in code is dry-run **on**; the live `.env` sets
  `WHATSAPP_DRY_RUN=false`.
- `WHATSAPP_COUNTRY_CODE` (default `91`) is prepended to 10-digit local numbers.
- Every send or failure is recorded and visible via `GET /api/reminders/logs`.

---

## Razorpay

### Payment links

When a reminder (or a Dues→Collect with method Razorpay) is sent, the server creates a
**Razorpay Payment Link** for the exact due amount and attaches it to the "Pay Now" button.
The link expires after `RAZORPAY_LINK_EXPIRY_DAYS` (default 7 days).

- Test mode works immediately: keys are under **Settings > API Keys > Test mode**; payments are
  simulated and need no KYC. Live keys unlock after account verification (KYC).
- If Razorpay is unconfigured or the link fails, the reminder is **still sent** — just without
  the button — and the error is logged.
- Each student gets a unique link, so a reminder can include it once; re-reminding later
  creates a fresh link for the current balance.

### Webhook → auto-record payment

1. Expose the server to the internet (Razorpay cannot reach `localhost`). For local testing use
   a tunnel such as `ngrok http 5001`, or rely on the Railway deployment.
2. Razorpay dashboard → **Settings → Webhooks → Add New Webhook**:
   - **URL** `https://<public-url>/api/webhooks/razorpay`
   - **Secret** any strong string
   - **Active events** `payment_link.paid`
3. Put it in `server/.env` as `RAZORPAY_WEBHOOK_SECRET` and restart.

Behavior:
- Verifies the `x-razorpay-signature` against the raw body (rejects tampered/invalid calls).
- On `payment_link.paid` inserts a `fee_payments` row (method mapped from the Razorpay payment
  method, e.g. UPI/card) and stores the Razorpay payment id in `gateway_ref`, so **duplicate
  deliveries are ignored**.
- Then fires `sendPaymentReceiptForPayment` (fire-and-forget) so the parent gets the receipt.
- The enrollment's due recalculates automatically; refresh Dues/Billing to see it paid.

### Automatic receipt delivery

`server/src/services/paymentReceipts.js#sendPaymentReceiptForPayment` builds the message and
sends to `guardian_phone || student_phone`, logging to `reminder_logs` (sent/failed). It fires
from **both** confirmation paths: the Razorpay webhook and the manual Dues→Collect cash/UPI
route. Historical/backfilled payments do **not** resend.

---

## Design mocks

Static HTML at repo root. The user's approval process is **"HTML designs only first, logic
after"** — build and get sign-off on a mock before wiring backend/frontend.

| File | Status |
| ---- | ------ |
| `design-dues.html` | Frozen, approved, implemented |
| `design-billing.html` | Approved, implemented |
| `design-receipt.html` | Approved, implemented (self-fills a demo when opened with no query params) |
| `design-attendance-alt.html` | Approved, implemented |
| `design-attendance.html` | Rejected (calendar v4) |
| `design-batches.html` | Reference |
| `design-schedule.html` | Draft only — not approved, not implemented |

---

## Security audit (2026-09-24)

| # | Item | Verdict |
| - | ---- | ------- |
| 6 | Error handler leaked DB details | **Fixed** — central handler + catch blocks in `routes/enrollments.js`, `routes/reminders.js`, `routes/webhooks.js` no longer send `err.message` to clients; real errors go to the server console only. **Needs a server restart.** |
| 2 | Rate limiting | **Fixed** — `express-rate-limit` v8 on `POST /api/auth/login` (10 **failed** attempts / 15 min / IP; successes not counted, so mistyping never locks anyone out) and `POST /api/auth/forgot-password` (5 attempts / 15 min, all attempts counted). `app.set('trust proxy', 1)` is required for this to work behind Railway — without it every request shares the proxy's IP and one attacker could lock out every user. Store is in-memory, which is correct for the single-instance deployment; swap in a shared store before scaling out. Config: `AUTH_RATE_LOGIN_MAX`, `AUTH_RATE_RECOVERY_MAX`, `AUTH_RATE_WINDOW_MIN`, `TRUST_PROXY`. |
| 4 | Input validation | **Fixed** — SQL was already parameterized (no injection). Added `server/src/lib/validate.js`: `requireIntId` guards **every** `/:id` route across all routers (rejects `abc`, `-1`, `1.5`, `1 OR 1=1` with a 400 before the handler, and normalises `007` → `7`); `isEmail` / `isEmailOrEmpty` validate email format on login, forgot-password, user creation, and the optional student email. `toInt` also hardens the `course_id` / `batch_id` / `enrollmentIds` inputs. Fixed a **fail-open** in `POST /api/reminders/send`: a present-but-unusable `enrollmentIds` (wrong type, empty, or all-invalid) used to fall through to "remind every student with dues"; it now returns 400. Only an absent key means "all dues". |
| 3 | Supabase RLS | Not needed — the server owns the DB via `pg` with the full Postgres role; there is no direct client→DB path for RLS to police. |
| 5 | CORS | Not needed — open `cors()` is acceptable because frontend + API are same-origin on Railway (an external `*.onrender.com` frontend would be a wrong assumption); cookies are `SameSite=Lax`. |
| 1 | Secrets in git history | Clean — `.env` is gitignored, all secrets come from `process.env`, no hardcoded `rzp_*` / `sk_*` / connection URLs in tracked code. |
| 7 | Upload validation | N/A — no logo upload endpoint (logo is a static asset); CSV/XLSX import validates rows and is capped by the 5MB body limit. |

---

## Before go-live checklist

- [x] **Revert the demo login.** Commit `c7deb79` ("Login: accept any user ID") changed
      `client/src/pages/Login.jsx` to a "User ID" field (`type="text"`,
      `autoComplete="username"`, placeholder `Radhakannan`) so the demo could sign in by name.
      The client field is correct as-is. The **server** also had to change: the security audit
      (`4fff287`) added `isEmail(email)` to `POST /api/auth/login`, which rejected `Radhakannan`
      with a 400 and locked *everyone* out. Replaced with `isLoginId` in `lib/validate.js`,
      applied to login, forgot-password and user creation. The DB row is `Radhakannan` (the
      `users.email` column holds a user ID, email or not).
- [x] Confirm the final admin credentials and re-apply with `npm run create-admin`.
- [x] Set `COOKIE_SECURE=true` in the live `.env` (was `false`; set on Railway 2026-09-26).
- [x] Commit the security-audit fixes (#6 error leakage, #2 rate limiting, #4 input validation).
- [ ] Submit the `payment_receipt` template to Meta using the Railway URL (no domain
  verification - see the template spec above).

---

## Open items

- Confirm the new admin credentials and the **Name-field decision** (drop the Name field vs keep
  it optional), then apply via `npm run create-admin`.
- `server/src/seed.js` recreates sample courses; whether to purge them is unanswered.
- Course **basic/advanced level** field — needs clarification.
- Mail service — optional later; the recovery key covers password recovery for now.
- **Batch timing-change intimation** (planned, not started): notify parents of a *temporary*
  class timing change via WhatsApp — an intimation only, no fee logic. Decisions (2026-09-18):
  - Lives on the **Batches page** as a button per batch row; no dedicated nav page.
  - New template **`schedule_change`** with **5 body params**: `{{1}}` student name, `{{2}}` batch,
    `{{3}}` new day/time, `{{4}}` affected dates, `{{5}}` note. Env override
    `WHATSAPP_SCHEDULE_TEMPLATE_NAME`. **Dry-run until Meta approves.**
  - Sends to the **student's phone**.
  - Backend: `sendScheduleChange()` in `services/whatsapp.js` + `POST
    /api/reminders/schedule-change` with body `{batch_id, newTime, dayChange, dates, note}` →
    active enrollments of the batch → `student_phone` → log each in `reminder_logs` with
    `amount_due` NULL and the announcement text as the message. Faculty allowed.
  - Frontend: "Notify timing change" button + modal on `Batches.jsx` (current time read-only,
    new time text, optional day change, affected dates, optional note, live recipient count,
    message preview).
  - `design-schedule.html` exists as a draft; get user review, then wire backend → frontend.
- **Products & Materials** (planned, not started): the user wants its **own sidebar menu item**
  and its **own itemized section on the receipt**. Currently removed from the receipt entirely.
  The fee model stores a single `fee_payments.amount` — there is **no products table, no line
  items, no per-line pricing**, so this needs backend data (products table + linking sale items
  to a payment/receipt) plus a receipt section and a CRM page. No mock built yet.

---

## Feature status

| Feature | Status |
| ------- | ------ |
| Auth + roles (Phase 1) | Done |
| Students / Enrollments / Courses / Batches | Done |
| Attendance | Done |
| Dues page redesign | Done (code) — needs server restart |
| Billing page + receipt | Done (code) — needs server restart |
| Auto receipt via WhatsApp | Done |
| Public receipt share link | Done |
| Razorpay links + webhook | Done |
| Certificates | Done |
| CSV/XLSX import | Done |
| `payment_reminder_test` template | Pending Meta re-approval (bold-text edit) |
| `payment_receipt` template | Ready to submit (app now hosted) |
| Batch timing-change intimation | Planned |
| Products & Materials | Planned |

---

## Env var reference

See `server/.env.example` for the annotated list. Key groups:

- **Server** — `PORT`, `DATABASE_URL`, `PGSSL`, `TRUST_PROXY`
- **Sessions/auth** — `SESSION_TTL_DAYS`, `COOKIE_SECURE`, `ADMIN_EMAIL`, `ADMIN_NAME`,
  `ADMIN_PASSWORD`, `AUTH_RATE_LOGIN_MAX`, `AUTH_RATE_RECOVERY_MAX`, `AUTH_RATE_WINDOW_MIN`
- **WhatsApp** — `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_FROM_PHONE`,
  `WHATSAPP_TEMPLATE_LANGUAGE` (code default `en_US`), `WHATSAPP_COUNTRY_CODE` (default `91`),
  `WHATSAPP_DRY_RUN` (default `true`), `WHATSAPP_TEMPLATE_NAME` (code default `fee_reminder`),
  `WHATSAPP_RECEIPT_TEMPLATE_NAME` (default `payment_receipt`),
  `WHATSAPP_RECEIPT_SHARE_BASE`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **Certificates** — `CERT_BRAND`, `CERT_OWNER`, `CERT_OWNER_TITLE`, `CERT_SIGNATURE_PATH`
- **Razorpay** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
  `RAZORPAY_LINK_EXPIRY_DAYS` (default 7)

---

## API overview

Public (no session): `/api/health`, `/api/auth/*`, `/api/webhooks/*`, `/share/*`, `/assets/*`.
Everything else under `/api` requires a session cookie; **admin-only** endpoints are marked.

### Auth
| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/auth/login` | email + password → session cookie |
| POST | `/api/auth/logout` | clear session |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/change-password` | change own password |
| POST | `/api/auth/forgot-password` | email + recovery key + new password |
| POST | `/api/auth/regenerate-recovery-key` | rotate own recovery key |

### Students / courses / batches
| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET / POST | `/api/students` | list (search/status filters) / create |
| GET / PUT / DELETE | `/api/students/:id` | detail (enrollments + payments + timeline) / update / delete |
| GET / POST | `/api/courses` | list / create |
| PUT / DELETE | `/api/courses/:id` | update / delete (blocked if enrollments exist) |
| GET / POST | `/api/batches` | list / create |
| PUT / DELETE | `/api/batches/:id` | update / delete |

### Enrollments, payments, certificates
| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET / POST | `/api/enrollments` | list / create |
| GET / PUT / DELETE | `/api/enrollments/:id` | detail / update / delete |
| GET / POST | `/api/enrollments/:id/payments` | payment history / record a payment |
| POST | `/api/enrollments/:id/admission` | record Course + Admission + Kit as one receipt group |
| GET / POST | `/api/enrollments/:id/certificate` | view / generate course-completion certificate |
| GET | `/api/payments` | list (`month`, `from`, `to`, `course_id`) + `receipt_no`, `student_ref`, `share_url` |
| GET | `/api/payments/summary` | `{expected, paid, outstanding, count}` for a month |
| GET | `/api/payments/:id/receipt` | server-rendered HTML receipt (staff) |
| DELETE | `/api/payments/:id` | undo a payment |

### Dues / reminders
| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/reminders/dues` | overdue students (amount, days late, link_sent) |
| POST | `/api/reminders/send` | send reminders (`{enrollmentIds:[]}` or all dues) |
| GET | `/api/reminders/logs` | history (`?month=`, `?enrollment_id=`) |
| GET | `/api/reminders/status` | WhatsApp config state — **admin** |
| POST | `/api/reminders/test` | send a test WhatsApp message — **admin** |

### Attendance / stats / imports / users
| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/attendance/day` | today's batches + logged flags |
| GET | `/api/attendance/sessions` | recent sessions (`?days=10`) |
| GET | `/api/attendance/batch/:id` | one batch roster (`?date=`) |
| POST | `/api/attendance` | upsert a session (replace semantics) |
| GET | `/api/stats` | dashboard numbers |
| GET | `/api/imports/template.xlsx` | downloadable import template |
| POST | `/api/imports/students` | CSV/XLSX student import |
| GET / POST | `/api/users` | list / create — **admin** |
| PATCH / DELETE | `/api/users/:id` | update role/status / delete — **admin** |
| POST | `/api/users/:id/reset-password` | admin password reset — **admin** |
| POST | `/api/users/:id/regenerate-recovery-key` | rotate a user's key — **admin** |

### Public
| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/share/r/:token` | parent-facing receipt by `share_token` |
| POST | `/api/webhooks/razorpay` | `payment_link.paid` → record payment + send receipt |
| GET | `/api/health` | liveness |

---

## Misc notes / known data quirks

- Student id 1 (Aarav Sharma) was overwritten during a test then restored — two `Profile updated`
  timeline entries remain in his log (acceptable).
- `client/src/pages/FeesDues.jsx` and `Reminders.jsx` were **removed** (2026-09-21 money split);
  the old `/reminders` route is gone. Dues reminders and their history live on the Dues page
  (`/fees`) instead.
