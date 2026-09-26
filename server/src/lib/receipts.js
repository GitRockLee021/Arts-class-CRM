const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function two(n) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function three(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
}

export function amountWords(n) {
  const num = Math.round(Number(n || 0));
  if (!num) return 'Zero Rupees Only';
  const out = [];
  let v = num;
  const cr = Math.floor(v / 10000000); v %= 10000000;
  const lk = Math.floor(v / 100000); v %= 100000;
  const th = Math.floor(v / 1000); v %= 1000;
  if (cr) out.push(three(cr) + ' Crore');
  if (lk) out.push(three(lk) + ' Lakh');
  if (th) out.push(three(th) + ' Thousand');
  if (v) out.push(three(v));
  return out.join(' ') + ' Rupees Only';
}

export function inr(n) {
  return '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
}

export function methodLabel(m) {
  const s = String(m || 'other');
  if (s === 'upi') return 'UPI';
  if (s === 'bank transfer') return 'Bank Transfer';
  if (/razorpay/i.test(s)) return 'Razorpay';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function receiptNumber(payment) {
  const year = String(payment.payment_date || '').slice(0, 4) || '2026';
  return `RCPT-${year}-${String(payment.id).padStart(4, '0')}`;
}

export function studentRef(studentId) {
  const y = String(studentId || '').slice(-4);
  return `PAS-2026-${String(studentId || '').padStart(4, '0')}`;
}

export function padDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mon = d.toLocaleDateString('en-IN', { month: 'short' });
  return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()}`;
}

export function monthName(ym) {
  if (!ym) return '';
  const [y, mo] = String(ym).split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const m = Number(mo);
  return m >= 1 && m <= 12 ? `${names[m - 1]} ${y}` : '';
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICON_PRINT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.515 5.258l-.999 3.648 3.973-1.605zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>';

/**
 * Mask identifying details for the public receipt. `/share/r/:token` is unauthenticated - anyone
 * holding the link can open it - so the shared view reduces names to initials and masks the
 * digits of the student ID. Fee line items, amounts, month and receipt no stay readable, so the
 * page still works as a receipt. Staff still get the real values in the CRM and on the internal
 * receipt (`receiptHtml(r)` without `shared`).
 */
function maskMobile(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return raw;
  const cc = /^\+\d{1,3}/.exec(raw);
  const lead = cc ? cc[0] : '';
  const tail = digits.slice(-4);
  const hidden = Math.max(digits.length - tail.length - lead.length, 0);
  return `${lead}${'•'.repeat(hidden)}${tail}`;
}

/** "Diya Patel" -> "D. P." */
function maskName(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return raw;
  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + '.')
    .join(' ');
}

/** "PAS-2026-0005" -> "PAS-••••-••••" (series letters kept, digits masked). */
function maskRef(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;
  return raw.replace(/\d/g, '•');
}

/** The identifying fields, masked only on the public/shared receipt. */
function identity(r, shared) {
  return {
    name: shared ? maskName(r.studentName) : r.studentName,
    guardian: shared ? maskName(r.guardian) : r.guardian,
    ref: shared ? maskRef(r.studentRef) : r.studentRef,
    mobile: shared ? maskMobile(r.mobile) : r.mobile,
  };
}

/**
 * Render the printable receipt page (HTML) for one payment.
 * @param {object} r
 *  {id, receipt_no, dateLabel, month, method, methodLabel, studentId, studentRef,
 *   studentName, guardian, mobile, course, amount, amountWords, outstanding}
 */
export function receiptHtml(r, opts = {}) {
  const shared = Boolean(opts.shared);
  const who = identity(r, shared);
  const outstandingText = r.outstanding > 0 ? `${inr(r.outstanding)}` : '₹0.00 (Nil)';
  const grouped = Boolean(r.lines?.length);
  const waDetail = grouped
    ? 'for *' + r.studentName + '* — new admission fees received:\n' +
      r.lines.map((ln) => '\u2022 ' + ln.title + ' — ' + inr(ln.amount)).join('\n')
    : 'for *' + r.studentName + '* for *' + r.course + '* (' + r.month + ')';
  const waText =
    '\u{1F3A8} *Pravaha Art Space — Receipt Confirmation*\n\n' +
    'Dear ' + (r.guardian !== '—' ? r.guardian : 'Parent') + ',\n' +
    'Thank you! Payment of *' + inr(r.amount) + '* ' + waDetail + ' has been received successfully.\n\n' +
    '\u{1F9FE} Receipt no: *' + r.receipt_no + '*\n' +
    '\u2705 Balance due: *' + (r.outstanding > 0 ? inr(r.outstanding) : '₹0.00 (Nil)') + '*\n\n' +
    'Warm regards,\nPravaha Art Space';
  const tel = String(r.mobile || '').replace(/\D/g, '').replace(/^0+/, '');
  const waLink = 'https://wa.me/' + (tel || '') + '?text=' + encodeURIComponent(waText);

  const toolbar = shared
    ? `<div class="toolbar">
    <div class="crumb">Payment receipt &nbsp;\u00b7&nbsp; <span>${escapeHtml(r.receipt_no)}</span></div>
    <div class="actions">
      <button class="btn btn-solid" onclick="window.print()">${ICON_PRINT}Download PDF</button>
    </div>
  </div>`
    : `<div class="toolbar">
    <div class="crumb">\u2190 <a href="/billing">Back to Billing</a> &nbsp;\u00b7&nbsp; <span>${escapeHtml(r.receipt_no)}</span></div>
    <div class="actions">
      <a class="btn btnwhats" target="_blank" rel="noopener" href="${waLink}">${ICON_WA}Share on WhatsApp</a>
      <button class="btn btn-solid" onclick="window.print()">${ICON_PRINT}Download PDF</button>
    </div>
  </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment Receipt — Pravaha Art Space</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap');
