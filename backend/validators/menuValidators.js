const { body, param } = require('express-validator');

const mongoIdParam = (paramName) =>
  param(paramName).isMongoId().withMessage(`Invalid ${paramName}.`);

// Accepts either a full external URL (https://...) OR a local relative
// image path (e.g. images/menu/dish.jpg) — since menu photos can now be
// hosted locally in the frontend's own images/menu folder, not just Unsplash.
function imageUrlValidator(value) {
  const isFullUrl = /^https?:\/\/.+/i.test(value);
  const isRelativePath = /^[\w\-./]+\.(jpg|jpeg|png|webp|gif)$/i.test(value);

  if (!isFullUrl && !isRelativePath) {
    throw new Error('Image URL must be a valid URL (https://...) or a local image path (e.g. images/menu/dish.jpg).');
  }
  return true;
}

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
    .custom(imageUrlValidator),

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
    .isBoolean().withMessage('is_bestseller must be true or false.'),

  body('prep_time')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 }).withMessage('Prep time must be under 30 characters.'),

  body('has_spice_level')
    .optional()
    .isBoolean().withMessage('has_spice_level must be true or false.')
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
    .custom(imageUrlValidator),

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
    .isBoolean().withMessage('is_bestseller must be true or false.'),

  body('prep_time')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 }).withMessage('Prep time must be under 30 characters.'),

  body('has_spice_level')
    .optional()
    .isBoolean().withMessage('has_spice_level must be true or false.')
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
