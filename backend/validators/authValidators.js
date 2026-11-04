const { body } = require('express-validator');

const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters.')
    .isLength({ max: 60 }).withMessage('Name must be at most 60 characters.')
    .matches(/^[^<>]*$/).withMessage('Name cannot contain the characters < or >.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
];

const forgotValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail()
];

const resetValidation = [
  body('token')
    .isString().withMessage('The reset link is not valid.').bail()
    .matches(/^[a-f0-9]{64}$/).withMessage('The reset link is not valid.'),
  body('password')
    .isString().withMessage('Password is required.').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
];

module.exports = { registerValidation, loginValidation, forgotValidation, resetValidation };
