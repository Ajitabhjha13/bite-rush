// Paying for food orders online. Mirrors the table-deposit flow (paymentService.js) and shares its
// Razorpay client and signature checks. One function, applyOrderPayment, turns a captured payment into a
// paid order, whether the browser or the webhook tells us first.
const Order = require('../models/Order');
const rules = require('../config/orderPayment');
const pay = require('./paymentService');

class OrderPayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Orders waiting for a payment, or whose payment never came, are not real orders yet.
// $nin also matches documents without the field, so older orders stay visible.
const VISIBLE = { payment_status: { $nin: ['pending', 'expired'] } };

const toPaise = (rupees) => Math.round(rupees * 100);

// Expire orders whose payment window passed. Conditional update, so it can never undo a payment that just landed.
async function expireStale(now = new Date()) {
  return Order.updateMany(
    { payment_status: 'pending', pay_by: { $lt: now } },
    { $set: { payment_status: 'expired', status: 'Cancelled' } }
  );
}

// ---------- start a payment ----------
function paymentInfo(o) {
  return {
    order_id: o.razorpay_order_id,
    amount: o.amount,
    currency: 'INR',
    key_id: process.env.RAZORPAY_KEY_ID,
    timeout_seconds: rules.PENDING_MINUTES * 60
  };
}

// The amount comes from the order total on the SERVER, never from the browser.
async function startPayment(order) {
  if (!pay.paymentsEnabled()) throw new OrderPayError(503, 'Online payment is not available right now. Please choose cash on delivery.');
  const amount = toPaise(order.total_amount);
  let rz;
  try {
    rz = await pay.getClient().orders.create({
      amount, currency: 'INR', receipt: String(order._id),
      notes: { food_order_id: String(order._id) }
    });
  } catch (e) {
    throw new OrderPayError(502, 'Could not start the payment. Please try again or choose cash on delivery.');
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, razorpay_order_id: { $exists: false } },
    { $set: { razorpay_order_id: rz.id, amount, payment_status: 'pending' } },
    { returnDocument: 'after' }
  );
  return paymentInfo(updated || await Order.findById(order._id));
}

// ---------- refunds ----------
// Claims the refund first (none/failed -> processing) so it can never run twice.
// hide: the order never became real (late or wrong-amount payment), so it stays out of every list.
// amountPaise: refund exactly what the payment was, when that differs from the order amount.
async function refundOrder({ orderId, paymentId, percent, reason, hide = false, amountPaise }) {
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, refund_status: { $in: ['none', 'failed'] } },
    { $set: { refund_status: 'processing', razorpay_payment_id: paymentId } },
    { returnDocument: 'after' }
  );
  if (!claimed) return { skipped: true };

  const amount = amountPaise != null ? amountPaise : Math.round((claimed.amount * percent) / 100);
  if (amount <= 0) {
    await Order.updateOne({ _id: orderId }, { $set: { refund_status: 'done', refund_amount: 0 } });
    return { amount: 0 };
  }
  try {
    const rf = await pay.getClient().payments.refund(paymentId, {
      amount, notes: { reason, food_order_id: String(orderId) }
    });
    const set = {
      refund_status: 'done', refund_id: rf.id, refund_amount: amount, refunded_at: new Date(),
      payment_status: percent === 100 ? 'refunded' : 'partially_refunded'
    };
    if (hide) { set.payment_status = 'expired'; set.status = 'Cancelled'; }
    await Order.updateOne({ _id: orderId }, { $set: set });
    return { amount, refund_id: rf.id };
  } catch (err) {
    await Order.updateOne({ _id: orderId }, { $set: { refund_status: 'failed' } });
    throw err;
  }
}

// ---------- the one place a captured payment becomes a paid order ----------
async function applyOrderPayment({ razorpayOrderId, paymentId, amount, now = new Date() }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const o = await Order.findOne({ razorpay_order_id: razorpayOrderId });
    if (!o) return { outcome: 'unknown_order' };

    if (o.payment_status === 'paid' || o.payment_status === 'refunded' || o.payment_status === 'partially_refunded') {
      if (o.razorpay_payment_id === paymentId) return { outcome: 'already_paid', order: o };
      // a second, different payment on an order that is already paid -> give it back
      await pay.getClient().payments.refund(paymentId, { amount, notes: { reason: 'duplicate_payment' } });
      return { outcome: 'duplicate_refunded', order: o };
    }
    if (amount !== o.amount) {
      await refundOrder({ orderId: o._id, paymentId, percent: 100, reason: 'amount_mismatch', hide: true, amountPaise: amount });
      return { outcome: 'refunded', reason: 'amount_mismatch' };
    }
    if (o.payment_status === 'expired') {
      // the window closed and the order is gone from the kitchen's view: give the money back
      await refundOrder({ orderId: o._id, paymentId, percent: 100, reason: 'paid_after_expiry', hide: true });
      return { outcome: 'refunded', reason: 'expired' };
    }

    // pending -> paid in ONE conditional update
    try {
      const updated = await Order.findOneAndUpdate(
        { _id: o._id, payment_status: 'pending' },
        { $set: { payment_status: 'paid', razorpay_payment_id: paymentId, paid_at: now, pay_by: null } },
        { returnDocument: 'after' }
      );
      if (!updated) continue; // changed under us (e.g. expired just now) -> look again
      return { outcome: 'paid', order: updated };
    } catch (err) {
      if (err.code !== 11000) throw err;
      continue; // same payment processed in parallel
    }
  }
  throw new Error('Could not settle payment, will retry');
}

