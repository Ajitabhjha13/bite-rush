const { body, param } = require('express-validator');
const { isServiceablePincode, normalizePhone } = require('../config/delivery');

const text = (field, label, min, max) => body(field)
  .isString().withMessage(`${label} is required.`).bail()
  .trim()
  .isLength({ min, max }).withMessage(`${label} must be ${min} to ${max} characters.`);

const deliveryValidation = [
  body('delivery').isObject().withMessage('Delivery details are required.'),
  text('delivery.name', 'Name of the person receiving the order', 2, 60),
  body('delivery.phone')
    .isString().withMessage('Phone number is required.').bail()
    .customSanitizer(normalizePhone)
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit mobile number.'),
  text('delivery.address_line', 'Address (flat, building, street)', 5, 120),
  text('delivery.area', 'Area', 2, 60),
  body('delivery.landmark')
    .optional({ checkFalsy: true })
    .isString().withMessage('Landmark must be text.').bail()
    .trim()
    .isLength({ max: 80 }).withMessage('Landmark must be at most 80 characters.'),
  body('delivery.pincode')
    .isString().withMessage('Pincode is required.').bail()
    .trim()
    .matches(/^\d{6}$/).withMessage('Enter a 6-digit pincode.').bail()
    .custom(isServiceablePincode).withMessage('Sorry, we deliver only within Vadodara (pincodes 390001 to 390025).')
];

const placeOrderValidation = [
  ...deliveryValidation,

  body('payment_method')
    .optional()
    .isIn(['cod', 'online']).withMessage('Payment method must be cod or online.'),

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
    .isIn(['Received', 'Preparing', 'Ready', 'Delivered', 'Cancelled'])
    .withMessage('Status must be one of: Received, Preparing, Ready, Delivered, Cancelled.')
];

const cancelOrderValidation = [
  param('id').isMongoId().withMessage('Invalid order id.')
];

const confirmPaymentValidation = [
  param('id').isMongoId().withMessage('Invalid order id.'),
  body('razorpay_payment_id').isString().trim().isLength({ min: 5, max: 64 }).withMessage('Payment id is required.'),
  body('razorpay_signature').isString().trim().isLength({ min: 10, max: 128 }).withMessage('Payment signature is required.')
];

const retryRefundValidation = [
  param('id').isMongoId().withMessage('Invalid order id.')
];

module.exports = { placeOrderValidation, updateOrderStatusValidation, cancelOrderValidation, confirmPaymentValidation, retryRefundValidation };
