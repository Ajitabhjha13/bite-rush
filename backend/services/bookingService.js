const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const booking = require('../config/booking');

class BookingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Turn every hold whose 2 minutes are over into 'expired' (frees the seat).
// Called lazily on every booking request AND by a sweeper in server.js.
async function expireStaleHolds(now = new Date()) {
  const res = await Reservation.updateMany(
    { status: 'held', hold_expires_at: { $lte: now } },
    { $set: { status: 'expired', is_active: false } }
  );
  return res.modifiedCount;
}

function assertBookable(date, slot, now) {
  if (!booking.isValidDateString(date)) throw new BookingError(400, 'Invalid date.');
  if (!booking.isValidSlot(slot) && slot !== undefined) throw new BookingError(400, 'Invalid time slot.');
  if (!booking.isBookableDate(date, now)) {
    throw new BookingError(400, 'Bookings for this date are closed. Tables can be booked up to 11:59 PM the night before, and up to 7 days ahead.');
  }
}

async function getAvailability(date, now = new Date()) {
  assertBookable(date, undefined, now);
  await expireStaleHolds(now);

  const [tables, taken] = await Promise.all([
    Table.find({ bookable_online: true, is_active: true }).lean(),
    Reservation.find({ date, is_active: true }).select('table slot').lean()
  ]);
  const takenSet = new Set(taken.map((r) => `${r.table}|${r.slot}`));

  const slots = booking.SLOTS.map((slot) => {
    const free = { 2: 0, 4: 0, 6: 0 };
    for (const t of tables) {
      if (!takenSet.has(`${t._id}|${slot}`)) free[t.seats] += 1;
    }
    return { slot, free, total_free: free[2] + free[4] + free[6] };
  });
  return { date, slots };
}

async function holdSeat({ userId, date, slot, guests, idempotencyKey, now = new Date() }) {
  if (!booking.isValidSlot(slot)) throw new BookingError(400, 'Invalid time slot.');
  if (!Number.isInteger(guests) || guests < 1 || guests > 6) {
    throw new BookingError(400, 'Guests must be between 1 and 6.');
  }
  assertBookable(date, slot, now);

  // Same client retry / double-click -> return the booking we already made
  if (idempotencyKey) {
    const existing = await Reservation.findOne({ idempotency_key: idempotencyKey });
    if (existing) {
      if (String(existing.user) !== String(userId)) throw new BookingError(409, 'Idempotency key already used.');
      return { reservation: existing, replayed: true };
    }
  }

  await expireStaleHolds(now);

  const [tables, taken] = await Promise.all([
    Table.find({ bookable_online: true, is_active: true, seats: { $gte: guests } })
      .sort({ seats: 1, number: 1 }).lean(), // best fit: smallest table that fits first
    Reservation.find({ date, slot, is_active: true }).select('table').lean()
  ]);
  const takenIds = new Set(taken.map((r) => String(r.table)));
  const candidates = tables.filter((t) => !takenIds.has(String(t._id)));

  for (const table of candidates) {
    try {
      const reservation = await Reservation.create({
        user: userId, table: table._id, date, slot, guests,
        status: 'held',
        hold_expires_at: booking.holdExpiry(now),
        idempotency_key: idempotencyKey || undefined
      });
      return { reservation, replayed: false };
    } catch (err) {
      if (err.code !== 11000) throw err;
      // A parallel request with the SAME key may have just won. MongoDB reports
      // only one of the violated indexes, so check the key first, always.
      if (idempotencyKey) {
        const existing = await Reservation.findOne({ idempotency_key: idempotencyKey });
        if (existing && String(existing.user) === String(userId)) return { reservation: existing, replayed: true };
      }
      const key = err.keyPattern || {};
      if (key.table) continue; // someone grabbed this table a moment ago -> try the next one
      if (key.date) throw new BookingError(409, 'You already have a booking for this time slot.');
      throw new BookingError(409, 'You already have a seat on hold. Complete that payment or wait 2 minutes for it to expire.');
    }
  }
  throw new BookingError(409, `No table available for ${guests} guest${guests > 1 ? 's' : ''} at this time. Please pick another slot.`);
}

// Payment succeeded -> confirm. One atomic update: only works if the hold is still valid.
async function confirmHold({ reservationId, userId, paymentRef, now = new Date() }) {
  const confirmed = await Reservation.findOneAndUpdate(
    { _id: reservationId, user: userId, status: 'held', hold_expires_at: { $gt: now } },
    { $set: { status: 'confirmed', is_active: true, hold_expires_at: null, payment_ref: paymentRef || null } },
    { returnDocument: 'after' }
  );
  if (confirmed) return confirmed;

  const r = await Reservation.findById(reservationId);
  if (!r) throw new BookingError(404, 'Booking not found.');
  if (String(r.user) !== String(userId)) throw new BookingError(403, 'This is not your booking.');
  if (r.status === 'confirmed') return r; // confirming twice is harmless
  if (r.status === 'held') await expireStaleHolds(now);
  throw new BookingError(409, 'Your 2-minute hold has expired, so the seat was released. Please book again.');
}

async function cancelBooking({ reservationId, userId, now = new Date() }) {
  const r = await Reservation.findById(reservationId);
  if (!r) throw new BookingError(404, 'Booking not found.');
  if (String(r.user) !== String(userId)) throw new BookingError(403, 'You can only cancel your own bookings.');
  if (!['held', 'confirmed'].includes(r.status)) {
    throw new BookingError(409, `This booking is already ${r.status}.`);
  }
  if (r.status === 'confirmed' && r.date <= booking.istToday(now)) {
    throw new BookingError(409, 'Bookings can only be cancelled before the day of the reservation.');
  }
  const updated = await Reservation.findOneAndUpdate(
    { _id: r._id, status: { $in: ['held', 'confirmed'] } },
    { $set: { status: 'cancelled', is_active: false, hold_expires_at: null } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new BookingError(409, 'This booking was just changed. Please refresh.');
  return updated;
}

async function listMyBookings(userId, now = new Date()) {
  await expireStaleHolds(now);
  return Reservation.find({ user: userId })
    .populate('table', 'number seats')
    .sort({ date: -1, slot: -1 });
}

module.exports = {
  BookingError, expireStaleHolds, getAvailability, holdSeat, confirmHold, cancelBooking, listMyBookings
};
