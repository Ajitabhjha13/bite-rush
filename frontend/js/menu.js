// ===== MENU PAGE LOGIC =====

// Matches if ANY word in the dish name starts with the query — so "Biryani"
// correctly finds "Veg Biryani" (not just names that literally begin with it).
function matchesSearchQuery(name, query) {
  const words = name.toLowerCase().split(/\s+/);
  return words.some((word) => word.startsWith(query));
}

let allMenuItems = [];
let allCategories = [];
let currentCategoryId = 'all';
let currentSearchQuery = '';
let currentSortOrder = 'default';

// Fetch categories and populate the filter tabs
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`);
    allCategories = await res.json();

    const tabsContainer = document.getElementById('categoryTabs');

    allCategories.forEach((cat) => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `<button class="nav-link category-btn" data-category="${cat._id}">${cat.name}</button>`;
      tabsContainer.appendChild(li);
    });

    document.querySelectorAll('.category-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterMenuByCategory(btn.dataset.category);
      });
    });
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

// Fetch all menu items from the backend
async function loadMenuItems() {
  const menuGrid = document.getElementById('menuGrid');

  try {
    const res = await fetch(`${API_BASE_URL}/menu`);
    allMenuItems = await res.json();

    renderMenuItems(allMenuItems);
  } catch (error) {
    console.error('Failed to load menu:', error);
    menuGrid.innerHTML = '<p class="text-center text-danger">Failed to load menu. Please check if the backend server is running.</p>';
  }
}

// Renders a list of menu items as Bootstrap cards
function renderMenuItems(items, emptyMessage) {
  const menuGrid = document.getElementById('menuGrid');

  if (items.length === 0) {
    menuGrid.innerHTML = `<p class="text-center text-muted py-5">${emptyMessage || 'No items found in this category.'}</p>`;
    return;
  }

  menuGrid.innerHTML = items.map((item) => `
    <div class="col-sm-6 col-lg-4 col-xl-3">
      <div class="card menu-card">
        <img src="${item.image_url || 'https://placehold.co/300x180/f1f1f1/999999?text=No+Image'}" alt="${item.name}" data-item-id="${item._id}" class="menu-card-img-clickable" style="cursor:pointer;" onerror="this.onerror=null; this.src='https://placehold.co/300x180/f1f1f1/999999?text=No+Image';">
        <span class="delivery-time-badge"><i class="bi bi-clock"></i> ${item.prep_time || '15-20 min'}</span>
        ${item.is_bestseller ? '<span class="bestseller-badge"><i class="bi bi-star-fill"></i> Bestseller</span>' : ''}
        <div class="card-body d-flex flex-column">
          <h5 class="card-title fw-semibold menu-card-img-clickable" data-item-id="${item._id}" style="cursor:pointer;">
            <span class="veg-indicator ${item.is_veg !== false ? 'veg' : 'non-veg'}" title="${item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'}"></span>
            ${item.name}
            ${item.has_spice_level ? '<i class="bi bi-fire text-danger ms-1" title="Spice level available" style="font-size:0.8rem;"></i>' : ''}
          </h5>
          <p class="card-text text-muted small flex-grow-1">${item.description || ''}</p>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="fw-bold fs-5">₹${item.price}</span>
            <div class="qty-control-wrapper" data-item-id="${item._id}">
              ${getQtyControlHtml(item)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  attachMenuCardHandlers();
  attachCardClickForDetail();
}

// Opens the Item Detail Modal when the image or dish name is clicked.
// The Add/quantity controls are a completely separate area of the card,
// so no event bubbling tricks are needed to keep them independent.
function attachCardClickForDetail() {
  document.querySelectorAll('.menu-card-img-clickable').forEach((el) => {
    el.addEventListener('click', () => {
      openItemDetailModal(el.dataset.itemId);
    });
  });
}

