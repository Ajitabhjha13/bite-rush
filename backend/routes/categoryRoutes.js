const express = require('express');
const router = express.Router();
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { createCategoryValidation, deleteCategoryValidation } = require('../validators/menuValidators');
const { handleValidationErrors } = require('../middleware/validate');

router.get('/', getCategories);
router.post('/', protect, adminOnly, createCategoryValidation, handleValidationErrors, createCategory);
router.delete('/:id', protect, adminOnly, deleteCategoryValidation, handleValidationErrors, deleteCategory);

module.exports = router;
