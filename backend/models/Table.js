const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true, min: 1 },
  seats: { type: Number, required: true, enum: [2, 4, 6] },
  // true = part of the pool reserved for online bookings; false = walk-in only
  bookable_online: { type: Boolean, default: true },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Table', tableSchema);
