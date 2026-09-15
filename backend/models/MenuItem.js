const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  image_url: {
    type: String,
    default: ''
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  is_available: {
    type: Boolean,
    default: true
  },
  is_veg: {
    type: Boolean,
    default: true
  },
  is_bestseller: {
    type: Boolean,
    default: false
  },
  prep_time: {
    type: String,
    default: '15-20 min',
    trim: true
  },
  has_spice_level: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MenuItem', menuItemSchema);