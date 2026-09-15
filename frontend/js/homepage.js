// ===== HOMEPAGE: CATEGORY CARDS + POPULAR DISHES =====

function getCategoryIcon(name) {
  const key = (name || '').toLowerCase();
  if (key.includes('starter')) return 'bi-egg-fried';
  if (key.includes('main')) return 'bi-basket2-fill';
  if (key.includes('beverage') || key.includes('drink')) return 'bi-cup-straw';
  if (key.includes('dessert') || key.includes('sweet')) return 'bi-cake2';
  return 'bi-grid-fill';
}

async function loadHomeCategories() {
  const wrapper = document.getElementById('homeCategoryLinks');
  if (!wrapper) return;

  try {
    const res = await fetch(`${API_BASE_URL}/categories`);
    const categories = await res.json();

    if (categories.length === 0) {
      wrapper.innerHTML = '<p class="text-muted text-center">No categories yet.</p>';
      return;
    }

    wrapper.innerHTML = categories.map((cat) => {
      const info = (typeof getOutletInfo === 'function' && getOutletInfo(cat.name)) || {
        outletName: `Bite Rush ${cat.name}`,
        tagline: `Explore our ${cat.name} selection.`,
        icon: getCategoryIcon(cat.name),
        deliveryTime: '20-30 min',
        image: 'https://placehold.co/400x220/f1f1f1/999999?text=' + encodeURIComponent(cat.name)
      };

      return `
        <div class="col-sm-6 col-lg-3">
          <a href="menu.html?category=${cat._id}" class="text-decoration-none">
            <div class="card menu-card outlet-card h-100">
              <img src="${info.image}" alt="${info.outletName}" onerror="this.onerror=null; this.src='https://placehold.co/400x220/f1f1f1/999999?text=No+Image';">
              <span class="delivery-time-badge"><i class="bi bi-clock"></i> ${info.deliveryTime}</span>
              <div class="card-body d-flex flex-column">
                <div class="icon-circle-lg mb-3"><i class="bi ${info.icon}"></i></div>
                <h5 class="card-title fw-semibold text-dark">${info.outletName}</h5>
                <p class="text-muted small mb-3 flex-grow-1">${info.tagline}</p>
                <span class="btn btn-warning btn-sm fw-semibold w-100 mt-auto">View Menu <i class="bi bi-arrow-right-circle ms-1"></i></span>
              </div>
            </div>
          </a>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load categories for homepage:', error);
    wrapper.innerHTML = '<p class="text-muted text-center">Could not load categories right now.</p>';
  }
}

let allMenuItemsForSearch = [];

async function loadPopularDishes() {
  const grid = document.getElementById('popularDishesGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${API_BASE_URL}/menu`);
    const items = await res.json();
    allMenuItemsForSearch = items; // reused by the hero search suggestions dropdown
    const popular = items.slice(0, 4);

    if (popular.length === 0) {
      grid.innerHTML = '<p class="text-muted text-center py-4">No dishes available yet — check back soon!</p>';
      return;
    }

    grid.innerHTML = popular.map((item) => `
      <div class="col-sm-6 col-lg-3">
        <div class="card menu-card">
          <img src="${item.image_url || 'https://placehold.co/300x180/f1f1f1/999999?text=No+Image'}"
               alt="${item.name}"
               onerror="this.onerror=null; this.src='https://placehold.co/300x180/f1f1f1/999999?text=No+Image';">
          ${item.is_bestseller ? '<span class="bestseller-badge"><i class="bi bi-star-fill"></i> Bestseller</span>' : ''}
          <div class="card-body d-flex flex-column">
            <h5 class="card-title fw-semibold">
              <span class="veg-indicator ${item.is_veg !== false ? 'veg' : 'non-veg'}" title="${item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'}"></span>
              ${item.name}
            </h5>
            <p class="card-text text-muted small flex-grow-1">${item.description || ''}</p>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <span class="fw-bold fs-5">₹${item.price}</span>
              <button class="btn btn-warning btn-sm fw-semibold add-to-cart-home-btn"
                data-id="${item._id}"
                data-name="${item.name}"
                data-price="${item.price}"
                data-image="${item.image_url || ''}">
                <i class="bi bi-plus-circle"></i> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.add-to-cart-home-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        addToCart({
          id: btn.dataset.id,
          name: btn.dataset.name,
          price: parseFloat(btn.dataset.price),
          image_url: btn.dataset.image
        });

        if (typeof showToast === 'function') {
          showToast(`${btn.dataset.name} added to cart!`, 'success');
        }

        btn.innerHTML = '<i class="bi bi-check-circle"></i> Added';
        setTimeout(() => {
          btn.innerHTML = '<i class="bi bi-plus-circle"></i> Add';
        }, 800);

        pulseCartButton();
      });
    });
  } catch (error) {
    console.error('Failed to load popular dishes:', error);
    grid.innerHTML = '<p class="text-center text-danger py-4">Could not load menu. Please check if the backend server is running.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadHomeCategories();
  loadCombos();
  loadPopularDishes();
});

async function loadCombos() {
  const grid = document.getElementById('comboGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${API_BASE_URL}/combos`);
    const combos = await res.json();

    if (combos.length === 0) {
      grid.parentElement.parentElement.classList.add('d-none'); // hide the whole section if no combos exist yet
      return;
    }

    grid.innerHTML = combos.map((combo) => `
      <div class="col-sm-6 col-lg-4">
        <div class="card menu-card combo-card h-100">
          <img src="${combo.image_url || 'https://placehold.co/400x220/f1f1f1/999999?text=Combo'}" alt="${combo.name}" onerror="this.onerror=null; this.src='https://placehold.co/400x220/f1f1f1/999999?text=Combo';">
          ${combo.savings > 0 ? `<span class="combo-savings-badge">Save ₹${combo.savings}</span>` : ''}
          <div class="card-body d-flex flex-column">
            <h5 class="card-title fw-semibold">${combo.name}</h5>
            <p class="combo-items-list mb-2">${combo.items.map((i) => i.name).join(' + ')}</p>
            <p class="card-text text-muted small flex-grow-1">${combo.description || ''}</p>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <span>
                ${combo.savings > 0 ? `<span class="combo-original-price">₹${combo.original_price}</span>` : ''}
                <span class="fw-bold fs-5">₹${combo.combo_price}</span>
              </span>
              <button class="btn btn-warning btn-sm fw-semibold add-combo-btn"
                data-id="${combo._id}"
                data-name="${combo.name}"
                data-price="${combo.combo_price}"
                data-image="${combo.image_url || ''}">
                <i class="bi bi-plus-circle"></i> Add Combo
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.add-combo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        addToCart({
          id: btn.dataset.id,
          name: btn.dataset.name,
          price: parseFloat(btn.dataset.price),
          image_url: btn.dataset.image,
          type: 'combo'
        });

        if (typeof showToast === 'function') {
          showToast(`${btn.dataset.name} added to cart!`, 'success');
        }

        pulseCartButton();
      });
    });

  } catch (error) {
    console.error('Failed to load combos:', error);
    grid.parentElement.parentElement.classList.add('d-none'); // hide section gracefully on error
  }
}

// Briefly pulses the floating cart button — gives instant visual confirmation
// right after "Add" is clicked, without forcing the full cart panel open.
// The customer can still click the button anytime to see the full cart.
function pulseCartButton() {
  const btn = document.querySelector('.floating-cart-btn');
  if (!btn) return;

  btn.classList.remove('pulse');
  void btn.offsetWidth; // force reflow so the animation can restart on repeated clicks
  btn.classList.add('pulse');
}
