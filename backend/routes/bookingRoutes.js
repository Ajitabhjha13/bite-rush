const express = require('express');
const router = express.Router();
const c = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const admin = require('../controllers/adminBookingController');
const av = require('../validators/adminBookingValidators');
const v = require('../validators/bookingValidators');
const { handleValidationErrors } = require('../middleware/validate');

router.get('/policy', c.getPolicy);
router.get('/availability', v.availabilityValidation, handleValidationErrors, c.getAvailability);
router.get('/my', protect, c.getMyBookings);
router.post('/hold', protect, v.holdValidation, handleValidationErrors, c.holdSeat);
router.post('/:id/confirm', protect, v.confirmValidation, handleValidationErrors, c.confirmBooking);
router.put('/:id/cancel', protect, v.cancelBookingValidation, handleValidationErrors, c.cancelBooking);

// ----- Admin (restaurant) -----
router.get('/admin/grid', protect, adminOnly, av.gridValidation, handleValidationErrors, admin.getGrid);
router.put('/admin/:id/attendance', protect, adminOnly, av.attendanceValidation, handleValidationErrors, admin.setAttendance);
router.put('/admin/:id/cancel', protect, adminOnly, av.adminCancelValidation, handleValidationErrors, admin.adminCancel);

module.exports = router;