// Populates and shows the Item Detail Modal for the given item
function openItemDetailModal(itemId) {
  const item = allMenuItems.find((i) => i._id === itemId);
  if (!item) return;

  document.getElementById('detailModalImage').src = item.image_url || 'https://placehold.co/600x400/f1f1f1/999999?text=No+Image';
  document.getElementById('detailModalImage').alt = item.name;
  document.getElementById('detailModalName').textContent = item.name;
  document.getElementById('detailModalPrice').textContent = `₹${item.price}`;
  document.getElementById('detailModalDescription').textContent = item.description || 'No description available.';
  document.getElementById('detailModalPrepTime').textContent = item.prep_time || '15-20 min';

  const vegEl = document.getElementById('detailModalVeg');
  vegEl.className = `veg-indicator ${item.is_veg !== false ? 'veg' : 'non-veg'}`;
  vegEl.title = item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian';

  document.getElementById('detailModalBestseller').classList.toggle('d-none', !item.is_bestseller);

  const spiceSection = document.getElementById('detailModalSpiceSection');
  if (item.has_spice_level) {
    spiceSection.classList.remove('d-none');
    document.getElementById('spiceMedium').checked = true; // reset to default each time modal opens
  } else {
    spiceSection.classList.add('d-none');
  }

  const qtyWrapper = document.getElementById('detailModalQtyWrapper');
  qtyWrapper.className = 'qty-control-wrapper';
  qtyWrapper.dataset.itemId = item._id;
  qtyWrapper.innerHTML = getQtyControlHtml(item);
  attachMenuCardHandlers();

  new bootstrap.Modal(document.getElementById('itemDetailModal')).show();
}

// Returns either an "Add" button (item not in cart) or a "- qty +" stepper
function getQtyControlHtml(item) {
  const cartItem = getCart().find((c) => c.id === item._id);
  const qty = cartItem ? cartItem.quantity : 0;

  if (qty === 0) {
    return `
      <button class="btn btn-warning btn-sm fw-semibold add-to-cart-btn"
        data-id="${item._id}"
        data-name="${item.name}"
        data-price="${item.price}"
        data-image="${item.image_url || ''}">
        <i class="bi bi-plus-circle"></i> Add
      </button>
    `;
  }

  return `
    <div class="qty-stepper d-flex align-items-center gap-2">
      <button class="btn btn-outline-warning btn-sm qty-btn qty-decrease-btn" data-id="${item._id}" aria-label="Decrease quantity">
        <i class="bi bi-dash"></i>
      </button>
      <span class="fw-semibold" style="min-width: 18px; text-align: center;">${qty}</span>
      <button class="btn btn-outline-warning btn-sm qty-btn qty-increase-btn"
        data-id="${item._id}"
        data-name="${item.name}"
        data-price="${item.price}"
        data-image="${item.image_url || ''}"
        aria-label="Increase quantity">
        <i class="bi bi-plus"></i>
      </button>
    </div>
  `;
}

function attachMenuCardHandlers() {
  // No-op now — click handling is done once via event delegation (see DOMContentLoaded below).
  // Kept as a function so existing calls elsewhere don't need to change.
}

// Re-renders just the quantity controls on every visible card — called whenever the cart changes.
function syncMenuCardQuantities() {
  document.querySelectorAll('.qty-control-wrapper').forEach((wrapper) => {
    const itemId = wrapper.dataset.itemId;
    const item = allMenuItems.find((i) => i._id === itemId);
    if (!item) return;
    wrapper.innerHTML = getQtyControlHtml(item);
  });
  attachMenuCardHandlers();
}

// Combines the active category filter, search query, and sort order.
function applyFilters() {
  let filtered = allMenuItems;

  if (currentCategoryId !== 'all') {
    filtered = filtered.filter((item) => item.category._id === currentCategoryId);
  }

  const query = currentSearchQuery.trim().toLowerCase();
  if (query !== '') {
    filtered = filtered.filter((item) => matchesSearchQuery(item.name, query));
  }

  filtered = [...filtered];
  if (currentSortOrder === 'price_low_high') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (currentSortOrder === 'price_high_low') {
    filtered.sort((a, b) => b.price - a.price);
  }

  const emptyMessage = query !== ''
    ? `No dishes match "${currentSearchQuery.trim()}". Try a different search.`
    : 'No items found in this category.';

  renderMenuItems(filtered, emptyMessage);
  updateOutletBanner(currentCategoryId);
}

