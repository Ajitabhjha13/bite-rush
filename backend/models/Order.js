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
    enum: ['Received', 'Preparing', 'Ready', 'Delivered'],
    default: 'Received'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);