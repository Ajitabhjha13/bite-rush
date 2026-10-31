const express = require('express');
const router = express.Router();
const c = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');
const v = require('../validators/bookingValidators');
const { handleValidationErrors } = require('../middleware/validate');

router.get('/availability', v.availabilityValidation, handleValidationErrors, c.getAvailability);
router.get('/my', protect, c.getMyBookings);
router.post('/hold', protect, v.holdValidation, handleValidationErrors, c.holdSeat);
router.post('/:id/confirm', protect, v.confirmValidation, handleValidationErrors, c.confirmBooking);
router.put('/:id/cancel', protect, v.cancelBookingValidation, handleValidationErrors, c.cancelBooking);

module.exports = router;
