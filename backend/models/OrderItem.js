const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem'
    // Not required at schema level — an OrderItem is EITHER a regular
    // menu item OR a combo (see `combo` below). The controller enforces
    // that exactly one of the two is set.
  },
  combo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Combo'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit_price: {
    type: Number,
    required: true,
    min: 0
  },
  spice_level: {
    type: String,
    enum: ['Mild', 'Medium', 'Hot'],
    default: null
  }
});

module.exports = mongoose.model('OrderItem', orderItemSchema);