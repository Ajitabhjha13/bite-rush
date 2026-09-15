const { body, param } = require('express-validator');

const placeOrderValidation = [
  body('cart_items')
    .isArray({ min: 1 }).withMessage('Cart must contain at least one item.'),

  body('cart_items.*.type')
    .optional()
    .isIn(['item', 'combo']).withMessage('Cart item type must be item or combo.'),

  body('cart_items.*.item_id')
    .if(body('cart_items.*.type').not().equals('combo'))
    .isMongoId().withMessage('Invalid item in cart.'),

  body('cart_items.*.combo_id')
    .if(body('cart_items.*.type').equals('combo'))
    .isMongoId().withMessage('Invalid combo in cart.'),

  body('cart_items.*.quantity')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),

  body('cart_items.*.spice_level')
    .optional({ checkFalsy: true })
    .isIn(['Mild', 'Medium', 'Hot']).withMessage('Spice level must be Mild, Medium, or Hot.')
];

const updateOrderStatusValidation = [
  param('id').isMongoId().withMessage('Invalid order id.'),

  body('status')
    .notEmpty().withMessage('Status is required.')
    .isIn(['Received', 'Preparing', 'Ready', 'Delivered'])
    .withMessage('Status must be one of: Received, Preparing, Ready, Delivered.')
];

module.exports = { placeOrderValidation, updateOrderStatusValidation };
