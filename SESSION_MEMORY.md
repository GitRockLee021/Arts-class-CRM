# CRM Session Memory

Last updated: 2026-09-21

## Project
Client-server CRM for Pravaha Art Space / Right & Left Learning Academy (arts class).
- `server/` — Node (ESM), Express, PostgreSQL via `pg` (hosted on Supabase), custom scrypt+session auth.
- `client/` — React 18 + Vite, react-router-dom v6, no UI framework (hand-rolled CSS).
- DB: PostgreSQL (Supabase) via `DATABASE_URL` in `server/.env`; schema auto-created on boot from `server/src/db.js` (was SQLite `server/data/crm.db` pre-migration).

## Important environment quirks
- Server runs as plain `node src/index.js` from `server/` — manual restart after every server-side change.
- PowerShell blocks `npm.ps1` → always build client with `cmd /c "npm run build"` from `client/`. Also use `railway.cmd` (not `railway`) for the Railway CLI.
- API bound to `http://localhost:5001`.
- **Hosting: Railway** — project `soothing-ambition` / service `pravaha-crm-demo`, repo `GitRockLee021/Arts-class-CRM`.
  - **Live URL: https://pravaha-crm-demo-production.up.railway.app**
  - Checking status: `railway.cmd status` from repo root.
  - Railway builds the repo itself.

## What's implemented (Login + Roles — Phase 1, DONE)
- **Auth**: email+password, scrypt hashing (node:crypto), HttpOnly SameSite=Lax cookie session, 30-day sliding TTL.
- **Roles**: `admin` (all) vs `faculty` (all EXCEPT Users/roles/permissions + Settings + reminders status/test). Faculty can do everything else (students/courses/batches/payments/imports/reminders/certificates).
- **Recovery key** (Option C chosen — no mail service): one-time key `RLLA-XXXX-XXXX-XXXX` shown once at user creation; "Forgot password?" on login = email + recovery key + new password. Admin can regenerate keys.
- Route guard in `server/src/index.js`: public = `/api/health`, `/api/auth/*`, `/api/webhooks/*`; everything else under `/api` requires auth. Admin-only handled per-router.
- Bootstrap: `npm run create-admin` (in `server/`, prompts or env `ADMIN_EMAIL`/`ADMIN_NAME`/`ADMIN_PASSWORD`; idempotent — resets password+key if email exists).
- Env: `SESSION_TTL_DAYS`, `COOKIE_SECURE` (set true on live HTTPS).

## Test accounts (local, dev only)
- Admin: `admin@rlla.app` — password/recovery key printed during setup; change with `npm run create-admin`.
- Faculty: `faculty@rlla.app` / `faculty12345`.
User has asked to change admin credentials (was mid-decision). Login identifier = email only; Name is display-only. Open: drop Name field vs keep optional.

## Notes on current state
- Admin password was reset back to `admin12345` after forgot-password testing; faculty account exists.
- Earlier data note: student id 1 (Aarav Sharma) was overwritten during a test then restored — two `Profile updated` timeline entries remain in his log (acceptable).
- WhatsApp template `payment_reminder_test`, language `en`, awaiting Meta-side bold edit / re-approval (reminders pause while in review). Real test recipient: Athuzhai (enroll. 7, `9176462333`).
- Fee rules: due day 5th, prorate after 15th. Courses: Varnam ₹1000, Arumbu ₹1200, Malar ₹1500.

## Before go-live checklist
- **REVERT demo login (commit `b2f5c88`, 2026-09-24)**: login was switched to "User ID / name" (placeholder `Radhakannan`, `type="text"`, `autoComplete="username"`) so the demo could sign in by name. Before going live, restore the previous email-based login in `client/src/pages/Login.jsx` (label `Email`, `type="email"`, `autoComplete="email"`, placeholder `admin@rlla.app`). Server route (`server/src/routes/auth.js` `/auth/login`) is already email-based — only the client field needs reverting.
- Also confirm admin credentials (see open items) and `COOKIE_SECURE=true` before launch.

## Known open items (deferred, unresolved)
- Live hosting now on **Railway** (see "Important environment quirks"). Supabase Postgres already in use as the DB; no other host in play.
- `server/src/seed.js` recreates sample courses; purge question unanswered.
- Course basic/advanced level field — clarify.
- Mail service optional later (recovery key suffices now).

