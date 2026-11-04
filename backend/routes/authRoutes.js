const express = require('express');
const router = express.Router();
const { registerUser, loginUser, forgotPassword, resetPassword } = require('../controllers/authController');
const { registerValidation, loginValidation, forgotValidation, resetValidation } = require('../validators/authValidators');
const { handleValidationErrors } = require('../middleware/validate');
const { authLimiter, forgotLimiter } = require('../middleware/rateLimiters');

router.post('/register', authLimiter, registerValidation, handleValidationErrors, registerUser);
router.post('/login', authLimiter, loginValidation, handleValidationErrors, loginUser);

router.post('/forgot-password', forgotLimiter, forgotValidation, handleValidationErrors, forgotPassword);
router.post('/reset-password', forgotLimiter, resetValidation, handleValidationErrors, resetPassword);

module.exports = router;
