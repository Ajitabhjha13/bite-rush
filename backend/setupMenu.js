// ===== COMBINED MENU SETUP SCRIPT =====
// This ONE script handles everything:
//  - Creates any menu item that doesn't exist yet (with the right category,
//    price, description, veg/non-veg flag, and image).
//  - If an item ALREADY exists (by name), it just updates its image_url to
//    your local photo — nothing is duplicated.
//
// Safe to run as many times as you want (e.g. next time you add more dishes,
// just add a new entry to ALL_ITEMS below and re-run this same file).
//
// Usage: node setupMenu.js
// Delete this file once you're happy with the final menu — don't commit it to git.

require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('./models/MenuItem');
const Category = require('./models/Category');

function findCategoryId(categories, keyword) {
  const match = categories.find((c) => c.name.toLowerCase().includes(keyword));
  return match ? match._id : null;
}

// ===== ALL MENU ITEMS (existing photo updates + brand new dishes) =====
const ALL_ITEMS = [
  // ----- Items that already existed before (just fixing their image) -----
  { name: 'Paneer Tikka', description: 'Char-grilled cottage cheese cubes marinated in tandoori spices.', price: 220, image: 'paneer-tikka.jpg', categoryKeyword: 'starter', is_veg: true, is_bestseller: false },
  { name: 'Veg Biryani', description: 'Fragrant basmati rice cooked with mixed vegetables and spices.', price: 250, image: 'veg-biryani.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: true },
  { name: 'Cold Coffee', description: 'Chilled coffee blended with milk and ice cream.', price: 120, image: 'cold-coffee.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: false },
  { name: 'Gulab Jamun', description: 'Soft milk-solid dumplings soaked in sugar syrup.', price: 88, image: 'gulab-jamun.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },

  // ----- Round 1 (already created, just re-confirming their image) -----
  { name: 'Masala Chai', description: 'Traditional Indian spiced tea brewed with milk, cardamom, and ginger.', price: 60, image: 'masala-chai.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: true },
  { name: 'Fresh Lime Soda', description: 'Refreshing soda with fresh lime juice, served sweet or salted.', price: 70, image: 'fresh-lime-soda.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: false },
  { name: 'Rasmalai', description: 'Soft cottage cheese dumplings soaked in sweetened, cardamom-flavored milk.', price: 120, image: 'rasmalai.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: true },
  { name: 'Chocolate Brownie', description: 'Rich, fudgy chocolate brownie served warm.', price: 150, image: 'chocolate-brownie.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },
  { name: 'Jalebi', description: 'Crispy, syrup-soaked spirals — a classic Indian sweet.', price: 90, image: 'jalebi.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },
  { name: 'Paneer Butter Masala', description: 'Cottage cheese cubes simmered in a rich, buttery tomato gravy.', price: 280, image: 'paneer-butter-masala.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: true },
  { name: 'Dal Makhani', description: 'Slow-cooked black lentils and kidney beans in a creamy, buttery sauce.', price: 220, image: 'dal-makhani.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: false },
  { name: 'Veg Spring Rolls', description: 'Crispy rolls stuffed with fresh, seasoned vegetables.', price: 180, image: 'veg-spring-rolls.jpg', categoryKeyword: 'starter', is_veg: true, is_bestseller: false },

  // ----- Round 2: brand-new dishes -----
  { name: 'Mango Lassi', description: 'Creamy yogurt smoothie blended with fresh mango pulp.', price: 90, image: 'mango-lassi.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: true },
  { name: 'Buttermilk', description: 'Chilled, spiced yogurt-based drink — a refreshing digestive.', price: 40, image: 'buttermilk.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: false },
  { name: 'Iced Tea', description: 'Chilled black tea served over ice with a hint of lemon.', price: 80, image: 'iced-tea.jpg', categoryKeyword: 'beverage', is_veg: true, is_bestseller: false },

  { name: 'Kulfi', description: 'Traditional Indian frozen dessert, rich and creamy with cardamom and pistachio.', price: 80, image: 'kulfi.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },
  { name: 'Ice Cream Sundae', description: 'Layers of ice cream, chocolate sauce, nuts, and a cherry on top.', price: 130, image: 'ice-cream-sundae.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },
  { name: 'Gajar Ka Halwa', description: 'Classic North Indian carrot pudding, slow-cooked with milk and ghee.', price: 110, image: 'gajar-ka-halwa.jpg', categoryKeyword: 'dessert', is_veg: true, is_bestseller: false },

  { name: 'Chicken Tikka Masala', description: 'Char-grilled chicken chunks simmered in a creamy, spiced tomato gravy.', price: 300, image: 'chicken-tikka-masala.jpg', categoryKeyword: 'main', is_veg: false, is_bestseller: true },
  { name: 'Fish Curry', description: 'Fresh fish cooked in a tangy, spiced coconut-based curry.', price: 320, image: 'fish-curry.jpg', categoryKeyword: 'main', is_veg: false, is_bestseller: false },
  { name: 'Mutton Curry', description: 'Slow-cooked mutton in a rich, aromatic onion-tomato gravy.', price: 380, image: 'mutton-curry.jpg', categoryKeyword: 'main', is_veg: false, is_bestseller: false },
  { name: 'Chicken Burger', description: 'Crispy fried chicken patty with cheese, lettuce, and onion in a toasted bun.', price: 220, image: 'burger.jpg', categoryKeyword: 'main', is_veg: false, is_bestseller: false },
  { name: 'Paneer Pizza', description: 'Wood-fired pizza topped with paneer cubes, capsicum, onion, and mozzarella.', price: 250, image: 'paneer-pizza.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: true },
  { name: 'Veg Hakka Noodles', description: 'Stir-fried noodles tossed with fresh vegetables in a spicy sauce.', price: 180, image: 'veg-noodles.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: false },
  { name: 'White Sauce Pasta', description: 'Penne pasta tossed in a creamy white sauce with mixed vegetables.', price: 220, image: 'white-sauce-pasta.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: false },
  { name: 'Naan', description: 'Soft, tandoor-baked Indian flatbread.', price: 40, image: 'naan.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: false },
  { name: 'Lachha Paratha', description: 'Multi-layered, flaky whole wheat flatbread.', price: 50, image: 'lachha-paratha.jpg', categoryKeyword: 'main', is_veg: true, is_bestseller: false },

  { name: 'Chicken 65', description: 'Spicy, deep-fried chicken bites tossed in curry leaves and chillies.', price: 220, image: 'chicken-65.jpg', categoryKeyword: 'starter', is_veg: false, is_bestseller: true },
  { name: 'Chicken Lollipop', description: 'Frenched chicken wings, deep-fried and tossed in a spicy sauce.', price: 250, image: 'chicken-lollipop.jpg', categoryKeyword: 'starter', is_veg: false, is_bestseller: false },
  { name: 'Egg Omelet', description: 'Fluffy, pan-fried omelet with onions, tomatoes, and green chillies.', price: 80, image: 'egg-omelet.jpg', categoryKeyword: 'starter', is_veg: false, is_bestseller: false },
  { name: 'Veg Manchurian', description: 'Deep-fried vegetable balls tossed in a tangy, spicy Indo-Chinese sauce.', price: 190, image: 'veg-manchurian.jpg', categoryKeyword: 'starter', is_veg: true, is_bestseller: false },
  { name: 'Samosa', description: 'Crispy, deep-fried pastry filled with spiced potatoes and peas.', price: 40, image: 'samosa.jpg', categoryKeyword: 'starter', is_veg: true, is_bestseller: false },
];

async function setupMenu() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const categories = await Category.find();
    if (categories.length === 0) {
      console.log('No categories found — create Starters, Main Course, Beverages, and Desserts first via the admin dashboard.');
      return;
    }

    let created = 0;
    let updated = 0;
    let skippedNoCategory = 0;

    for (const item of ALL_ITEMS) {
      const imagePath = `images/menu/${item.image}`;
      const categoryId = findCategoryId(categories, item.categoryKeyword);

      if (!categoryId) {
        console.log(`⚠  No matching category for "${item.name}" (looking for "${item.categoryKeyword}") — skipped.`);
        skippedNoCategory++;
        continue;
      }

      const existing = await MenuItem.findOne({ name: item.name });

      if (existing) {
        existing.image_url = imagePath;
        await existing.save();
        console.log(`🔄 Updated image: ${item.name} -> ${imagePath}`);
        updated++;
      } else {
        await MenuItem.create({
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: imagePath,
          category: categoryId,
          is_available: true,
          is_veg: item.is_veg,
          is_bestseller: item.is_bestseller
        });
        console.log(`✔  Created: ${item.name} (${item.is_veg ? 'Veg' : 'Non-Veg'}) -> ${imagePath}`);
        created++;
      }
    }

    console.log(`\nDone. ${created} created, ${updated} image(s) updated, ${skippedNoCategory} skipped (no matching category).`);

  } catch (error) {
    console.error('Error setting up menu:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

setupMenu();
