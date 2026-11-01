const express = require('express');
const router = express.Router();
const { webhook } = require('../controllers/paymentController');

// raw body on purpose: the signature is computed over the exact bytes Razorpay sent
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), webhook);

module.exports = router;
