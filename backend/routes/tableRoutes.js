const express = require('express');
const router = express.Router();
const { updateTable } = require('../controllers/adminBookingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { tableValidation } = require('../validators/adminBookingValidators');
const { handleValidationErrors } = require('../middleware/validate');

router.put('/:id', protect, adminOnly, tableValidation, handleValidationErrors, updateTable);

module.exports = router;
