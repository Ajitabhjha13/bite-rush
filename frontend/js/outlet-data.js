// ===== SHARED OUTLET BRANDING DATA =====
// Bite Rush is ONE brand with themed "outlets" - each one maps to a real
// Category from the database (Starters, Mains, Beverages, Desserts).
// Single source of truth used by outlets.html, homepage.js, and menu.js.

const OUTLET_INFO = {
  starters: {
    outletName: 'Bite Rush Bites',
    tagline: 'Quick starters & snacks to kick things off.',
    icon: 'bi-egg-fried',
    image: 'images/outlets/bites.jpg'
  },
  mains: {
    outletName: 'Bite Rush Kitchen',
    tagline: 'Hearty mains, cooked fresh daily.',
    icon: 'bi-basket2-fill',
    image: 'images/outlets/kitchen.jpg'
  },
  beverages: {
    outletName: 'Bite Rush Sips',
    tagline: 'Refreshing drinks to go with your meal.',
    icon: 'bi-cup-straw',
    image: 'images/outlets/sips.jpg'
  },
  desserts: {
    outletName: 'Bite Rush Sweets',
    tagline: 'Sweet treats to end on a high note.',
    icon: 'bi-cake2',
    image: 'images/outlets/sweets.jpg'
  }
};

// Loosely matches a real category name (e.g. "Main Course") to the right outlet entry.
function getOutletInfo(categoryName) {
  const key = (categoryName || '').toLowerCase();
  if (key.includes('starter')) return OUTLET_INFO.starters;
  if (key.includes('main')) return OUTLET_INFO.mains;
  if (key.includes('beverage') || key.includes('drink')) return OUTLET_INFO.beverages;
  if (key.includes('dessert') || key.includes('sweet')) return OUTLET_INFO.desserts;
  return null;
}
