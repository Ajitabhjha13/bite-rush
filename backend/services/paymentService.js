const crypto = require('crypto');
const Razorpay = require('razorpay');
const Reservation = require('../models/Reservation');
const booking = require('../config/booking');
const { BookingError, cancelBooking } = require('./bookingService');

let client = null;
const paymentsEnabled = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
function getClient() {
  if (!client) client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  return client;
}
function setClient(c) { client = c; } // tests inject a fake

// ---------- signatures ----------
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Checkout success: signature = HMAC_SHA256(order_id|payment_id, key_secret)
function verifyCheckoutSignature(orderId, paymentId, signature) {
  return safeEqualHex(hmac(process.env.RAZORPAY_KEY_SECRET || '', `${orderId}|${paymentId}`), signature);
}
// Webhook: signature = HMAC_SHA256(raw body, webhook secret)
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(hmac(secret, rawBody), signature);
}

// ---------- order creation ----------
function orderInfo(r) {
  return {
    order_id: r.razorpay_order_id,
    amount: r.amount,
    currency: 'INR',
    key_id: process.env.RAZORPAY_KEY_ID,
    timeout_seconds: booking.HOLD_MINUTES * 60,
    hold_expires_at: r.hold_expires_at
  };
}

async function createOrderForReservation(r) {
  if (r.razorpay_order_id) return orderInfo(r); // retry / double-click: same order
  const amount = booking.DEPOSIT_RUPEES * 100; // paise, decided by the SERVER only
  const order = await getClient().orders.create({
    amount, currency: 'INR', receipt: String(r._id),
    notes: { reservation_id: String(r._id), date: r.date, slot: r.slot }
  });
  const updated = await Reservation.findOneAndUpdate(
    { _id: r._id, razorpay_order_id: null },
    { $set: { razorpay_order_id: order.id, amount, payment_status: 'pending' } },
    { returnDocument: 'after' }
  );
  return orderInfo(updated || await Reservation.findById(r._id));
}

// ---------- refunds ----------
// Claims the refund first (none/failed -> processing) so it can never run twice.
async function refundPayment({ reservationId, paymentId, percent, reason }) {
  const claimed = await Reservation.findOneAndUpdate(
    { _id: reservationId, refund_status: { $in: ['none', 'failed'] } },
    { $set: { refund_status: 'processing', razorpay_payment_id: paymentId } },
    { returnDocument: 'after' }
  );
  if (!claimed) return { skipped: true };

  const amount = Math.round((claimed.amount * percent) / 100);
  if (amount <= 0) {
    await Reservation.updateOne({ _id: reservationId }, { $set: { refund_status: 'done', refund_amount: 0 } });
    return { amount: 0 };
  }
  try {
    const rf = await getClient().payments.refund(paymentId, {
      amount, notes: { reason, reservation_id: String(reservationId) }
    });
    await Reservation.updateOne({ _id: reservationId }, { $set: {
      refund_status: 'done', refund_id: rf.id, refund_amount: amount, refunded_at: new Date(),
      payment_status: percent === 100 ? 'refunded' : 'partially_refunded'
    } });
    return { amount, refund_id: rf.id };
  } catch (err) {
    await Reservation.updateOne({ _id: reservationId }, { $set: { refund_status: 'failed' } });
    throw err;
  }
}

