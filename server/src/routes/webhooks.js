import { Router } from 'express';
import { get, run } from '../db.js';
import { verifyWebhookSignature, isWebhookConfigured } from '../services/razorpay.js';
import { getPaymentRow } from '../lib/paymentReceipt.js';
import { sendPaymentReceiptForPayment } from '../services/paymentReceipts.js';

const router = Router();

const METHOD_MAP = {
  upi: 'upi',
  card: 'card',
  netbanking: 'bank transfer',
  wallet: 'other',
  emi: 'other',
  paylater: 'other',
};

async function recordPayment({ enrollmentId, amountPaise, method, paymentId, linkId }) {
  const enrollment = await get('SELECT id FROM enrollments WHERE id = $1', enrollmentId);
  if (!enrollment) return { ok: false, reason: 'enrollment-not-found' };

  if (paymentId && (await get('SELECT id FROM fee_payments WHERE gateway_ref = $1', paymentId))) {
    return { ok: false, reason: 'duplicate' };
  }

  const amount = Math.round(Number(amountPaise)) / 100;
  if (!amount || amount <= 0) return { ok: false, reason: 'bad-amount' };

  const notes = `Razorpay online payment${linkId ? ` (${linkId})` : ''}`;
  const { lastInsertRowid } = await run(
    `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes, gateway_ref)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    enrollmentId,
    amount,
    new Date().toISOString().slice(0, 10),
    method || 'other',
    notes,
    paymentId || null,
  );
  return { ok: true, payment_id: lastInsertRowid, amount };
}

async function sendReceiptForPayment(paymentId) {
  const payment = await getPaymentRow(paymentId);
  if (!payment) return;
  try {
    const result = await sendPaymentReceiptForPayment(payment);
    console.log(`[whatsapp:receipt] payment=${paymentId} ->`, JSON.stringify(result));
  } catch (err) {
    console.error('[whatsapp:receipt]', err);
  }
}

router.post('/razorpay', async (req, res) => {
  try {
    if (!isWebhookConfigured()) {
      return res.status(400).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not configured.' });
    }
    if (!verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'))) {
      console.warn('[razorpay:webhook] invalid signature');
      return res.status(400).json({ error: 'Invalid signature.' });
    }

    const event = req.body || {};
    if (event.event === 'payment_link.paid') {
      const link = event.payload?.payment_link?.entity || {};
      const payment = event.payload?.payment?.entity || {};
      const enrollmentId = Number(link.notes?.enrollment_id);
      const result = await recordPayment({
        enrollmentId,
        amountPaise: link.amount_paid ?? payment.amount,
        method: METHOD_MAP[payment.method] || payment.method || 'other',
        paymentId: payment.id || null,
        linkId: link.id || null,
      });
      console.log(`[razorpay:webhook] payment_link.paid enrollment=${enrollmentId} ->`, JSON.stringify(result));

      if (result.ok) {
        await sendReceiptForPayment(result.payment_id);
      }
      return res.json({ ok: true, result });
    }

    console.log('[razorpay:webhook] ignored event:', event.event);
    res.json({ ok: true, ignored: event.event });
  } catch (err) {
    console.error('[razorpay:webhook]', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;