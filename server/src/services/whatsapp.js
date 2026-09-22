import 'dotenv/config';

const GRAPH_URL = 'https://graph.facebook.com';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';
const countryCode = process.env.WHATSAPP_COUNTRY_CODE || '91';
const dryRun = String(process.env.WHATSAPP_DRY_RUN).toLowerCase() !== 'false';

export function isConfigured() {
  return Boolean(phoneNumberId && accessToken);
}

export function waStatus() {
  return {
    configured: isConfigured(),
    phoneNumberId: phoneNumberId ? '(set)' : '',
    hasAccessToken: Boolean(accessToken),
    templateLanguage,
    countryCode,
    dryRun: dryRun || !isConfigured(),
  };
}

/** Turn any local/indian number into E.164 (e.g. 919876543210). */
export function normalizeNumber(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (!p) return null;
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 10) return `${countryCode}${p}`;
  if (p.length === 11 && p.startsWith(countryCode)) return p;
  return p;
}

async function callGraph(payload) {
  if (dryRun || !isConfigured()) {
    console.log('[whatsapp:dry-run]', JSON.stringify(payload));
    return { status: 'dry-run', message: 'WhatsApp not configured or dry-run mode on. Message logged instead of sent.' };
  }

  const url = `${GRAPH_URL}/${API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error?.message || JSON.stringify(data);
    console.error('[whatsapp:error]', err);
    return { status: 'error', message: err };
  }
  return { status: 'sent', waMessageId: data.messages?.[0]?.id || null };
}

/**
 * Turn a payment link (e.g. Razorpay short url https://rzp.io/l/xxxx) into the
 * suffix expected by a template URL button configured as `https://rzp.io/{{1}}`.
 */
function buttonUrlSuffix(url) {
  if (!url) return '';
  try {
    return new URL(url).pathname.replace(/^\/+/, '');
  } catch {
    return String(url).replace(/^https?:\/\/rzp\.io\//, '').split('?')[0];
  }
}

/**
 * Send a fee reminder using an approved WhatsApp template.
 * Create a template named exactly `whatsappTemplateName` with:
 *   - 4 body placeholders: {{1}} name, {{2}} amount, {{3}} due date, {{4}} batch
 *   - one URL button "Pay Now" whose website URL is `https://rzp.io/{{1}}`
 * When `paymentLink` is provided the button suffix (`l/xxxx`) is filled in.
 */
export async function sendFeeReminder({
  phone,
  name,
  amount,
  dueDate,
  batch,
  paymentLink,
  templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'fee_reminder',
}) {
  const to = normalizeNumber(phone);
  if (!to) return { status: 'error', message: `Invalid phone number: ${phone}` };

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: amount },
        { type: 'text', text: dueDate },
        { type: 'text', text: batch || '—' },
      ],
    },
  ];

  if (paymentLink) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: buttonUrlSuffix(paymentLink) }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components,
    },
  };
  return callGraph(payload);
}

/** Free-form text (only valid inside a 24h customer service window). */
export async function sendText(phone, text) {
  const to = normalizeNumber(phone);
  if (!to) return { status: 'error', message: `Invalid phone number: ${phone}` };
  return callGraph({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

/**
 * Send a payment receipt confirmation via an approved template.
 * Create a template named exactly `payment_receipt` with 3 body placeholders:
 * {{1}} student name, {{2}} amount (e.g. "₹1,500"), {{3}} date (e.g. "15 Sep 2026").
 * Optionally add a URL button "View Receipt" with website URL
 * `https://<share base>/share/r/{{1}}`; when `shareToken` is provided its suffix
 * is filled with that token so the parent can open the receipt.
 */
export async function sendReceipt({
  phone,
  name,
  amount,
  date,
  shareToken,
  templateName = process.env.WHATSAPP_RECEIPT_TEMPLATE_NAME || 'payment_receipt',
}) {
  const to = normalizeNumber(phone);
  if (!to) return { status: 'error', message: `Invalid phone number: ${phone}` };

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: amount },
        { type: 'text', text: date },
      ],
    },
  ];

  if (shareToken) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: shareToken }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components,
    },
  };
  return callGraph(payload);
}

/** Upload a file (image/document) to WhatsApp and return the media id. */
async function uploadMedia(buffer, mime, filename) {
  const url = `${GRAPH_URL}/${API_VERSION}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error?.message || JSON.stringify(data);
    console.error('[whatsapp:media-error]', err);
    return { status: 'error', message: err };
  }
  return { status: 'uploaded', mediaId: data.id };
}

/** Send an image message (requires an open 24h customer service window). */
export async function sendImage(phone, buffer, filename, caption) {
  const to = normalizeNumber(phone);
  if (!to) return { status: 'error', message: `Invalid phone number: ${phone}` };
  if (!isConfigured()) return { status: 'error', message: 'WhatsApp is not configured.' };
  if (dryRun) {
    console.log('[whatsapp:dry-run] sendImage', JSON.stringify({ to, filename, caption }));
    return { status: 'dry-run', message: 'Dry-run: certificate not actually uploaded/sent.' };
  }

  const media = await uploadMedia(buffer, 'image/png', filename);
  if (media.status !== 'uploaded') return media;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { id: media.mediaId, caption: caption || '' },
  };
  return callGraph(payload);
}

/** Send the approved reminder template with sample values (verifies template delivery). */
export async function sendTestMessage(phone, { paymentLink } = {}) {
  const to = normalizeNumber(phone);
  if (!to) return { status: 'error', message: 'Invalid phone number. Use full number with country code.' };

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'fee_reminder';
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: `Test Student${process.env.WHATSAPP_NAME_SUFFIX || "'s parent"}` },
        { type: 'text', text: '₹1,500' },
        { type: 'text', text: '05 Oct 2026' },
        { type: 'text', text: process.env.WHATSAPP_BATCH_LABEL || 'Weekday Morning' },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: buttonUrlSuffix(paymentLink) || 'test' }],
    },
  ];

  return callGraph({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: templateLanguage }, components },
  });
}