// ---------- the one place a captured payment becomes a booking ----------
// Used by BOTH the checkout callback and the webhook, so they can never disagree.
async function applyCapturedPayment({ orderId, paymentId, amount, now = new Date() }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await Reservation.findOne({ razorpay_order_id: orderId });
    if (!r) return { outcome: 'unknown_order' };

    if (r.status === 'confirmed') {
      if (r.razorpay_payment_id === paymentId) return { outcome: 'already_confirmed', reservation: r };
      // A second, different payment on an already-paid booking -> give it back
      await getClient().payments.refund(paymentId, { amount, notes: { reason: 'duplicate_payment' } });
      return { outcome: 'duplicate_refunded', reservation: r };
    }
    if (amount !== r.amount) {
      await refundPayment({ reservationId: r._id, paymentId, percent: 100, reason: 'amount_mismatch' });
      return { outcome: 'refunded', reason: 'amount_mismatch' };
    }
    if (r.status === 'cancelled') {
      await refundPayment({ reservationId: r._id, paymentId, percent: 100, reason: 'paid_after_cancel' });
      return { outcome: 'refunded', reason: 'cancelled' };
    }
    if (booking.slotStart(r.date, r.slot) <= now) {
      await refundPayment({ reservationId: r._id, paymentId, percent: 100, reason: 'slot_started' });
      return { outcome: 'refunded', reason: 'slot_started' };
    }

    // status is 'held' or 'expired'. Try to (re)take the seat in ONE atomic update.
    // If someone else got the table meanwhile, the unique index rejects this (11000).
    const inTime = r.status === 'held' && r.hold_expires_at && r.hold_expires_at > now;
    try {
      const updated = await Reservation.findOneAndUpdate(
        { _id: r._id, status: { $in: ['held', 'expired'] } },
        { $set: {
          status: 'confirmed', is_active: true, hold_expires_at: null,
          payment_status: 'paid', razorpay_payment_id: paymentId
        } },
        { returnDocument: 'after' }
      );
      if (!updated) continue; // changed under us -> look again
      return { outcome: inTime ? 'confirmed' : 'reclaimed', reservation: updated };
    } catch (err) {
      if (err.code !== 11000) throw err;
      if ((err.keyPattern || {}).razorpay_payment_id) continue; // same payment processed in parallel
      await refundPayment({ reservationId: r._id, paymentId, percent: 100, reason: 'seat_taken_after_expiry' });
      return { outcome: 'refunded', reason: 'seat_taken' };
    }
  }
  throw new Error('Could not settle payment, will retry');
}

async function confirmWithPayment({ reservationId, userId, paymentId, signature, now = new Date() }) {
  const r = await Reservation.findById(reservationId);
  if (!r) throw new BookingError(404, 'Booking not found.');
  if (String(r.user) !== String(userId)) throw new BookingError(403, 'This is not your booking.');
  if (!r.razorpay_order_id) throw new BookingError(400, 'No payment was started for this booking.');
  if (!verifyCheckoutSignature(r.razorpay_order_id, paymentId, signature)) {
    throw new BookingError(400, 'Payment verification failed.');
  }
  const out = await applyCapturedPayment({ orderId: r.razorpay_order_id, paymentId, amount: r.amount, now });
  if (out.outcome === 'refunded') {
    throw new BookingError(409, 'Your 2-minute hold ended and the table was taken, so your payment has been refunded in full. Please book again.');
  }
  return out.reservation;
}

// ---------- webhook ----------
async function handleWebhookEvent(event, now = new Date()) {
  if (event.event !== 'payment.captured' && event.event !== 'order.paid') return { ignored: true };
  const p = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!p || !p.order_id || !p.id) return { ignored: true };
  return applyCapturedPayment({ orderId: p.order_id, paymentId: p.id, amount: p.amount, now });
}

// ---------- cancel + refund by policy ----------
async function cancelWithRefund({ reservationId, userId, now = new Date() }) {
  const before = await Reservation.findById(reservationId);
  const reservation = await cancelBooking({ reservationId, userId, now });
  const refund = { percent: 0, amount: 0, status: 'none' };

  if (before && before.status === 'confirmed' && reservation.payment_status === 'paid' && reservation.razorpay_payment_id) {
    refund.percent = booking.refundPercent(reservation.date, reservation.slot, now);
    if (refund.percent > 0) {
      try {
        const done = await refundPayment({
          reservationId, paymentId: reservation.razorpay_payment_id, percent: refund.percent, reason: 'customer_cancelled'
        });
        refund.amount = done.amount || 0;
        refund.status = 'processed';
      } catch (e) {
        refund.status = 'pending'; // booking is cancelled; refund is flagged 'failed' for a retry
      }
    }
  }
  return { reservation: await Reservation.findById(reservationId), refund };
}

module.exports = {
  paymentsEnabled, setClient, verifyCheckoutSignature, verifyWebhookSignature,
  createOrderForReservation, refundPayment, applyCapturedPayment, confirmWithPayment,
  handleWebhookEvent, cancelWithRefund
};
