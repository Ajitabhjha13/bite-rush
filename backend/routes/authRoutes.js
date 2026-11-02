const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');
const { registerValidation, loginValidation } = require('../validators/authValidators');
const { handleValidationErrors } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiters');

router.post('/register', authLimiter, registerValidation, handleValidationErrors, registerUser);
router.post('/login', authLimiter, loginValidation, handleValidationErrors, loginUser);

module.exports = router;
