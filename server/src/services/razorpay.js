import 'dotenv/config';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const apiUrl = process.env.RAZORPAY_API_URL || 'https://api.razorpay.com/v1';
const paymentLinkExpiryDays = Number(process.env.RAZORPAY_LINK_EXPIRY_DAYS) || 7;

let sdkClient = null;

function sdk() {
  if (!sdkClient) sdkClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return sdkClient;
}

function sdkFailure(err) {
  const httpStatus = Number(err?.statusCode || err?.status || 0) || 500;
  const description =
    err?.error?.description || err?.error?.reason || err?.message || 'Razorpay request failed.';
  console.error('[razorpay:error]', description);
  return { status: 'error', httpStatus, error: description };
}

export function isRazorpayConfigured() {
  return Boolean(keyId && keySecret);
}

/** Public key id, safe to return to the browser after authentication. */
export function razorpayKeyId() {
  return keyId;
}

/** `live` / `test` / `unconfigured`, derived from the key prefix. */
export function razorpayMode() {
  if (!isRazorpayConfigured()) return 'unconfigured';
  return keyId.startsWith('rzp_live_') ? 'live' : 'test';
}

export function isWebhookConfigured() {
  return Boolean(webhookSecret);
}

/** Verify the `x-razorpay-signature` header against the raw request body. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!webhookSecret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verify the Standard Checkout signature: HMAC-SHA256(order_id + "|" + payment_id). */
export function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Create a Razorpay order for Standard Checkout.
 * @param {{amount:number, currency?:string, receipt:string, notes?:object}} opts amount is in paise
 */
export async function createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  if (!isRazorpayConfigured()) {
    return {
      status: 'error',
      httpStatus: 500,
      error: 'Razorpay not configured (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).',
    };
  }
  if (!Number.isInteger(Number(amount)) || Number(amount) < 100) {
    return { status: 'error', httpStatus: 400, error: 'Amount must be at least 100 paise.' };
  }

  try {
    const order = await sdk().orders.create({
      amount: Number(amount),
      currency,
      receipt,
      notes,
    });
    return { status: 'ok', order };
  } catch (err) {
    return sdkFailure(err);
  }
}

/** Fetch an order so the server can trust its amount/notes during verification. */
export async function fetchOrder(orderId) {
  if (!isRazorpayConfigured()) {
    return {
      status: 'error',
      httpStatus: 500,
      error: 'Razorpay not configured (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).',
    };
  }

  try {
    const order = await sdk().orders.fetch(orderId);
    return { status: 'ok', order };
  } catch (err) {
    return sdkFailure(err);
  }
}

/** Local 10-digit number (strip country code) — what Razorpay expects for the customer. */
function localNumber(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  return p || null;
}

/**
 * Create a Razorpay Payment Link for a fee amount.
 * @param {{amount:number, currency?:string, customerName:string, customerPhone:string, description?:string, notes?:object}} opts
 * @returns {Promise<{status:string, id?:string, short_url?:string, url?:string, error?:string}>}
 */
export async function createPaymentLink({
  amount,
  currency = 'INR',
  customerName,
  customerPhone,
  description,
  notes = {},
}) {
  const contact = localNumber(customerPhone);
  if (!isRazorpayConfigured()) {
    return { status: 'unconfigured', short_url: null, error: 'Razorpay not configured (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).' };
  }
  if (!(Number(amount) > 0)) {
    return { status: 'error', short_url: null, error: `Invalid amount: ${amount}` };
  }
  if (!contact) {
    return { status: 'error', short_url: null, error: `Invalid customer phone: ${customerPhone}` };
  }

  const body = {
    amount: Math.round(Number(amount) * 100),
    currency,
    accept_partial: false,
    expire_by: Math.floor(Date.now() / 1000) + paymentLinkExpiryDays * 24 * 3600,
    reference_id: `fee_${notes.enrollment_id || 'e'}_${Date.now()}`,
    description: description || 'Fee payment',
    customer: { name: String(customerName || '').slice(0, 40), contact },
    notify: { sms: false, email: false },
    reminder_enable: true,
    notes,
  };

  try {
    const res = await fetch(`${apiUrl}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.description || data?.error?.field || JSON.stringify(data);
      console.error('[razorpay:error]', msg);
      return { status: 'error', short_url: null, error: msg };
    }
    return { status: 'ok', id: data.id, short_url: data.short_url || null, url: data.url || null };
  } catch (err) {
    console.error('[razorpay:error]', err.message);
    return { status: 'error', short_url: null, error: err.message };
  }
}