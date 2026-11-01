const mongoose = require('mongoose');

// One row per Razorpay webhook event id -> lets us ignore Razorpay's retries.
const webhookEventSchema = new mongoose.Schema({
  event_id: { type: String, required: true, unique: true },
  event: { type: String, default: '' },
  processed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 } // auto-clean after 30 days
});

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
