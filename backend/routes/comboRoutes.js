const express = require('express');
const router = express.Router();
const {
  getCombos,
  getAllCombosAdmin,
  createCombo,
  updateCombo,
  deleteCombo
} = require('../controllers/comboController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  createComboValidation,
  updateComboValidation,
  deleteComboValidation
} = require('../validators/comboValidators');
const { handleValidationErrors } = require('../middleware/validate');

// Public
router.get('/', getCombos);

// Admin
router.get('/admin/all', protect, adminOnly, getAllCombosAdmin);
router.post('/admin', protect, adminOnly, createComboValidation, handleValidationErrors, createCombo);
router.put('/admin/:id', protect, adminOnly, updateComboValidation, handleValidationErrors, updateCombo);
router.delete('/admin/:id', protect, adminOnly, deleteComboValidation, handleValidationErrors, deleteCombo);

module.exports = router;
