const svc = require('../services/adminBookingService');
const { BookingError } = require('../services/bookingService');

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof BookingError) return res.status(error.status).json({ message: error.message });
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };
}

const getGrid = handle(async (req, res) => {
  res.status(200).json(await svc.getGrid(req.query.date));
});

const setAttendance = handle(async (req, res) => {
  const reservation = await svc.setAttendance({ reservationId: req.params.id, attendance: req.body.attendance });
  res.status(200).json({ message: 'Attendance updated.', reservation });
});

const adminCancel = handle(async (req, res) => {
  const { reservation, refund } = await svc.adminCancel({ reservationId: req.params.id });
  res.status(200).json({ message: 'Booking cancelled by the restaurant.', reservation, refund });
});

const retryRefund = handle(async (req, res) => {
  res.status(200).json({ message: 'Refund processed.', ...(await svc.retryRefund({ reservationId: req.params.id })) });
});

const updateTable = handle(async (req, res) => {
  const out = await svc.updateTable({
    tableId: req.params.id, bookable_online: req.body.bookable_online, is_active: req.body.is_active
  });
  res.status(200).json({ message: 'Table updated.', ...out });
});

module.exports = { getGrid, setAttendance, adminCancel, retryRefund, updateTable };