function filterMenuByCategory(categoryId) {
  currentCategoryId = categoryId;
  applyFilters();
}

function handleSearchInput(query) {
  currentSearchQuery = query;
  applyFilters();
}

function handleSortChange(sortValue) {
  currentSortOrder = sortValue;
  applyFilters();
}

// Shows a "Bite Rush <Outlet Name>" banner above the grid when a themed category is selected.
function updateOutletBanner(categoryId) {
  const banner = document.getElementById('outletBanner');
  if (!banner) return;

  if (categoryId === 'all') {
    banner.classList.add('d-none');
    return;
  }

  const category = allCategories.find((c) => c._id === categoryId);
  const info = category && typeof getOutletInfo === 'function' ? getOutletInfo(category.name) : null;

  if (!info) {
    banner.classList.add('d-none');
    return;
  }

  banner.innerHTML = `
    <div class="d-flex align-items-center gap-3 p-3">
      <div class="icon-circle-lg"><i class="bi ${info.icon}"></i></div>
      <div>
        <h5 class="fw-bold mb-0">${info.outletName}</h5>
        <p class="text-muted small mb-0">${info.tagline}</p>
      </div>
    </div>
  `;
  banner.classList.remove('d-none');
}

// If the page was opened as menu.html?category=<id>, pre-select and apply that filter.
function applyCategoryFromURL() {
  const categoryId = new URLSearchParams(window.location.search).get('category');
  if (!categoryId) return;

  const targetBtn = document.querySelector(`.category-btn[data-category="${categoryId}"]`);
  if (!targetBtn) return;

  document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
  targetBtn.classList.add('active');
  filterMenuByCategory(categoryId);
}

// If the page was opened as menu.html?search=<query>, pre-fill and apply that search.
function applySearchFromURL() {
  const query = new URLSearchParams(window.location.search).get('search');
  if (!query) return;

  const searchInput = document.getElementById('menuSearchInput');
  if (searchInput) searchInput.value = query;

  currentSearchQuery = query;
  applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Event delegation: one listener handles Add/+/- clicks anywhere on the
  // page (menu grid cards AND the item detail modal), including elements
  // that get added/replaced later — no need to re-attach listeners each time.
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.add-to-cart-btn, .qty-increase-btn');
    if (addBtn) {
      const item = allMenuItems.find((i) => i._id === addBtn.dataset.id);
      let spiceLevel;

      if (item && item.has_spice_level) {
        const isInModal = addBtn.closest('#itemDetailModal');
        if (isInModal) {
          const checked = document.querySelector('input[name="spiceLevel"]:checked');
          spiceLevel = checked ? checked.value : 'Medium';
        } else {
          spiceLevel = 'Medium'; // quick-add from the card skips the picker — defaults to Medium
        }
      }

      addToCart({
        id: addBtn.dataset.id,
        name: addBtn.dataset.name,
        price: parseFloat(addBtn.dataset.price),
        image_url: addBtn.dataset.image,
        spice_level: spiceLevel
      });
      return;
    }

    const decBtn = e.target.closest('.qty-decrease-btn');
    if (decBtn) {
      updateQuantity(decBtn.dataset.id, -1);
    }
  });

  await loadCategories();
  await loadMenuItems();
  applyCategoryFromURL();
  applySearchFromURL();

  const searchInput = document.getElementById('menuSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      handleSearchInput(e.target.value);
    });
  }

  const sortSelect = document.getElementById('menuSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      handleSortChange(e.target.value);
    });
  }

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (getCart().length === 0) {
        showToast('Your cart is empty! Add some items first.', 'error');
        return;
      }
      window.location.href = 'order.html';
    });
  }
});
