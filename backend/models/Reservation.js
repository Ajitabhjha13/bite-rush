const mongoose = require('mongoose');
const { SLOTS } = require('../config/booking');

const ACTIVE_STATUSES = ['held', 'confirmed'];

const reservationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // IST date
  slot: { type: String, required: true, enum: SLOTS },
  guests: { type: Number, required: true, min: 1, max: 6 },
  status: {
    type: String,
    enum: ['held', 'confirmed', 'expired', 'cancelled'],
    default: 'held'
  },
  // Mirrors status ∈ {held, confirmed}. Unique indexes below only apply while
  // true, so an expired/cancelled booking frees the seat automatically.
  // NOTE: set by the pre-validate hook; any raw update that changes `status`
  // must set `is_active` too.
  is_active: { type: Boolean, default: true },
  hold_expires_at: { type: Date, default: null },
  idempotency_key: { type: String, default: undefined },
  payment_ref: { type: String, default: null }
}, { timestamps: true });

reservationSchema.pre('validate', function () {
  this.is_active = ACTIVE_STATUSES.includes(this.status);
});

// 1) A table can have only one live booking per date+slot (kills double-booking)
reservationSchema.index(
  { table: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { is_active: true }, name: 'uniq_live_table_slot' }
);
// 2) A user can have only one live booking per date+slot
reservationSchema.index(
  { user: 1, date: 1, slot: 1 },
  { unique: true, partialFilterExpression: { is_active: true }, name: 'uniq_live_user_slot' }
);
// 3) A user can have only one seat on hold at a time (no hoarding tables)
reservationSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'held' }, name: 'uniq_user_single_hold' }
);
// 4) Same client retry/double-click -> same idempotency key -> one booking
reservationSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } }, name: 'uniq_idempotency_key' }
);

module.exports = mongoose.model('Reservation', reservationSchema);
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