## Feature: Money screens split (DONE 2026-09-21 — basic design)
Sidebar order: Dashboard | Students | Attendance | **Dues** | **Billing** | Courses | Batches | Users | Settings (Reminders menu removed).
- **Dues** (`client/src/pages/Dues.jsx`, route `/fees`, icon `rupee`): renamed from Fees & Dues. Same function: total outstanding, outstanding list, **Collect** (payment modal), per-row **Remind**, **Remind all** (kept here per user).
- **Billing** (`client/src/pages/Billing.jsx`, route `/billing`, icon `card`): basic design — summary cards (collected in range / count / this month), date-range + course filters, full payment history (Date | Student | Course·Batch | Method | Amount | Undo via `DELETE /api/payments/:id`). No reminder activity section (user removed it 2026-09-21 — Billing stays purely financial records). **SUPERSEDED** by the 2026-09-21 redesign (see "Billing page + receipt" section below).
- Backend: new `GET /api/payments` in `server/src/routes/payments.js` (query params `from`/`to`/`course_id`, returns `{ payments, summary:{total,count} }`, newest first). Old `DELETE /api/payments/:id` reused for Undo.
- Removed `client/src/pages/FeesDues.jsx` and `Reminders.jsx`; old `/reminders` route dropped (no client links to it — Dashboard links to `/fees`, which still works).
- Key APIs unchanged: `/api/reminders/dues`, `/api/reminders/send`, `/api/reminders/logs`, `/api/reminders/status`.

