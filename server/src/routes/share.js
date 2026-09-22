import { Router } from 'express';
import { getPaymentRowByToken, paymentReceiptPayload } from '../lib/paymentReceipt.js';
import { receiptHtml } from '../lib/receipts.js';

const router = Router();

// Public, parent-facing receipt link: /share/r/<token>
router.get('/r/:token', (req, res) => {
  const payment = getPaymentRowByToken(req.params.token);
  if (!payment) {
    return res
      .status(404)
      .type('html')
      .send(
        '<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#8b8590">' +
          '<h2>Receipt not found</h2><p>This receipt link is invalid or may have been removed.</p>' +
          '<p>Pravaha Art Space · Chennai</p></body></html>',
      );
  }

  const r = paymentReceiptPayload(payment);
  res.type('html').send(receiptHtml(r, { shared: true }));
});

export default router;