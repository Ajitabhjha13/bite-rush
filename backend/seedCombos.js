// One-off script to create 2 starter combo meals using your existing menu items.
// Safe to run multiple times — skips a combo if one with the same name already exists.
//
// Usage: node seedCombos.js
// Delete this file once you're done — don't commit it to git.

require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('./models/MenuItem');
const Combo = require('./models/Combo');

const COMBOS = [
  {
    name: 'Veg Feast Combo',
    description: 'A starter, a main course, and a sweet ending — all in one.',
    itemNames: ['Paneer Tikka', 'Paneer Butter Masala', 'Gulab Jamun'],
    combo_price: 499,
    imageFrom: 'Paneer Butter Masala' // reuse this item's photo for the combo card
  },
  {
    name: 'Non-Veg Delight Combo',
    description: 'Spicy starter, rich curry, and a cool finish.',
    itemNames: ['Chicken 65', 'Chicken Tikka Masala', 'Kulfi'],
    combo_price: 499,
    imageFrom: 'Chicken Tikka Masala'
  }
];

async function seedCombos() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    for (const combo of COMBOS) {
      const existing = await Combo.findOne({ name: combo.name });
      if (existing) {
        console.log(`⏭  Skipped (already exists): ${combo.name}`);
        continue;
      }

      const menuItems = await MenuItem.find({ name: { $in: combo.itemNames } });

      if (menuItems.length !== combo.itemNames.length) {
        const found = menuItems.map((i) => i.name);
        const missing = combo.itemNames.filter((n) => !found.includes(n));
        console.log(`⚠  Skipped "${combo.name}" — couldn't find: ${missing.join(', ')}`);
        continue;
      }

      const imageItem = menuItems.find((i) => i.name === combo.imageFrom);

      await Combo.create({
        name: combo.name,
        description: combo.description,
        image_url: imageItem ? imageItem.image_url : '',
        items: menuItems.map((i) => i._id),
        combo_price: combo.combo_price,
        is_available: true
      });

      console.log(`✔  Created: ${combo.name} (₹${combo.combo_price})`);
    }

    console.log('\nDone.');

  } catch (error) {
    console.error('Error seeding combos:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seedCombos();
