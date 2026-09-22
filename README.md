# Drawing Institute CRM

A mobile-friendly web app to manage students, course enrollments, fees, and WhatsApp fee reminders for a drawing institute.

## Features

- **Students** — add/edit/delete, guardian info, status, search by name or phone
- **Enrollments** — enroll students in courses with batch/schedule, track status (active / completed / left)
- **Fees** — monthly-fee model with automatic dues calculation and a record-payment flow
- **Fee reminders** — auto-detect students with dues and send WhatsApp Business API template messages
- **Dashboard** — active students, monthly fee expectation, collections, outstanding dues
- **Courses** — courses with monthly or one-time fees
- Works great on phones: bottom navigation, mobile card tables, responsive layout

## Tech stack

- Backend: Node.js (Express), SQLite via built-in `node:sqlite` (zero compile steps)
- Frontend: React (Vite) — mobile-first, no heavy UI framework
- WhatsApp: Meta WhatsApp Business Cloud API

## Quick start

Requires Node.js **22.5+** (Node 24 recommended).

```bash
npm run setup      # installs root, server, and client dependencies
npm run seed       # add sample students/courses/payments
npm run dev        # start API (http://localhost:5001) + web app (http://localhost:5173)
```

Open http://localhost:5173.

To open on a phone on the same Wi-Fi, use the laptop's LAN IP instead of `localhost` (Vite starts with `host: true`).

Not using the JS dev server? `npm run build` then start the server and open
http://localhost:5001 — the built app is served from the same port as the API.

## Project layout

```
server/
  data/crm.db          SQLite database (auto-created)
  src/
    db.js              connection + schema
    lib/fees.js        monthly-fee due calculation
    lib/enrollments.js enrollment + fee queries
    routes/            students, courses, enrollments, payments, reminders, stats
    services/whatsapp.js  Meta WhatsApp Business API integration
    seed.js            sample data
client/
  src/pages/           Dashboard, Students, Enrollments, Fees, Courses, Reminders, Settings
  src/components/      forms, modal, badges, icons
```

## Fees logic

Fees are assumed to be **monthly**. For an active enrollment starting on day X:

- expected installments = months since start + 1 (the starting month counts)
- if the student **joins after the 15th**, the starting month is charged at **half fee**
- dues = (expected installments × monthly fee, prorated as above) − payments recorded

Monthly dues are payable by the **5th** of the month for every student (a joining day
no longer drives the due date). `one_time` fee mode uses a single expected installment.
Overdue amounts show up on the **Fees & Dues** page and are used as the basis for
reminders.

## WhatsApp reminders (Meta WhatsApp Business API)

The app sends reminders as a **template message** named `fee_reminder`. Since
business-initiated WhatsApp messages require approved templates, do the following:

1. Go to https://developers.facebook.com and create an app (Business type).
2. In **WhatsApp > Getting Started**, pick the **Cloud API** and connect a WhatsApp
   number (a free test number is available).
3. Copy the **Phone number ID** and generate a **temporary access token**.
4. Create the template `fee_reminder` in your WhatsApp Business account
   (Account tools > WhatsApp Manager > Message Templates). It must have 4 body
   placeholders passed in this order:
   `{{1}}` student name, `{{2}}` amount (e.g. "₹1,500"), `{{3}}` due date
   (e.g. "05 Oct 2026"), `{{4}}` batch/course — plus one **URL button** named
   "Pay Now" whose website URL is `https://rzp.io/{{1}}` (the Razorpay payment
   link slug is filled in automatically).
5. Copy `server/.env.example` to `server/.env` and fill in:

   ```env
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   WHATSAPP_ACCESS_TOKEN=<token>
   WHATSAPP_DRY_RUN=false        # false = send for real
   RAZORPAY_KEY_ID=<test or live key id>
   RAZORPAY_KEY_SECRET=<key secret>
   ```

6. Restart the server. On the **Settings** page you can send a test message and
   confirm the status shows "configured". Then use **Remind all** on the Fees page.

Every send (or failure) is recorded in the app and visible on the **Reminders** page.

### Razorpay payment links

