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
const {
  createMenuItemValidation,
  updateMenuItemValidation,
  deleteMenuItemValidation,
  categoryIdParamValidation
} = require('../validators/menuValidators');
const { handleValidationErrors } = require('../middleware/validate');

// Public routes
router.get('/', getMenuItems);
router.get('/category/:categoryId', categoryIdParamValidation, handleValidationErrors, getMenuItemsByCategory);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllMenuItemsAdmin);
router.post('/admin', protect, adminOnly, createMenuItemValidation, handleValidationErrors, createMenuItem);
router.put('/admin/:id', protect, adminOnly, updateMenuItemValidation, handleValidationErrors, updateMenuItem);
router.delete('/admin/:id', protect, adminOnly, deleteMenuItemValidation, handleValidationErrors, deleteMenuItem);

module.exports = router;
