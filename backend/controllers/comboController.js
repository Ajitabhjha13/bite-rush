const Combo = require('../models/Combo');
const MenuItem = require('../models/MenuItem');

// @route   GET /api/combos
// @desc    Get all available combos (public), with the original (un-combined)
//          price computed on the fly so the frontend can show "Save ₹X"
const getCombos = async (req, res) => {
  try {
    const combos = await Combo.find({ is_available: true })
      .populate('items', 'name price image_url');

    const combosWithSavings = combos.map((combo) => {
      const originalPrice = combo.items.reduce((sum, item) => sum + item.price, 0);
      return {
        ...combo.toObject(),
        original_price: originalPrice,
        savings: Math.max(0, originalPrice - combo.combo_price)
      };
    });

    res.status(200).json(combosWithSavings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/combos/admin/all
// @desc    Get ALL combos including unavailable ones (admin)
const getAllCombosAdmin = async (req, res) => {
  try {
    const combos = await Combo.find().populate('items', 'name price image_url');

    const combosWithSavings = combos.map((combo) => {
      const originalPrice = combo.items.reduce((sum, item) => sum + item.price, 0);
      return {
        ...combo.toObject(),
        original_price: originalPrice,
        savings: Math.max(0, originalPrice - combo.combo_price)
      };
    });

    res.status(200).json(combosWithSavings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   POST /api/combos/admin
// @desc    Create a new combo (admin)
const createCombo = async (req, res) => {
  try {
    const { name, description, image_url, items, combo_price, is_available } = req.body;

    if (!name || !items || items.length === 0 || !combo_price) {
      return res.status(400).json({ message: 'Name, at least one item, and combo price are required' });
    }

    // Make sure every referenced item actually exists
    const existingItems = await MenuItem.find({ _id: { $in: items } });
    if (existingItems.length !== items.length) {
      return res.status(400).json({ message: 'One or more selected items do not exist' });
    }

    const combo = await Combo.create({
      name,
      description,
      image_url,
      items,
      combo_price,
      is_available: is_available !== undefined ? is_available : true
    });

    res.status(201).json(combo);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/combos/admin/:id
// @desc    Update a combo (admin)
const updateCombo = async (req, res) => {
  try {
    const combo = await Combo.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!combo) {
      return res.status(404).json({ message: 'Combo not found' });
    }

    res.status(200).json(combo);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   DELETE /api/combos/admin/:id
// @desc    Delete a combo (admin)
const deleteCombo = async (req, res) => {
  try {
    const combo = await Combo.findByIdAndDelete(req.params.id);

    if (!combo) {
      return res.status(404).json({ message: 'Combo not found' });
    }

    res.status(200).json({ message: 'Combo deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getCombos, getAllCombosAdmin, createCombo, updateCombo, deleteCombo };
