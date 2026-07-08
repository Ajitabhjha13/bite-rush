const MenuItem = require('../models/MenuItem');

// @route   GET /api/menu
// @desc    Get all available menu items (public), with category info populated
const getMenuItems = async (req, res) => {
  try {
    const items = await MenuItem.find({ is_available: true })
      .populate('category', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/menu/category/:categoryId
// @desc    Get menu items filtered by category
const getMenuItemsByCategory = async (req, res) => {
  try {
    const items = await MenuItem.find({
      category: req.params.categoryId,
      is_available: true
    }).populate('category', 'name');
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   POST /api/admin/menu
// @desc    Create a menu item (admin only)
const createMenuItem = async (req, res) => {
  try {
    const { name, description, price, image_url, category, is_available } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({ message: 'Name, price, and category are required' });
    }

    const item = await MenuItem.create({
      name,
      description,
      price,
      image_url,
      category,
      is_available: is_available !== undefined ? is_available : true
    });

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/admin/menu/:id
// @desc    Update a menu item (admin only)
const updateMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   DELETE /api/admin/menu/:id
// @desc    Delete a menu item (admin only)
const deleteMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    res.status(200).json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/admin/menu
// @desc    Get ALL menu items including unavailable ones (admin only)
const getAllMenuItemsAdmin = async (req, res) => {
  try {
    const items = await MenuItem.find().populate('category', 'name').sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getMenuItems,
  getMenuItemsByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItemsAdmin
};