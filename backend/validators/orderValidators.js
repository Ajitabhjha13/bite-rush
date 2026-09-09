const { body, param } = require('express-validator');

const placeOrderValidation = [
  body('cart_items')
    .isArray({ min: 1 }).withMessage('Cart must contain at least one item.'),

  body('cart_items.*.item_id')
    .isMongoId().withMessage('Invalid item in cart.'),

  body('cart_items.*.quantity')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1.')
];

const updateOrderStatusValidation = [
  param('id').isMongoId().withMessage('Invalid order id.'),

  body('status')
    .notEmpty().withMessage('Status is required.')
    .isIn(['Received', 'Preparing', 'Ready', 'Delivered'])
    .withMessage('Status must be one of: Received, Preparing, Ready, Delivered.')
];

module.exports = { placeOrderValidation, updateOrderStatusValidation };
