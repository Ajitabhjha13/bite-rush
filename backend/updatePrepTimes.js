// One-off script to set realistic, dish-specific prep times.
// Safe to run multiple times — just updates prep_time for matching item names.
//
// Usage: node updatePrepTimes.js
// Delete this file once you're done — don't commit it to git.

require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('./models/MenuItem');

const PREP_TIMES = {
  // Beverages
  'Cold Coffee': '5-10 min',
  'Masala Chai': '5-10 min',
  'Iced Tea': '5-10 min',
  'Fresh Lime Soda': '5 min',
  'Buttermilk': '5 min',
  'Mango Lassi': '5-10 min',

  // Desserts
  'Gulab Jamun': '5 min',
  'Rasmalai': '5 min',
  'Kulfi': '5 min',
  'Chocolate Brownie': '5-10 min',
  'Ice Cream Sundae': '5-10 min',
  'Jalebi': '10-15 min',
  'Gajar Ka Halwa': '10-15 min',

  // Main Course
  'Naan': '10 min',
  'Lachha Paratha': '10 min',
  'Veg Biryani': '25-30 min',
  'Paneer Butter Masala': '20-25 min',
  'Dal Makhani': '20-25 min',
  'Chicken Tikka Masala': '20-25 min',
  'Fish Curry': '30-35 min',
  'Mutton Curry': '30-35 min',
  'Paneer Pizza': '15-20 min',
  'Veg Hakka Noodles': '15 min',
  'White Sauce Pasta': '15 min',
  'Chicken Burger': '12-15 min',

  // Starters
  'Samosa': '5-8 min',
  'Veg Spring Rolls': '12-15 min',
  'Veg Manchurian': '12-15 min',
  'Paneer Tikka': '15-18 min',
  'Chicken 65': '15-18 min',
  'Chicken Lollipop': '15-18 min',
  'Egg Omelet': '8-10 min',
};

async function updatePrepTimes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    let updated = 0;
    let notFound = 0;

    for (const [name, prepTime] of Object.entries(PREP_TIMES)) {
      const item = await MenuItem.findOneAndUpdate(
        { name },
        { prep_time: prepTime },
        { new: true }
      );

      if (item) {
        console.log(`✔  ${name} -> ${prepTime}`);
        updated++;
      } else {
        console.log(`⚠  Not found: ${name} (skipped)`);
        notFound++;
      }
    }

    console.log(`\nDone. ${updated} updated, ${notFound} not found.`);

  } catch (error) {
    console.error('Error updating prep times:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

updatePrepTimes();
