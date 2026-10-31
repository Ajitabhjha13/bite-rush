const { body, param, query } = require('express-validator');

const availabilityValidation = [
  query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD.')
];

const holdValidation = [
  body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD.'),
  body('slot').notEmpty().withMessage('Time slot is required.'),
  body('guests').isInt({ min: 1, max: 6 }).withMessage('Guests must be between 1 and 6.').toInt(),
  body('idempotency_key').optional({ checkFalsy: true }).isString().isLength({ max: 64 })
    .withMessage('Invalid idempotency key.')
];

const confirmValidation = [
  param('id').isMongoId().withMessage('Invalid booking id.'),
  body('payment_ref').optional({ checkFalsy: true }).isString().isLength({ max: 100 })
];

const cancelBookingValidation = [
  param('id').isMongoId().withMessage('Invalid booking id.')
];

module.exports = { availabilityValidation, holdValidation, confirmValidation, cancelBookingValidation };
