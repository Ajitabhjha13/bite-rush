const { body, param, query } = require('express-validator');

const gridValidation = [
  query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD.')
];

const attendanceValidation = [
  param('id').isMongoId().withMessage('Invalid booking id.'),
  body('attendance').isIn(['pending', 'seated', 'no_show']).withMessage('Attendance must be pending, seated or no_show.')
];

const adminCancelValidation = [
  param('id').isMongoId().withMessage('Invalid booking id.')
];

const tableValidation = [
  param('id').isMongoId().withMessage('Invalid table id.'),
  body('bookable_online').optional().isBoolean({ strict: true }).withMessage('bookable_online must be true or false.'),
  body('is_active').optional().isBoolean({ strict: true }).withMessage('is_active must be true or false.'),
  body().custom((b) => {
    if (b.bookable_online === undefined && b.is_active === undefined) throw new Error('Nothing to update.');
    return true;
  })
];

module.exports = { gridValidation, attendanceValidation, adminCancelValidation, tableValidation };
