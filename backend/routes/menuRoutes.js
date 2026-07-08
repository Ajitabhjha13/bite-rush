const express = require('express');
const router = express.Router();
const {
  getMenuItems,
  getMenuItemsByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItemsAdmin
} = require('../controllers/menuController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getMenuItems);
router.get('/category/:categoryId', getMenuItemsByCategory);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllMenuItemsAdmin);
router.post('/admin', protect, adminOnly, createMenuItem);
router.put('/admin/:id', protect, adminOnly, updateMenuItem);
router.delete('/admin/:id', protect, adminOnly, deleteMenuItem);

module.exports = router;