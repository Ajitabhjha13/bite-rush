const express = require('express');
const router = express.Router();
const {
  placeOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  confirmPayment,
  retryRefund
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { placeOrderValidation, updateOrderStatusValidation, cancelOrderValidation, confirmPaymentValidation, retryRefundValidation } = require('../validators/orderValidators');
const { orderLimiter } = require('../middleware/rateLimiters');
const { handleValidationErrors } = require('../middleware/validate');

// Customer routes (must be logged in)
router.post('/', protect, orderLimiter, placeOrderValidation, handleValidationErrors, placeOrder);
router.get('/my', protect, getMyOrders);
router.post('/:id/confirm-payment', protect, orderLimiter, confirmPaymentValidation, handleValidationErrors, confirmPayment);
router.put('/:id/cancel', protect, orderLimiter, cancelOrderValidation, handleValidationErrors, cancelOrder);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllOrders);
router.put('/admin/:id/retry-refund', protect, adminOnly, retryRefundValidation, handleValidationErrors, retryRefund);
router.put('/admin/:id/status', protect, adminOnly, updateOrderStatusValidation, handleValidationErrors, updateOrderStatus);

module.exports = router;
