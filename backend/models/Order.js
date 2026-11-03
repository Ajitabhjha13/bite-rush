const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Received', 'Preparing', 'Ready', 'Delivered', 'Cancelled'],
    default: 'Received'
  },
  // Who receives the food and where. A copy taken when the order is placed, so
  // later changes never rewrite an old order. Older orders do not have it.
  delivery: {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    address_line: { type: String, trim: true },
    area: { type: String, trim: true },
    landmark: { type: String, trim: true },
    pincode: { type: String, trim: true },
    city: { type: String, trim: true }
  },
  // 'cod': pay the delivery person. 'online': Razorpay (test mode), paid before the kitchen sees the order.
  payment_method: {
    type: String,
    enum: ['cod', 'online'],
    default: 'cod'
  },
  // 'none' for cash on delivery. Online orders start 'pending' (hidden from the kitchen and from the
  // customer's history), become 'paid' once Razorpay confirms, or 'expired' if the payment never happens.
  payment_status: {
    type: String,
    enum: ['none', 'pending', 'paid', 'expired', 'refunded', 'partially_refunded'],
    default: 'none'
  },
  amount: { type: Number, default: 0 },            // paise, decided by the server
  razorpay_order_id: { type: String, default: undefined },
  razorpay_payment_id: { type: String, default: undefined },
  paid_at: { type: Date, default: null },
  pay_by: { type: Date, default: null },            // pending orders are expired after this time
  refund_status: { type: String, enum: ['none', 'processing', 'done', 'failed'], default: 'none' },
  refund_id: { type: String, default: null },
  refund_percent: { type: Number, default: 0 },     // decided at cancellation, reused if the refund has to be retried
  refund_amount: { type: Number, default: 0 },      // paise
  refunded_at: { type: Date, default: null }
}, {
  timestamps: true
});

// One Razorpay order / payment can belong to at most one food order.
orderSchema.index({ razorpay_order_id: 1 }, { unique: true, partialFilterExpression: { razorpay_order_id: { $type: 'string' } } });
orderSchema.index({ razorpay_payment_id: 1 }, { unique: true, partialFilterExpression: { razorpay_payment_id: { $type: 'string' } } });
orderSchema.index({ payment_status: 1, pay_by: 1 });

module.exports = mongoose.model('Order', orderSchema);