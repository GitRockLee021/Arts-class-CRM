import { useRef, useState } from 'react';

import { api } from '../api.js';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  }).catch((err) => {
    scriptPromise = null;
    throw err;
  });

  return scriptPromise;
}

/**
 * Opens Razorpay Standard Checkout, then verifies the signature on the server.
 * `amount` is in rupees. The server creates the order (paise) and decides which
 * enrollment/payment row the verified payment belongs to.
 */
export default function RazorpayCheckoutButton({
  amount,
  enrollmentId,
  studentName,
  phone,
  description,
  feeType = 'tuition',
  note,
  label = 'Pay with Razorpay',
  className = 'btn btn-primary',
  disabled = false,
  onSuccess,
  onError,
  onDismiss,
}) {
  const [busy, setBusy] = useState(false);
  const failed = useRef(false);

  async function pay() {
    failed.current = false;
    onError?.('');
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      onError?.('Enter an amount of at least ₹1.');
      return;
    }

    setBusy(true);
    try {
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error('Razorpay Checkout is not available.');

      const order = await api.post('/create-order', {
        amount: amountPaise,
        currency: 'INR',
        enrollment_id: enrollmentId,
        fee_type: feeType,
        notes: note || '',
      });

      const key = order.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) throw new Error('Razorpay key is not configured.');
      if (!order.order_id) throw new Error('Razorpay did not return an order.');

      const checkout = new window.Razorpay({
        key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Pravaha Art Space',
        description: description || 'Fee payment',
        order_id: order.order_id,
        prefill: {
          name: studentName || '',
          contact: phone || '',
        },
        notes: { enrollment_id: enrollmentId ? String(enrollmentId) : '' },
        theme: { color: '#60438c' },
        handler: async (response) => {
          try {
            const result = await api.post('/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setBusy(false);
            onSuccess?.(result);
          } catch (err) {
            setBusy(false);
            onError?.(err.message || 'Payment verification failed.');
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            if (!failed.current) onDismiss?.();
          },
        },
      });

      checkout.on('payment.failed', (response) => {
        failed.current = true;
        setBusy(false);
        onError?.(response?.error?.description || 'Payment failed.');
      });

      checkout.open();
    } catch (err) {
      setBusy(false);
      onError?.(err.message || 'Could not start Razorpay Checkout.');
    }
  }

  return (
    <button type="button" className={className} disabled={disabled || busy} onClick={pay}>
      {busy ? 'Opening…' : label}
    </button>
  );
}
