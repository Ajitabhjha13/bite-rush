const svc = require('../services/bookingService');

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof svc.BookingError) return res.status(error.status).json({ message: error.message });
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };
}

// GET /api/bookings/availability?date=YYYY-MM-DD   (public)
const getAvailability = handle(async (req, res) => {
  res.status(200).json(await svc.getAvailability(req.query.date));
});

// POST /api/bookings/hold   -> holds a table for 2 minutes
const holdSeat = handle(async (req, res) => {
  const { date, slot, guests } = req.body;
  const idempotencyKey = req.body.idempotency_key || req.get('Idempotency-Key') || undefined;
  const { reservation, replayed } = await svc.holdSeat({
    userId: req.user._id, date, slot, guests, idempotencyKey
  });
  res.status(replayed ? 200 : 201).json({
    message: replayed ? 'Existing booking returned.' : 'Table held. Complete payment within 2 minutes.',
    reservation
  });
});

// POST /api/bookings/:id/confirm   -> MOCK payment (Razorpay replaces this later)
const confirmBooking = handle(async (req, res) => {
  if (process.env.BOOKING_MOCK_PAYMENT !== 'true') {
    return res.status(501).json({ message: 'Online payment is not enabled yet.' });
  }
  const reservation = await svc.confirmHold({
    reservationId: req.params.id, userId: req.user._id, paymentRef: req.body.payment_ref || 'MOCK'
  });
  res.status(200).json({ message: 'Booking confirmed!', reservation });
});

const getMyBookings = handle(async (req, res) => {
  res.status(200).json(await svc.listMyBookings(req.user._id));
});

const cancelBooking = handle(async (req, res) => {
  const reservation = await svc.cancelBooking({ reservationId: req.params.id, userId: req.user._id });
  res.status(200).json({ message: 'Booking cancelled.', reservation });
});

module.exports = { getAvailability, holdSeat, confirmBooking, getMyBookings, cancelBooking };
