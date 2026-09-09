// ===== SHARED OUTLET BRANDING DATA =====
// Bite Rush is ONE brand with themed "outlets" — each one maps to a real
// Category from the database (Starters, Mains, Beverages, Desserts).
// Single source of truth used by outlets.html, homepage.js, and menu.js.

const OUTLET_INFO = {
  starters: {
    outletName: 'Bite Rush Bites',
    tagline: 'Quick starters & snacks to kick things off.',
    icon: 'bi-egg-fried',
    deliveryTime: '15-20 min',
    image: 'https://images.unsplash.com/photo-1600688640154-9619e002df30?auto=format&fit=crop&w=800&q=80'
  },
  mains: {
    outletName: 'Bite Rush Kitchen',
    tagline: 'Hearty mains, cooked fresh daily.',
    icon: 'bi-basket2-fill',
    deliveryTime: '30-40 min',
    image: 'https://images.unsplash.com/photo-1753727471014-efe38840c7c7?auto=format&fit=crop&w=800&q=80'
  },
  beverages: {
    outletName: 'Bite Rush Sips',
    tagline: 'Refreshing drinks to go with your meal.',
    icon: 'bi-cup-straw',
    deliveryTime: '10-15 min',
    image: 'https://images.unsplash.com/photo-1743342693571-e91a796317f8?auto=format&fit=crop&w=800&q=80'
  },
  desserts: {
    outletName: 'Bite Rush Sweets',
    tagline: 'Sweet treats to end on a high note.',
    icon: 'bi-cake2',
    deliveryTime: '15-20 min',
    image: 'https://images.unsplash.com/photo-1712725213053-dad649077a02?auto=format&fit=crop&w=800&q=80'
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
