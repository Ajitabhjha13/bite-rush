const crypto = require('crypto');
const pay = require('../services/paymentService');
const events = require('../services/orderEvents');
const orderPay = require('../services/orderPaymentService');
const WebhookEvent = require('../models/WebhookEvent');

// One line per webhook so Render's logs show what Razorpay sent and what we did (no secrets, no payloads).
const log = (...a) => { if (process.env.NODE_ENV !== 'test') console.log('[webhook]', ...a); };

// POST /api/payments/webhook  (body is a raw Buffer, see routes/paymentRoutes.js)
const webhook = async (req, res) => {
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) return res.status(400).json({ message: 'Invalid body' });

  if (!pay.verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) {
    log('rejected: invalid signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ message: 'Invalid JSON' }); }

  // Razorpay retries for up to 24h and may send an event more than once
  const eventId = req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(raw).digest('hex');
  try {
    await WebhookEvent.create({ event_id: eventId, event: event.event });
  } catch (e) {
    if (e.code !== 11000) return res.status(500).json({ message: 'Server error' });
    const seen = await WebhookEvent.findOne({ event_id: eventId });
    if (seen && seen.processed) { log(event.event, eventId, '-> duplicate, already processed'); return res.status(200).json({ status: 'duplicate' }); }
    // seen but never finished (e.g. earlier crash) -> process again; it is idempotent
  }

  try {
    // One webhook serves both table deposits and food orders: try the booking first, then the food order.
    let result = await pay.handleWebhookEvent(event);
    if (result && result.outcome === 'unknown_order') result = await orderPay.handleWebhookEvent(event);
    if (result && result.order && ['paid', 'already_paid'].includes(result.outcome)) events.publish(result.order); // a payment the browser never reported
    log(event.event, eventId, '->', (result && (result.outcome || (result.ignored && 'ignored'))) || 'done');
    await WebhookEvent.updateOne({ event_id: eventId }, { $set: { processed: true } });
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    log(event.event, eventId, '-> FAILED:', err && err.message);
    // non-2xx makes Razorpay retry later
    res.status(500).json({ message: 'Processing failed, please retry' });
  }
};

module.exports = { webhook };
