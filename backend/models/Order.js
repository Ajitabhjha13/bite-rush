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
  // Only cash on delivery for now; online payment comes in a later step.
  payment_method: {
    type: String,
    enum: ['cod'],
    default: 'cod'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);