## Feature: Attendance (IMPLEMENTED 2026-09-21 — design approved same day)
Static design is at repo root: `design-attendance-alt.html` (chosen over `design-attendance.html`, the calendar-based v4 — the calendar idea was dropped).
- **Layout**: single page = "Today's batches" table + "Unlogged days" table (same structure, both **Date | Batch | Timing | Course | Students | action**). "View past attendance" link (right of Today's heading) switches to a *Past attendance* sub-view ("← Back to attendance" returns). Note: implemented faithfully, EXCEPT intro hint box not rendered? — no, hint rendered as `.att-note`.
- **Implemented pieces**: backend `server/src/routes/attendance.js` (GET `/api/attendance/day`, GET `/api/attendance/sessions?days=10`, GET `/api/attendance/batch/:id?date=`, `POST /api/attendance` upsert) + `attendance_logs`/`attendance_entries` tables; client `client/src/pages/Attendance.jsx` + nav/route `/attendance` (icon `clipboard`).
- **Bug fixed during wiring**: `/sessions` did not include a per-session `date` (withRecord dropped it) — the client couldn't render the Unlogged/Past lists. Fixed 2026-09-21. Routes otherwise verified end-to-end against real DB (login → roster → save → logged flag).
- **Semantics**: roster = active enrollments of a batch (`batch_id`), deduped by student; save = replace (DELETE + INSERT) for that `(batch_id, batch_date)`; future dates rejected. Default day window = 10 days; date field is machine-clock "today" (not the mock's pinned 2026-09-21).
- **Known data note**: real DB currently has one active batch "Sunday batch" (batch id 1, Sundays, Malar). Mock's fictional batches (a–e + 25-student roster) are NOT in the live DB — they only exist in the static HTML.

## Feature: Batch timing-change intimation (PLANNED, not started)
Notify parents/students of a **temporary** class timing change via WhatsApp — just an intimation, no fee logic.
- Decisions made (2026-09-18): lives on **Batches page** (button per batch row, no dedicated nav page); new WhatsApp template **`schedule_change`** with **dry-run until Meta approves** it; sends to **student's phone**; **HTML mockup first** (`design-schedule.html` at repo root, style of `design-batches.html`), then implement.
- Template `schedule_change` placeholders (5 body params): `{{1}}` student name, `{{2}}` batch, `{{3}}` new day/time, `{{4}}` affected dates, `{{5}}` note. Env override: `WHATSAPP_SCHEDULE_TEMPLATE_NAME` (default `schedule_change`).
- Backend: new `sendScheduleChange()` in `server/src/services/whatsapp.js`; new route `POST /api/reminders/schedule-change` body `{ batch_id, newTime, dayChange, dates, note }` → active enrollments for batch → to `student_phone` → log each in `reminder_logs` (`amount_due` NULL, message = announcement text). Faculty allowed (matches reminder perms). Update `.env.example` + README (mirror fee_reminder section).
- Frontend: `client/src/pages/Batches.jsx` "Notify timing change" button + modal (current time read-only, new time text, day change optional, affected dates, optional note, live recipient count, message preview). Notice logs only live in DB/`reminder_logs` — old `Reminders.jsx` page was removed (2026-09-21 money split); send history is no longer surfaced in UI.
- First step when back: build `design-schedule.html`, get user review, then wire backend → frontend.

## Feature: Billing receipt design (mock approved 2026-09-21)
- Mocks at repo root: `design-billing.html` (Billing page) + `design-receipt.html` (receipt page opened from the Receipt no link). User approval process is "html designs only first, logic later".
- Billing table columns agreed: **Receipt no | Date | Student | Course | Method | Amount** — Receipt no is a hyperlink that opens the receipt in a **new tab** (no Undo column in the design).
- Receipt page essentials (all derived from existing data): Receipt no → Date → Month → Payment mode (plain text, same style as Date/Month — no chip, no label, per user), then **Student ID | Student name | Parent | Mobile no.** (label stacked above value), Fee particulars = course row + "Course fee (Month)" line, total paid banner + amount in words, outstanding balance pill. Header meta = Receipt no / Date / Month / Payment mode as a 4-col or stacked grid (final = 4-col side-by-side, values under labels). WhatsApp share button prefills a parent message; Download PDF = `window.print()` on the card (no `pdf-lib` — **receipt will be a server-rendered HTML page**, not canvas/PDF generation).
- Label decisions: "Parent" (not Guardian), "Course fee" (not Tuition), batch NOT mentioned on the receipt (course name only; strip after ` ·`), course fee = single highlighted box + Total Amount = highlighted box, both amounts same 17px `.row-amt` size (vertically aligned).
- Logo: `Pravaha_logo.jpeg` (repo root, 2560x1978; art fills bbox x=554..2074, y=417..1452). Displayed in a white square tile at `img{width/height:100%; object-fit:cover; transform:scale(1.3)}` — sign-off at 1.3 (1.65 fills fully; 1.3 leaves breathing room). Real build should copy the logo into `client/src/assets/` (or serve from `server/assets/` like certificates).
- Receipt design convention: `design-receipt.html` self-fills a demo (Nithilan, ₹1,220, cash) when opened with no query params; billing mock passes per-payment params (studentId/guardian/phone/month) via `GUARD` map.
- **Products & Materials was REMOVED from the receipt** (was "Included (₹0)" placeholder) — user wants it as its own design later (see below). Design table later corrected (2026-09-21, user: "fees table corrections"): **Student ID column added before Student** (linkable to the student page, opens new tab), mobile removed from Student cell, **Razorpay** added as a payment mode (own blue chip + bar colour). Design mock table columns now: **Receipt no | Date | Student ID | Student | Course | Method | Amount**. These are all implemented live (see below).

## Feature: Billing page + receipt (IMPLEMENTED 2026-09-21, design approved)
The approved designs from `design-billing.html` / `design-receipt.html` are now live.
- **Billing.jsx** (`client/src/pages/Billing.jsx`): month picker (`input type="month"`, top-right of page head) drives both the list and the cards. 3 cards: **Collected (month)** ₹+count, **Outstanding dues (month)** ₹+student count, **Method split (month)** chips+bars (Cash/UPI/Card/Razorpay/other). Table = Receipt no (link → `/api/payments/:id/receipt`, new tab) | Date | Student ID (link → `/students/:id`, new tab, `PAS-2026-XXXX`) | Student (name only) | Course (no batch) | Method (pill) | Amount. Undo + date-range + course filters removed.
- **Backend** (`server/src/routes/payments.js`): `GET /api/payments` now accepts `month=YYYY-MM` (still supports `from`/`to`/`course_id`) and returns `receipt_no` (`RCPT-<year>-<id pad 4>`) + `student_ref` on each row. New `GET /api/payments/summary?month=` → `{ expected, paid, outstanding, count }` for active enrollments. New `GET /api/payments/:id/receipt` → server-rendered HTML page (auth via same-session cookie in the new tab; prints to PDF via `window.print()`; WhatsApp share prefill; `← Back to Billing` link; robust clipboard copy via hidden textarea + execCommand).
- **Monthly dues model** (`server/src/lib/monthly.js`): `expectedForMonth` attributes fee to calendar months (start month prorated if joined after the 15th, capped by `duration_months`; one_time counted only in its start month) — report = Σ max(expected − payments recorded in that month, 0) per active enrollment. First month's half-due rule shares `PRO_RATE_AFTER_DAY` from `fees.js`.
- **Receipt helpers** (`server/src/lib/receipts.js`): `receiptNumber`, `studentRef`, `amountWords` (Indian units), `inr`, `methodLabel`, `padDateLabel`, `monthName`, `escapeHtml`, and the full `receiptHtml(payload)` template mirroring the approved essentials-only design (include the logo as an inline `/assets/pravaha-logo.jpeg` tag).
- **Logo served**: `Pravaha_logo.jpeg` copied to `server/assets/pravaha-logo.jpeg`; `server/src/index.js` now mounts public `app.use('/assets', express.static(...))` (before the `/api` guard).
- Verified: `node --check` on all touched server files; `cmd /c "npm run build"` (client) OK; boot smoke-test on a spare port (health/logo 200, summary route mounted behind auth); logic smoke-test against the live DB (Sept 2026: expected ₹9,200, paid ₹2,420, outstanding ₹8,000/8 students; receipt for Nithilan ₹1,220 Sept → outstanding ₹0, words OK). **Server must be restarted** (`node src/index.js` in `server/`) for the running instance to pick this up.

## Feature: Auto payment receipt via WhatsApp (IMPLEMENTED 2026-09-21)
User ask: as soon as a payment is confirmed (Cash/UPI/Razorpay), message the parent automatically with a **receipt link they can open**.
- **Public receipt link**: each payment now gets a `share_token` (24-hex random, SQLite AFTER-INSERT trigger in `db.js`, applies to ALL inserts incl. imports/seed) → parent page at `GET /share/r/:token` (new public `server/src/routes/share.js`, no auth). Missing token → 404 page. Shared page omits staff chrome (no "Back to Billing", no "Share on WhatsApp") but keeps "Download PDF" (`receiptHtml(r, { shared: true })`). `share_url` also returned on each row of `GET /api/payments`.
- **Delivery**: shared service `server/src/services/paymentReceipts.js` (`sendPaymentReceiptForPayment`) builds the message (guardian_phone || student_phone), sends via `sendReceipt`, and logs to `reminder_logs` (sent/failed). Fired from BOTH confirmation paths: Razorpay webhook (`routes/webhooks.js`, now passes payment id) and manual Dues→Collect cash/UPI (`routes/enrollments.js` POST `/:id/payments`, fire-and-forget after insert). Historical/backfilled payments do NOT resend.
- **Template `payment_receipt`** (env `WHATSAPP_RECEIPT_TEMPLATE_NAME`): 3 body params (student name, ₹amount, date) + **URL button "View Receipt"** at `<WHATSAPP_RECEIPT_SHARE_BASE>/share/r/{{1}}` (env default `APP_URL` else `http://localhost:5001`; documented in `.env.example`). The URL button domain must be **verified with Meta** and the template must be **approved** before parents receive real messages (Meta template approvals still pending for this account; `WHATSAAP_DRY_RUN=false` in live `.env`). Code mirrors the payment_reminder button pattern in `services/whatsapp.js`.
- **Copy message button removed** from the receipt (user: "remove it") on both the live receipt (`lib/receipts.js`) and `design-receipt.html`. Receipt toolbar now = Share on WhatsApp (staff) + Download PDF; the share is a `wa.me` deep link (no Meta needed) that prefills the parent's number.
- Receipt code refactor: shared row-fetch + payload builder moved to `server/src/lib/paymentReceipt.js` (`getPaymentRow`, `getPaymentRowByToken`, `paymentReceiptPayload`, `shareBase`); staff route `GET /api/payments/:id/receipt` and share route both use it (single source of formula).

## Feature: `payment_receipt` WhatsApp template (definitive spec, to upload at hosting time)
Hosting is NOT done yet — **template approval + URL-button use waits until the app is hosted** (Meta reviewers check the button URL loads). Do NOT waste an approval attempt now; the reminder template `payment_reminder_test` (Pay Now → rzp.io) is the only one to pursue pre-hosting. Continue local testing with `WHATSAPP_DRY_RUN=true`.
- Template definition agreed (2026-09-21), to upload into Meta Business Manager once live:
  - **Name:** `payment_receipt` · **Category:** Utility · **Language:** `en` (must match `WHATSAPP_TEMPLATE_LANGUAGE` in `.env`).
  - **Body:** `Hello {{1}}, your payment of {{2}} received on {{3}} is confirmed. Thank you! Open your receipt using the button below.` (3 body params, order = name → amount → date — matches `sendReceipt()` calls).
  - **Button:** Website URL, text `View Receipt`, URL `https://YOUR-DOMAIN/share/r/{{1}}` — `{{1}}` filled with each payment's 24-hex `share_token`. Domain must be **verified with Meta** (connected to the WhatsApp Business account); `{{1}}` button sample e.g. `9f3a1b7c2d4e`.
  - **Samples (preview):** {{1}} `Nithilan`, {{2}} `₹1,220`, {{3}} `06 Sep 2026`.
  - API JSON form recorded in chat (UTILITY, BODY component + BUTTONS component) for automation later.
- Code already sends exactly these params in order; once approved + domain verified + `WHATSAPP_RECEIPT_SHARE_BASE=https://<live-domain>` set, receipts auto-deliver to parents with a working link.

## Feature: Products & Materials (PLANNED, not started)
- User direction: own **separate menu** item in the sidebar AND its own **section on the receipt** (itemized lines). For now it is removed entirely from the receipt mock.
- Current status: the fee model stores a single amount per payment (`fee_payments.amount`); there is **no products table, no line items, no per-line pricing**. Building this needs backend data (products table + linking sale items to a payment/receipt) plus a receipt section + a CRM page/menu.
- No mock built yet — next design step when user revisits this.

## Feature: Dues page redesign (mock FINAL/approved 2026-09-21, IMPLEMENTED 2026-09-21)
Mock at repo root: `design-dues.html` (frozen; Billing design language; iterated 4×, user: "This is ok", "Look great now", "freeze this").
- Scope decision: show **overdue only** — user: "No need to show the upcoming dues" (the Upcoming group + "Due this month" card were removed).
- Layout: page head (`Dues` + "As of <today> · month in progress"; right = Billing link + **Remind all**) → 2 stat cards → overdue table + totals footer + hint.
  - Card 1 **Collection gauge**: SVG donut % + collected ₹ of expected ₹ for the month = data from `/api/payments/summary?month=`.
  - Card 2 **Overdue**: ₹ total + student count + "oldest N days late".
  - Table: Student (avatar + name only — **no phone number**) | Course / batch | Due (**chip only, no date** — always "Overdue" + "N days late"; no separate "link sent" text — the **Resend link** action is the only signal) | Due amount (red) | Actions (**Collect** dark-red + **Remind** ghost; link-sent rows → **Resend link** ghost). `Collect` opens the payment modal (same as live `PaymentForm`).
- **Remind (decided 2026-09-21)**: clicking **Remind all** does NOT send immediately — it opens a **roster-picker modal** (attendance-style card grid: avatar + name + "₹amount due · +91 …", tap to toggle, all selected by default) and a "Send to N students" button; then a "Reminders sent" confirmation with per-recipient status chips. **No message preview** (user: it's a fixed Meta template, so a preview is pointless). Per-row **Remind** opens the same modal locked to that one student. Nothing sends until that confirm button is pressed.
- **Reminder history / log (decided 2026-09-21)**: the page-head **Reminder history** button opens a modal showing **only the current month's** reminders, **grouped by date** (newest first) — each student's time, amount, and delivery-status chip (so a student overdue 3+ months still shows their recent reminder, not the old ones). Header says "Reminders sent in <Month Year>". Each row also has a clock **Log** button → the single student's **full** history ("Reminder log — <student>", `+91 … · N reminders`, empty state "No reminders sent yet."). Chips: **Read** blue / **Delivered** green / **Sent** grey / **Failed** red (tick icons); the same chips appear in the "Reminders sent" confirmation. Statuses come from WhatsApp **status webhooks** (`sent→delivered→read`, `failed`) — **requires hosting**, no polling API; needs `wamid` stored per send + `delivery_status` columns. Design-preview only for now. Existing backend to extend: `GET /api/reminders/logs` (currently `ORDER BY id DESC LIMIT 100`; add month/per-student filter).
- **Collect modal — method branch (decided 2026-09-21)**: method ≠ Razorpay → plain "Record payment", records immediately (no complications). Method = **Razorpay** → hides the payment-date field, shows a helper note, and the submit button becomes **"Send payment link"**; on send it shows a "Payment link sent" confirmation and the row's action becomes **"Resend link"**. Parent pays → Razorpay webhook records it and the row returns to normal **automatically** (usual flow). The recipient number is shown in the modal helper ("goes to +91 …") and the sent confirmation. Recipient = `guardian_phone || student_phone` (same rule as the receipt service), so it can differ from the student's own phone. Backend already exists: `services/razorpay.js#createPaymentLink`, `/api/reminders/send` pattern, and `routes/webhooks.js` `payment_link.paid` → inserts payment + auto-sends receipt.
- **Overdue rule (decided 2026-09-21)**: due date = 5th (`MONTHLY_DUE_DAY`), **3-day grace → overdue from the 8th onward** (unpaid month M is overdue when today ≥ 8th of M; days late = today − 7, so on 21 Sep a 5-Sep due = "14 days late"). Multi-month overdue: amount = sum of every unpaid month's shortfall; `daysLate` counts from the **oldest** overdue month's 8th.

### Dues — implementation (2026-09-21)
- **Backend**: `server/src/lib/monthly.js` → new `OVERDUE_DAY = 8` + `enrollmentOverdue(enrollment, paidByMonth, now)` (per-month shortfalls, only overdue once past the 8th; returns `{amount, months, daysLate, since}`); `monthReport` extended with `total` (enrollments with expected>0), `paidCount`, `pct`.
- `server/src/lib/enrollments.js` → both queries now select `s.guardian_phone`.
- `server/src/routes/reminders.js` → `GET /dues` rewritten: returns overdue rows `{ id, student_id, student_name, student_phone, notify_phone, course_name, batch_name, amount_due, days_late, months_overdue, since, link_sent }` (sorted days-late desc); `notify_phone = guardian_phone || student_phone`; `link_sent` = a non-failed reminder was logged for that enrollment in the **current month**. `sendForEnrollment` now sends to `guardian_phone || student_phone`. `GET /logs` accepts `?month=YYYY-MM` and `?enrollment_id=` (LIMIT 300). Collection card data comes from existing `GET /payments/summary?month=`.
- **Frontend**: `client/src/pages/Dues.jsx` fully rebuilt — 2 cards (ring gauge from `collection.pct` + overdue total/count/oldest), overdue-only table (Status column = "Overdue" chip + "N days late [· N months]"), totals footer, hint; `CollectModal` (method branch incl. Razorpay → `/reminders/send`), `RemindModal` (roster picker + sent results), `LogModal` (per-student), `HistoryModal` (current month, datewise). Uses the shared `Modal`/`Field`/`useForm` UI kit.
- **Styles**: `client/src/styles.css` appended a `/* Dues */` block (ring gauge, `.stats`/`.stat.horizontal`, `.due-chip`, `.late-note`, `.amt`, `.tfoot`, `.hint`, `.link-note`, `.sent-panel`, `.deliv-list`/`.dstat`, `.pick-*` roster, `.hist-*`).
- **Icons**: added `history`, `clock`, `link`, `alert`, `check`, `checks` to `client/src/components/icons.jsx`.
- Verified: `node --check` on changed server files, real-DB smoke test of `enrollmentOverdue` (8 overdue rows; Diya 3 months ₹3000 / 76 days late), client `vite build` OK. **Server restart still required** to serve the new routes.

## Next steps (open)
1. Still pending: confirm new admin credentials (and the Name-field decision), apply them via `npm run create-admin`.
2. **Restart the running server** (`node src/index.js` in `server/`) to load the new Billing/Receipt code (month picker, cards, receipt page, monthly summary, `/assets` logo). Then verify on `http://localhost:5001/billing`: pick a month with data, click a Receipt no (new tab, prints/WhatsApps), click a Student ID (student page).
3. **Dues page — DONE (code)** (see "Dues — implementation"). Still requires the server restart from item 2, then verify on `http://localhost:5001/fees`: overdue list loads, Collect (Cash/UPI) records, Collect → Razorpay sends the link and the row flips to "Resend link", Remind all roster + Reminder history/Log modals work.
4. Then, when user revisits: `design-schedule.html` (batch timing-change intimation) and Products & Materials design (own menu + receipt section, needs a products table).