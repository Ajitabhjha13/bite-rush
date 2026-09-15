const { body, param } = require('express-validator');

const mongoIdParam = (paramName) =>
  param(paramName).isMongoId().withMessage(`Invalid ${paramName}.`);

const createComboValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Combo name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Combo name must be 2-100 characters.'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  body('items')
    .isArray({ min: 1 }).withMessage('A combo must include at least one item.'),

  body('items.*')
    .isMongoId().withMessage('Invalid item selected for combo.'),

  body('combo_price')
    .notEmpty().withMessage('Combo price is required.')
    .isFloat({ min: 0.01 }).withMessage('Combo price must be a positive number.'),

  body('is_available')
    .optional()
    .isBoolean().withMessage('is_available must be true or false.')
];

const updateComboValidation = [
  mongoIdParam('id'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Combo name must be 2-100 characters.'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  body('items')
    .optional()
    .isArray({ min: 1 }).withMessage('A combo must include at least one item.'),

  body('items.*')
    .optional()
    .isMongoId().withMessage('Invalid item selected for combo.'),

  body('combo_price')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Combo price must be a positive number.'),

  body('is_available')
    .optional()
    .isBoolean().withMessage('is_available must be true or false.')
];

const deleteComboValidation = [mongoIdParam('id')];

module.exports = { createComboValidation, updateComboValidation, deleteComboValidation };
