const express = require('express');
const router = express.Router();
const {
  placeOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { placeOrderValidation, updateOrderStatusValidation } = require('../validators/orderValidators');
const { handleValidationErrors } = require('../middleware/validate');

// Customer routes (must be logged in)
router.post('/', protect, placeOrderValidation, handleValidationErrors, placeOrder);
router.get('/my', protect, getMyOrders);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllOrders);
router.put('/admin/:id/status', protect, adminOnly, updateOrderStatusValidation, handleValidationErrors, updateOrderStatus);

module.exports = router;
