// Finds refunds that never finished and fixes them safely.
//
// A refund can get stuck in two ways:
//   failed      the Razorpay call returned an error (network, Razorpay down). Nothing was refunded.
//   processing  the server was claiming the refund and stopped before it wrote the result (restart, crash).
//               Razorpay may or may not have refunded.
//
// So before sending anything, we ask Razorpay what it already did for that payment. If the refund exists we
// only record it. A new refund is sent only when Razorpay shows none, so a customer is never refunded twice.
const Reservation = require('../models/Reservation');
const Order = require('../models/Order');
const pay = require('./paymentService');
const orderPay = require('./orderPaymentService');

const STUCK_AFTER_MS = 10 * 60 * 1000; // a 'processing' refund older than this is considered stuck
const KINDS = {
  booking: { Model: Reservation, label: 'table booking' },
  order: { Model: Order, label: 'food order' }
};

async function listStuck(now = new Date()) {
  const cutoff = new Date(now - STUCK_AFTER_MS);
  const out = [];
  for (const [kind, { Model }] of Object.entries(KINDS)) {
    const docs = await Model.find({
      razorpay_payment_id: { $ne: null },
      $or: [{ refund_status: 'failed' }, { refund_status: 'processing', updatedAt: { $lt: cutoff } }]
    }).lean();
    for (const d of docs) out.push({ kind, doc: d });
  }
  return out;
}

async function findById(id) {
  for (const [kind, { Model }] of Object.entries(KINDS)) {
    const doc = await Model.findById(id).lean();
    if (doc) return { kind, doc };
  }
  return null;
}

// percent: how much of the payment goes back. An order remembers it (refund_percent); a booking does not,
// so the person running this says it.
function expectedPercent(kind, doc, percent) {
  if (percent != null) return percent;
  if (kind === 'order' && doc.refund_percent) return doc.refund_percent;
  return null;
}

async function fixOne(id, { percent, apply = false, now = new Date() } = {}) {
  const found = await findById(id);
  if (!found) return { ok: false, reason: 'not_found' };
  const { kind, doc } = found;
  const { Model } = KINDS[kind];

  if (!doc.razorpay_payment_id) return { ok: false, reason: 'no_payment' };
  const stuckProcessing = doc.refund_status === 'processing' && doc.updatedAt < new Date(now - STUCK_AFTER_MS);
  if (doc.refund_status !== 'failed' && !stuckProcessing) {
    return { ok: false, reason: doc.refund_status === 'processing' ? 'still_processing' : 'nothing_to_fix', refund_status: doc.refund_status };
  }
  const pct = expectedPercent(kind, doc, percent);
  if (pct == null || pct <= 0 || pct > 100) return { ok: false, reason: 'need_percent' };
  const amount = Math.round((doc.amount * pct) / 100);

  // What does Razorpay say it already did?
  const rz = pay.getClient();
  const list = await rz.payments.fetchMultipleRefund(doc.razorpay_payment_id);
  const existing = ((list && list.items) || []).filter((r) => r.status !== 'failed');
  const already = existing.reduce((sum, r) => sum + (r.amount || 0), 0);
  const match = existing.find((r) => r.amount === amount);

  if (already > 0) {
    if (!match) return { ok: false, reason: 'refund_amount_differs', already, expected: amount };
    if (apply) {
      await Model.updateOne({ _id: doc._id }, { $set: {
        refund_status: 'done', refund_id: match.id, refund_amount: amount, refunded_at: new Date(),
        payment_status: pct === 100 ? 'refunded' : 'partially_refunded'
      } });
    }
    return { ok: true, action: 'recorded_existing_refund', refund_id: match.id, amount, applied: apply };
  }

  if (!apply) return { ok: true, action: 'would_send_refund', amount, applied: false };

  // Razorpay has no refund for this payment: safe to send one. A stuck 'processing' goes back to 'failed' first,
  // so the normal one-at-a-time claim can take it.
  if (doc.refund_status === 'processing') {
    await Model.updateOne({ _id: doc._id, refund_status: 'processing' }, { $set: { refund_status: 'failed' } });
  }
  const done = kind === 'booking'
    ? await pay.refundPayment({ reservationId: doc._id, paymentId: doc.razorpay_payment_id, percent: pct, reason: 'stuck_refund_fix' })
    : await orderPay.refundOrder({ orderId: doc._id, paymentId: doc.razorpay_payment_id, percent: pct, reason: 'stuck_refund_fix' });
  if (done.skipped) return { ok: false, reason: 'claimed_by_someone_else' };
  return { ok: true, action: 'sent_refund', refund_id: done.refund_id, amount: done.amount, applied: true };
}

module.exports = { listStuck, fixOne, STUCK_AFTER_MS };