async function confirmWithPayment({ orderId, userId, paymentId, signature, now = new Date() }) {
  const o = await Order.findById(orderId);
  if (!o) throw new OrderPayError(404, 'Order not found.');
  if (String(o.user) !== String(userId)) throw new OrderPayError(403, 'This is not your order.');
  if (o.payment_method !== 'online' || !o.razorpay_order_id) throw new OrderPayError(400, 'No online payment was started for this order.');
  if (!pay.verifyCheckoutSignature(o.razorpay_order_id, paymentId, signature)) {
    throw new OrderPayError(400, 'Payment verification failed.');
  }
  const out = await applyOrderPayment({ razorpayOrderId: o.razorpay_order_id, paymentId, amount: o.amount, now });
  if (out.outcome === 'refunded') {
    throw new OrderPayError(409, 'Your payment arrived after the payment window closed, so it has been refunded in full. Please place the order again.');
  }
  return out.order;
}

// ---------- webhook ----------
async function handleWebhookEvent(event, now = new Date()) {
  if (event.event !== 'payment.captured' && event.event !== 'order.paid') return { ignored: true };
  const p = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!p || !p.order_id || !p.id) return { ignored: true };
  return applyOrderPayment({ razorpayOrderId: p.order_id, paymentId: p.id, amount: p.amount, now });
}

// ---------- cancelling a paid order ----------
// 100% back if the customer cancels within the window after paying, otherwise LATE_REFUND_PERCENT.
// The restaurant cancelling is always 100%.
function refundPercentFor(order, { byRestaurant = false, now = new Date() } = {}) {
  if (byRestaurant) return 100;
  const windowMs = (rules.FULL_REFUND_SECONDS + rules.GRACE_SECONDS) * 1000;
  return order.paid_at && now - order.paid_at <= windowMs ? 100 : rules.LATE_REFUND_PERCENT;
}

// Seconds the customer still has for a full refund (0 once it is over). Shown as a countdown.
function fullRefundSecondsLeft(order, now = new Date()) {
  if (!order.paid_at) return 0;
  return Math.max(0, Math.ceil(rules.FULL_REFUND_SECONDS - (now - order.paid_at) / 1000));
}

function isPaidOnline(o) {
  return o.payment_method === 'online' && ['paid', 'partially_refunded', 'refunded'].includes(o.payment_status) && o.razorpay_payment_id;
}

// Refund after the order has been marked Cancelled. Never throws: a failed refund is stored as 'failed' for a retry.
async function refundForCancellation(order, opts) {
  const out = { percent: 0, amount: 0, status: 'none' };
  if (!isPaidOnline(order) || order.refund_status === 'done' || order.refund_status === 'processing') return out;
  out.percent = refundPercentFor(order, opts);
  await Order.updateOne({ _id: order._id }, { $set: { refund_percent: out.percent } });
  try {
    const done = await refundOrder({
      orderId: order._id, paymentId: order.razorpay_payment_id, percent: out.percent,
      reason: opts && opts.byRestaurant ? 'restaurant_cancelled' : 'customer_cancelled'
    });
    out.amount = done.amount || 0;
    out.status = done.skipped ? 'none' : 'processed';
  } catch (e) {
    out.status = 'pending';
  }
  return out;
}

// Admin: try a failed refund again, using the same percent rule as when the order was cancelled.
async function retryRefund(orderId) {
  const o = await Order.findById(orderId);
  if (!o) throw new OrderPayError(404, 'Order not found.');
  if (o.refund_status !== 'failed') throw new OrderPayError(400, 'There is no failed refund on this order.');
  const percent = o.refund_percent || 100; // the percent decided when the order was cancelled
  const done = await refundOrder({ orderId: o._id, paymentId: o.razorpay_payment_id, percent, reason: 'refund_retry' });
  return { order: await Order.findById(orderId), amount: done.amount || 0 };
}

module.exports = {
  OrderPayError, VISIBLE, toPaise, expireStale, startPayment, applyOrderPayment, confirmWithPayment,
  handleWebhookEvent, refundPercentFor, fullRefundSecondsLeft, refundForCancellation, retryRefund, isPaidOnline, refundOrder
};