When a reminder is sent, the server creates a **Razorpay Payment Link** for the
exact due amount and attaches it to the "Pay Now" button in the template. The link
expires after `RAZORPAY_LINK_EXPIRY_DAYS` (default 7 days).

- Test mode works immediately: keys are on the Razorpay dashboard under
  **Settings > API Keys > Test mode** — payments created are simulated and don't
  need KYC. Live keys unlock after your account verification (KYC) completes.
- If Razorpay is not configured or the link fails, the reminder is still sent —
  just without the "Pay Now" button — and the error is logged on the Reminders page.
- Because each student gets a unique link, a reminder can include the same link
  once; re-reminding later creates a fresh link for the current balance.

### Auto-recording payments (Razorpay webhook)

When a parent pays a payment link, Razorpay can call the CRM to record the fee
automatically, so the enrollment flips from due to paid without manual entry.

1. Expose the server to the internet (Razorpay can't reach `localhost`). For
   local testing use a tunnel such as `ngrok http 5001` (or deploy the server).
2. In Razorpay dashboard → **Settings → Webhooks → Add New Webhook**:
   - **Webhook URL:** `https://<your-public-url>/api/webhooks/razorpay`
   - **Secret:** any strong string — copy it
   - **Active events:** `payment_link.paid`
3. Put the secret in `server/.env` as `RAZORPAY_WEBHOOK_SECRET=<secret>` and restart.

Behavior:
- The handler verifies the `x-razorpay-signature` against the raw body (rejects
  tampered/invalid calls).
- On `payment_link.paid` it inserts a `fee_payments` row (method mapped from the
  Razorpay payment method, e.g. UPI/card) and links `gateway_ref` to the Razorpay
  payment id so **duplicate deliveries are ignored**.
- The enrollment's due recalculates automatically; refresh Fees/Dues to see it paid.

### Automatic payment receipts (WhatsApp)

After a Razorpay webhook records a payment, the CRM also sends the parent a
WhatsApp **`payment_receipt`** confirmation automatically. Create that template
once in WhatsApp Manager with **3 body placeholders** in this order:
`{{1}}` student name, `{{2}}` amount (e.g. "₹1,500"), `{{3}}` date (e.g. "15 Sep 2026").

- Named via `WHATSAPP_RECEIPT_TEMPLATE_NAME` (default `payment_receipt`).
- If the receipt template isn't approved yet, the payment is still recorded — the
  receipt send is logged under **Reminders** as failed/error so you can retry later.
- Want an actual PDF/image receipt? Generate a document (PDF) and send it as a
  WhatsApp **document message** — requires a media upload + a document header or an
  open 24h window. Ask the maintainer to add it on top of this flow.

### Dry-run mode

By default `WHATSAPP_DRY_RUN=true` (or unset credentials) logs each intended message
to the server console instead of sending it. Your data stays safe while testing.

### Notes

- `WHATSAPP_COUNTRY_CODE` (default `91`) is prepended to 10-digit local numbers.
- The API message endpoint is `graph.facebook.com/v21.0/{phone_number_id}/messages`.
- Free-form text via `sendText` is only valid within Meta's 24-hour customer-service
  window; reminders intentionally use the template path so they always deliver.

## API overview

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET / POST | `/api/students` | list (search/status filters) / create |
| GET / PUT / DELETE | `/api/students/:id` | detail (with enrollments + payments) / update / delete |
| GET / POST | `/api/courses` | list / create |
| PUT / DELETE | `/api/courses/:id` | update / delete (blocked if enrollments exist) |
| GET / POST | `/api/enrollments` | list / create |
| GET / PUT / DELETE | `/api/enrollments/:id` | detail / update / delete |
| POST | `/api/enrollments/:id/payments` | record a payment |
| DELETE | `/api/payments/:id` | undo a payment |
| GET | `/api/reminders/dues` | students with outstanding dues |
| POST | `/api/reminders/send` | send reminders (`{enrollmentIds:[]}` or all dues) |
| GET | `/api/reminders/logs` | sent-reminder history |
| GET | `/api/reminders/status` | WhatsApp config state |
| POST | `/api/reminders/test` | send a test WhatsApp message |
| GET | `/api/stats` | dashboard numbers |