:root {
  --bg: #f7f4fa; --bg-2: #e9e3f0; --surface: #fffdf8; --surface-2: #f1ebf3;
  --ink: #2f2a36; --muted: #8b8590; --line: #e4dfec;
  --brand: #7a5ba8; --brand-dark: #60438c; --brand-2: #c09ad8; --brand-soft: #ede6f5;
  --ok: #2f8f6b; --ok-soft: #e4f2ec;
  --shadow: 0 2px 3px rgba(80,70,90,.06), 0 10px 26px rgba(80,70,90,.08);
  --font-body: 'Inter', Arial, sans-serif; --font-accent: 'Syne', 'Inter', sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); background-image: linear-gradient(160deg, var(--bg), var(--bg-2)); color: var(--ink); font-family: var(--font-body); font-size: 14px; -webkit-font-smoothing: antialiased; min-height: 100vh; }
button, a { font-family: inherit; }
.wrap { max-width: 860px; width: 100%; margin: 0 auto; padding: 20px 18px 80px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.toolbar .crumb { color: var(--muted); font-size: 13px; }
.toolbar .crumb a { color: var(--brand-dark); font-weight: 600; text-decoration: none; border-bottom: 1px dashed var(--brand-2); }
.toolbar .crumb a:hover { color: var(--brand); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { border: none; cursor: pointer; font-size: 13px; font-weight: 600; padding: 9px 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 7px; text-decoration: none; }
.btn:focus-visible { outline: 2px solid var(--brand-2); outline-offset: 2px; }
.btn-solid { background: var(--brand-dark); color: #fff; }
.btn-solid:hover { background: #4d3771; }
.btnwhats { background: #25d366; color: #fff; }
.btnwhats:hover { background: #1ebc5d; }
.btn-ghost { background: var(--surface); color: var(--brand-dark); border: 1px solid var(--line); }
.btn-ghost:hover { border-color: var(--brand); }
.btn svg { width: 15px; height: 15px; }
.receipt { background: var(--surface); border: 1px solid var(--line); border-radius: 26px 18px 28px 20px / 18px 26px 16px 22px; overflow: hidden; box-shadow: var(--shadow); }
.r-head { background: linear-gradient(135deg, var(--brand-dark), var(--brand)); color: #fff; padding: 22px 26px 16px; }
.r-head-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.r-brand { display: flex; align-items: center; gap: 12px; }
.r-mark { width: 48px; height: 48px; border-radius: 12px; background: #fff; display: grid; place-items: center; flex: none; box-shadow: 0 3px 10px rgba(43,25,74,.25); overflow: hidden; }
.r-mark img { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.3); }
.r-brand strong { font-family: var(--font-accent); font-size: 20px; line-height: 1; display: block; }
.r-brand small { color: rgba(255,255,255,.78); font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 600; }
.r-badge { background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.28); padding: 5px 12px; border-radius: 99px; font-size: 11px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; }
.r-badge-new { background: var(--brand-2); border-color: rgba(93,63,141,.35); color: #4d3771; }
.r-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.22); }
.r-meta .k { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255,255,255,.72); font-weight: 700; display: block; }
.r-meta .v { font-size: 13.5px; font-weight: 700; margin-top: 3px; }
.r-body { padding: 18px 26px 10px; }
.r-status { background: var(--ok-soft); border: 1px solid #cfe6db; border-radius: 14px; padding: 11px 14px; display: flex; align-items: center; gap: 11px; }
.r-status .tick { width: 28px; height: 28px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; flex: none; }
.r-status .tick svg { width: 15px; height: 15px; }
.r-status b { font-size: 13px; color: #1f5c45; text-transform: uppercase; letter-spacing: .4px; }
.r-status span { font-size: 12.5px; color: #2f7a5e; }
.r-status .paid { margin-left: auto; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--ok); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px 16px; margin-top: 18px; }
.cell .k { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); font-weight: 700; display: block; }
.cell .v { font-size: 13.5px; font-weight: 600; margin-top: 3px; display: block; }
.cell .v small { display: block; color: var(--muted); font-weight: 500; font-size: 12px; }
.sec-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--brand-dark); margin: 22px 0 10px; }
.row-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--brand-soft); }
.course-name { font-size: 15px; font-weight: 700; }
.course-sub { font-size: 12px; color: var(--muted); }
.row-amt { font-size: 17px; font-weight: 800; color: var(--brand-dark); font-variant-numeric: tabular-nums; }
.total { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--brand-soft); }
.total .course-sub { font-style: italic; }
.due { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; padding: 6px 2px; font-size: 13px; }
.due .lbl { color: var(--muted); }
.due .val { color: var(--ok); font-weight: 800; background: var(--ok-soft); border: 1px solid #cfe6db; padding: 4px 12px; border-radius: 99px; font-size: 12px; letter-spacing: .3px; }
.r-foot { margin-top: 20px; border-top: 1px solid var(--line); padding: 14px 26px 18px; text-align: center; background: var(--surface-2); border-radius: 0 0 26px 18px; }
.r-foot p { margin: 0; font-size: 13px; color: var(--muted); }
.r-foot b { color: var(--brand-dark); }
.r-foot .contact { font-size: 11.5px; margin-top: 4px; color: var(--muted); }
.r-foot .contact b { color: var(--muted); font-weight: 600; }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .wrap { max-width: 100%; padding: 0; }
  .receipt { box-shadow: none; border-radius: 0; border: none; }
}
</style>
</head>
<body>
<div class="wrap">
  ${toolbar}

  <div class="receipt">
    <div class="r-head">
      <div class="r-head-top">
        <div class="r-brand">
          <div class="r-mark"><img src="/assets/pravaha-logo.jpeg" alt="Pravaha Art Space" /></div>
          <div><strong>Pravaha Art Space</strong><small>Right &amp; Left Learning Academy</small></div>
        </div>
        <span class="r-badge">E-Receipt</span>
        ${grouped ? '<span class="r-badge r-badge-new">New admission</span>' : ''}
      </div>
      <div class="r-meta">
        <div><span class="k">Receipt no</span><span class="v">${escapeHtml(r.receipt_no)}</span></div>
        <div><span class="k">Date</span><span class="v">${escapeHtml(r.dateLabel)}</span></div>
        <div><span class="k">Month</span><span class="v">${escapeHtml(r.month)}</span></div>
        <div><span class="k">Payment mode</span><span class="v">${escapeHtml(r.methodLabel)}</span></div>
      </div>
    </div>

    <div class="r-body">
      <div class="r-status">
        <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>
        <div><b>Fee Payment Successful</b></div>
        <span class="paid">Paid in Full</span>
      </div>

      <div class="grid">
        <div class="cell"><span class="k">Student ID</span><span class="v">${escapeHtml(who.ref)}</span></div>
        <div class="cell"><span class="k">Student name</span><span class="v">${escapeHtml(who.name)}</span></div>
        <div class="cell"><span class="k">Parent</span><span class="v">${escapeHtml(who.guardian)}</span></div>
        <div class="cell"><span class="k">Mobile no.</span><span class="v">${escapeHtml(who.mobile)}</span></div>
      </div>

      <div class="sec-title">Fee Particulars</div>
      ${grouped
        ? r.lines
            .map(
              (ln) => `<div class="row-line">
        <div>
          <div class="course-name">${escapeHtml(ln.title)}</div>
          ${ln.sub ? `<div class="course-sub">${escapeHtml(ln.sub)}</div>` : ''}
        </div>
        <div class="row-amt">${inr(ln.amount)}</div>
      </div>`,
            )
            .join('')
        : `<div class="row-line">
        <div>
          <div class="course-name">${escapeHtml(r.course)}</div>
          <div class="course-sub">Course fee — ${escapeHtml(r.month)}</div>
        </div>
        <div class="row-amt">${inr(r.amount)}</div>
      </div>`}

      <div class="total">
        <div>
          <div class="course-name">Total Amount Paid</div>
          <div class="course-sub">${escapeHtml(r.amountWords)}</div>
        </div>
        <div class="row-amt">${inr(r.amount)}</div>
      </div>

      ${grouped ? '' : `
      <div class="due">
        <span class="lbl">Outstanding balance for this month</span>
        <span class="val">${outstandingText}</span>
      </div>`}
    </div>

    <div class="r-foot">
      <p>${shared
        ? 'Thank you for nurturing your child&rsquo;s creative journey at <b>Pravaha Art Space</b>.'
        : `Thank you for nurturing <b>${escapeHtml(r.studentName)}'s</b> creative journey at <b>Pravaha Art Space</b>.`}</p>
      <p class="contact"><b>Pravaha Art Space</b> +91 76656 580 | Chennai, India | This is a computer-generated receipt.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}