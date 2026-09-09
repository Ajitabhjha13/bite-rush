const { body, param } = require('express-validator');

const mongoIdParam = (paramName) =>
  param(paramName).isMongoId().withMessage(`Invalid ${paramName}.`);

const createMenuItemValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Item name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Item name must be 2-100 characters.'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters.'),

  body('price')
    .notEmpty().withMessage('Price is required.')
    .isFloat({ min: 0.01 }).withMessage('Price must be a positive number.'),

  body('image_url')
    .optional({ checkFalsy: true })
    .isURL().withMessage('Image URL must be a valid URL.'),

  body('category')
    .notEmpty().withMessage('Category is required.')
    .isMongoId().withMessage('Invalid category selected.'),

  body('is_available')
    .optional()
    .isBoolean().withMessage('is_available must be true or false.'),

  body('is_veg')
    .optional()
    .isBoolean().withMessage('is_veg must be true or false.'),

  body('is_bestseller')
    .optional()
    .isBoolean().withMessage('is_bestseller must be true or false.')
];

// Same rules, but every field is optional (partial update via PUT)
const updateMenuItemValidation = [
  mongoIdParam('id'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Item name must be 2-100 characters.'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters.'),

  body('price')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Price must be a positive number.'),

  body('image_url')
    .optional({ checkFalsy: true })
    .isURL().withMessage('Image URL must be a valid URL.'),

  body('category')
    .optional()
    .isMongoId().withMessage('Invalid category selected.'),

  body('is_available')
    .optional()
    .isBoolean().withMessage('is_available must be true or false.'),

  body('is_veg')
    .optional()
    .isBoolean().withMessage('is_veg must be true or false.'),

  body('is_bestseller')
    .optional()
    .isBoolean().withMessage('is_bestseller must be true or false.')
];

const deleteMenuItemValidation = [mongoIdParam('id')];

const categoryIdParamValidation = [mongoIdParam('categoryId')];

const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Category name must be 2-50 characters.')
];

const deleteCategoryValidation = [mongoIdParam('id')];

module.exports = {
  createMenuItemValidation,
  updateMenuItemValidation,
  deleteMenuItemValidation,
  categoryIdParamValidation,
  createCategoryValidation,
  deleteCategoryValidation
};
