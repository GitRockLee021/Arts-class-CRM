# Pravaha Art Space — public website

This folder is a standalone static website for **Pravaha Art Space / Right & Left Learning Academy**.
It exists so Razorpay can verify a public business website when enabling live API keys.

It is deliberately separate from the CRM in `client/`:

- the CRM at `pravaha-crm.onrender.com` is a private, login-protected admin app;
- this site is public, has no login, and contains the pages Razorpay checks for;
- nothing here talks to the database or contains secrets.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home, programmes, payment note |
| `about.html` | About the academy and founder |
| `pricing.html` | Published monthly fees and one-time charges |
| `contact.html` | Address, phone, WhatsApp, email, map link |
| `terms.html` | Terms & conditions |
| `privacy.html` | Privacy policy |
| `refund.html` | Refund & cancellation policy |

The sample invoice is **not** published on the site. It lives at
`docs/razorpay/sample-invoice.png` and is uploaded directly to Razorpay when submitting the website
for verification. Send it to a parent only if they ask for an example.

The navigation and footer link to the policy pages on every page, which is what Razorpay's website
review looks for.

## Deploy on Render (free static site)

1. Render Dashboard → **New → Static Site**.
2. Connect the same GitHub repository (`GitRockLee021/Arts-class-CRM`), branch `master`.
3. Set:
   - **Name:** `pravaha-art-space`
   - **Root Directory:** `site`
   - **Build Command:** `echo "static site - no build step"`
   - **Publish Directory:** `.`
4. Create the site. The URL will be `https://pravaha-art-space.onrender.com`.
5. Open the URL and check Home, About, Pricing, Contact, Terms, Privacy and Refund.

If you choose a different Render name, update the absolute URLs in `robots.txt` and `sitemap.xml`
(and optionally add canonical tags). Relative links inside the site do not need changes.

## Submit to Razorpay

In Razorpay Dashboard (live mode) → **Account & Settings → Business website details**:

- **Website URL:** `https://pravaha-art-space.onrender.com`
- **Business name:** Pravaha Art Space / Right & Left Learning Academy
- **Business category:** Education / Fine arts classes
- **Sample invoice:** upload `docs/razorpay/sample-invoice.png`
- **Payment description:** Monthly fine arts class fees collected through Razorpay payment links and
  standard checkout.

The required pages are:

- About us → `/about.html`
- Contact us → `/contact.html`
- Pricing → `/pricing.html`
- Terms and conditions → `/terms.html`
- Privacy policy → `/privacy.html`
- Refund/cancellation policy → `/refund.html`

The sample invoice is uploaded in the Razorpay form, not linked from the public site.

After submission, Razorpay review can take up to 3 working days. Live API keys become available only
after the website is accepted.

## Updating fees

Fees are duplicated in `pricing.html` (table and mobile cards). Update both. The values currently match
the CRM `courses` table:

| Programme | Monthly | Admission | Kit |
| --- | ---: | ---: | ---: |
| Varnam | ₹950 | ₹300 | ₹500 |
| Vidhai | ₹1,200 | ₹300 | ₹600 |
| Thulir | ₹1,400 | ₹300 | ₹600 |
| Arumbu | ₹1,600 | ₹300 | ₹600 |
| Malar | ₹1,800 | ₹300 | — |
| Kani | ₹2,500 | ₹500 | — |

## Regenerate the sample invoice image

The image is drawn with the server's existing `@napi-rs/canvas` dependency:

```powershell
cd server
node scripts/generate-sample-invoice.mjs
```

The script writes `docs/razorpay/sample-invoice.png`. It does not read or write the database and the
file is not included in the published `site/` folder.
