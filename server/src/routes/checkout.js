import { Router } from 'express';

import { get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';
import { getPaymentRow } from '../lib/paymentReceipt.js';
import { sendPaymentReceiptForPayment } from '../services/paymentReceipts.js';
import {
  createOrder,
  fetchOrder,
  isRazorpayConfigured,
  razorpayKeyId,
  verifyPaymentSignature,
} from '../services/razorpay.js';

const router = Router();
const FEE_TYPES = ['tuition', 'admission', 'kit', 'other'];

function toFeeType(value) {
  return FEE_TYPES.includes(value) ? value : 'tuition';
}

function receiptRef(enrollmentId) {
  return `crm_${enrollmentId ? `e${enrollmentId}` : 'misc'}_${Date.now()}`.slice(0, 40);
}

function cleanReceipt(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
}

/**
 * Create an order for Razorpay Standard Checkout.
 * `amount` is in paise, matching the Razorpay Orders API.
 */
router.post(
  '/create-order',
  ah(async (req, res) => {
    const body = req.body || {};
    const amount = Number(body.amount);

    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({ error: 'amount must be an integer of at least 100 paise.' });
    }

    const currency = String(body.currency || 'INR').toUpperCase();
    if (currency !== 'INR') {
      return res.status(400).json({ error: 'Only INR is supported.' });
    }

    const enrollmentId = body.enrollment_id == null ? null : Number(body.enrollment_id);
    if (body.enrollment_id != null && (!Number.isInteger(enrollmentId) || enrollmentId <= 0)) {
      return res.status(400).json({ error: 'Invalid enrollment_id.' });
    }

    if (enrollmentId) {
      const enrollment = await get(
        `SELECT e.id, s.name AS student_name, s.guardian_name, s.phone, s.guardian_phone, s.email
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         WHERE e.id = $1`,
        enrollmentId,
      );
      if (!enrollment) {
        return res.status(400).json({ error: 'Enrollment not found.' });
      }
    }

    if (!isRazorpayConfigured()) {
      return res.status(500).json({ error: 'Razorpay is not configured.' });
    }

    const note = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) : '';
    const notes = {
      enrollment_id: enrollmentId ? String(enrollmentId) : '',
      fee_type: toFeeType(body.fee_type),
    };
    if (note) notes.crm_note = note;

    const result = await createOrder({
      amount,
      currency,
      receipt: cleanReceipt(body.receipt) || receiptRef(enrollmentId),
      notes,
    });

    if (result.status !== 'ok') {
      const status = result.httpStatus === 401 ? 401 : 500;
      return res.status(status).json({ error: result.error || 'Could not create Razorpay order.' });
    }

    res.json({
      order_id: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
      key_id: razorpayKeyId(),
      receipt: result.order.receipt,
    });
  }),
);

/**
 * Verify a Standard Checkout payment, then record it against the enrollment
 * stored in the Razorpay order notes. The order is re-fetched from Razorpay so
 * the client cannot tamper with the amount or enrollment id.
 */
router.post(
  '/verify-payment',
  ah(async (req, res) => {
    const body = req.body || {};
    const orderId = String(body.razorpay_order_id || '');
    const paymentId = String(body.razorpay_payment_id || '');
    const signature = String(body.razorpay_signature || '');

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields.' });
    }

    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    const existing = await get('SELECT id FROM fee_payments WHERE gateway_ref = $1', paymentId);
    if (existing) {
      return res.json({ ok: true, payment_id: existing.id, already_recorded: true });
    }

    const orderResult = await fetchOrder(orderId);
    if (orderResult.status !== 'ok') {
      const status = orderResult.httpStatus === 401 ? 401 : 500;
      return res
        .status(status)
        .json({ error: orderResult.error || 'Could not verify the Razorpay order.' });
    }

    const order = orderResult.order;
    const enrollmentId = Number(order.notes?.enrollment_id);
    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.json({ ok: true, recorded: false });
    }

    const enrollment = await get('SELECT id FROM enrollments WHERE id = $1', enrollmentId);
    if (!enrollment) {
      return res.status(400).json({ error: 'Enrollment not found for this payment.' });
    }

    const amount = Math.round(Number(order.amount)) / 100;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid order amount.' });
    }

    const feeType = toFeeType(order.notes?.fee_type);
    const note = order.notes?.crm_note ? ` — ${String(order.notes.crm_note).slice(0, 200)}` : '';
    const notes = `Razorpay checkout (${orderId})${note}`;

    const { lastInsertRowid } = await run(
      `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes, fee_type, gateway_ref)
       VALUES ($1, $2, $3, 'razorpay', $4, $5, $6)`,
      enrollmentId,
      amount,
      new Date().toISOString().slice(0, 10),
      notes,
      feeType,
      paymentId,
    );

    const payment = await getPaymentRow(lastInsertRowid);
    if (payment) {
      sendPaymentReceiptForPayment(payment).catch((err) =>
        console.error('[whatsapp:receipt]', err),
      );
    }

    res.json({
      ok: true,
      payment_id: lastInsertRowid,
      amount,
      enrollment_id: enrollmentId,
      receipt: 'queued',
    });
  }),
);

export default router;
