const svc = require('../services/bookingService');
const pay = require('../services/paymentService');
const booking = require('../config/booking');
const Reservation = require('../models/Reservation');

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

// POST /api/bookings/hold   -> holds a table for 2 minutes (+ starts the Razorpay order)
const holdSeat = handle(async (req, res) => {
  const { date, slot, guests } = req.body;
  const idempotencyKey = req.body.idempotency_key || req.get('Idempotency-Key') || undefined;
  const { reservation, replayed } = await svc.holdSeat({
    userId: req.user._id, date, slot, guests, idempotencyKey
  });

  let payment = null;
  if (reservation.status === 'held' && pay.paymentsEnabled()) {
    try {
      payment = await pay.createOrderForReservation(reservation);
    } catch (err) {
      await svc.releaseHold(reservation._id); // don't leave the user stuck for 2 minutes
      throw new svc.BookingError(502, 'Could not start the payment. Please try again.');
    }
  }
  res.status(replayed ? 200 : 201).json({
    message: replayed ? 'Existing booking returned.' : 'Table held. Complete payment within 2 minutes.',
    reservation: await Reservation.findById(reservation._id),
    payment
  });
});

// POST /api/bookings/:id/confirm
//  - with razorpay_payment_id + razorpay_signature -> real flow
//  - with neither -> MOCK flow, only when BOOKING_MOCK_PAYMENT=true AND Razorpay is not configured
const confirmBooking = handle(async (req, res) => {
  const { razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;

  if (paymentId || signature) {
    if (!pay.paymentsEnabled()) return res.status(501).json({ message: 'Online payment is not enabled yet.' });
    const reservation = await pay.confirmWithPayment({
      reservationId: req.params.id, userId: req.user._id, paymentId, signature
    });
    return res.status(200).json({ message: 'Booking confirmed!', reservation });
  }

  if (process.env.BOOKING_MOCK_PAYMENT === 'true' && !pay.paymentsEnabled()) {
    const reservation = await svc.confirmHold({
      reservationId: req.params.id, userId: req.user._id, paymentRef: req.body.payment_ref || 'MOCK'
    });
    return res.status(200).json({ message: 'Booking confirmed!', reservation });
  }
  res.status(501).json({ message: 'Online payment is not enabled yet.' });
});

// GET /api/bookings/policy   (public) -> what the booking page shows
const getPolicy = (req, res) => {
  res.status(200).json({
    deposit_rupees: booking.DEPOSIT_RUPEES,
    hold_minutes: booking.HOLD_MINUTES,
    slots: booking.SLOTS,
    max_guests: 6,
    max_advance_days: booking.MAX_ADVANCE_DAYS,
    refund_policy: [
      { min_hours_before: booking.REFUND_FULL_HOURS, refund_percent: 100 },
      { min_hours_before: booking.REFUND_HALF_HOURS, refund_percent: 50 },
      { min_hours_before: 0, refund_percent: 0 }
    ]
  });
};

const getMyBookings = handle(async (req, res) => {
  res.status(200).json(await svc.listMyBookings(req.user._id));
});

const cancelBooking = handle(async (req, res) => {
  const { reservation, refund } = await pay.cancelWithRefund({ reservationId: req.params.id, userId: req.user._id });
  res.status(200).json({ message: 'Booking cancelled.', reservation, refund });
});

module.exports = { getPolicy, getAvailability, holdSeat, confirmBooking, getMyBookings, cancelBooking };
