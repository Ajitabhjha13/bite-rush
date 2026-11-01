const Table = require('../models/Table');
const Reservation = require('../models/Reservation');
const booking = require('../config/booking');
const { BookingError, expireStaleHolds } = require('./bookingService');
const { refundPayment } = require('./paymentService');

// Table x slot grid for one date (restaurant view). Any valid date is allowed,
// including today and the past: the customer-side cutoff does not apply here.
async function getGrid(date, now = new Date()) {
  if (!booking.isValidDateString(date)) throw new BookingError(400, 'Invalid date.');
  await expireStaleHolds(now);

  const [tables, reservations] = await Promise.all([
    Table.find().sort({ number: 1 }).lean(),
    Reservation.find({ date, is_active: true }).populate('user', 'name email').lean()
  ]);

  const byCell = new Map(reservations.map((r) => [`${r.table}|${r.slot}`, r]));
  const onlineIds = new Set(tables.filter((t) => t.bookable_online && t.is_active).map((t) => String(t._id)));

  let confirmed = 0, held = 0, guests = 0, freeOnline = 0;
  const rows = tables.map((t) => {
    const cells = {};
    for (const slot of booking.SLOTS) {
      const r = byCell.get(`${t._id}|${slot}`);
      if (!r) {
        cells[slot] = null;
        if (onlineIds.has(String(t._id))) freeOnline += 1;
        continue;
      }
      if (r.status === 'confirmed') { confirmed += 1; guests += r.guests; } else held += 1;
      cells[slot] = {
        reservation_id: r._id,
        status: r.status,
        guests: r.guests,
        customer: r.user ? { name: r.user.name, email: r.user.email } : null,
        amount: r.amount,
        payment_status: r.payment_status,
        razorpay_payment_id: r.razorpay_payment_id || null,
        attendance: r.attendance,
        hold_expires_at: r.hold_expires_at
      };
    }
    return { _id: t._id, number: t.number, seats: t.seats, bookable_online: t.bookable_online, is_active: t.is_active, cells };
  });

  return {
    date,
    slots: booking.SLOTS,
    tables: rows,
    summary: { confirmed, held, expected_guests: guests, free_online_slots: freeOnline }
  };
}

// Seated / no-show can only be set once the booking day has arrived.
async function setAttendance({ reservationId, attendance, now = new Date() }) {
  const r = await Reservation.findById(reservationId);
  if (!r) throw new BookingError(404, 'Booking not found.');
  if (r.status !== 'confirmed') throw new BookingError(409, 'Only confirmed bookings can be marked.');
  if (r.date > booking.istToday(now)) {
    throw new BookingError(409, 'Attendance can only be marked on the day of the booking.');
  }
  return Reservation.findOneAndUpdate(
    { _id: r._id, status: 'confirmed' },
    { $set: { attendance } },
    { returnDocument: 'after' }
  );
}

// The restaurant cancels (e.g. a table is out of order): customer always gets 100% back.
async function adminCancel({ reservationId }) {
  const r = await Reservation.findById(reservationId);
  if (!r) throw new BookingError(404, 'Booking not found.');
  if (!['held', 'confirmed'].includes(r.status)) throw new BookingError(409, `This booking is already ${r.status}.`);
  if (r.attendance === 'seated') throw new BookingError(409, 'This party is already seated, so it cannot be cancelled.');

  const updated = await Reservation.findOneAndUpdate(
    { _id: r._id, status: { $in: ['held', 'confirmed'] }, attendance: { $ne: 'seated' } },
    { $set: { status: 'cancelled', is_active: false, hold_expires_at: null } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new BookingError(409, 'This booking was just changed. Please refresh.');

  const refund = { percent: 0, amount: 0, status: 'none' };
  if (r.status === 'confirmed' && updated.payment_status === 'paid' && updated.razorpay_payment_id) {
    refund.percent = 100;
    try {
      const done = await refundPayment({
        reservationId: r._id, paymentId: updated.razorpay_payment_id, percent: 100, reason: 'restaurant_cancelled'
      });
      refund.amount = done.amount || 0;
      refund.status = 'processed';
    } catch (e) {
      refund.status = 'pending'; // flagged refund_status:'failed' for a retry
    }
  }
  return { reservation: await Reservation.findById(r._id), refund };
}

// Move a table between the online pool and walk-in only, or switch it off.
async function updateTable({ tableId, bookable_online, is_active }) {
  const patch = {};
  if (bookable_online !== undefined) patch.bookable_online = bookable_online;
  if (is_active !== undefined) patch.is_active = is_active;
  const table = await Table.findByIdAndUpdate(tableId, { $set: patch }, { returnDocument: 'after' });
  if (!table) throw new BookingError(404, 'Table not found.');
  const upcoming = await Reservation.countDocuments({ table: tableId, is_active: true, date: { $gte: booking.istToday() } });
  return { table, upcoming_bookings: upcoming };
}

module.exports = { getGrid, setAttendance, adminCancel, updateTable };
