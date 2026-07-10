// ===== MENU PAGE LOGIC =====

let allMenuItems = [];
let allCategories = [];

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

    // Attach click handlers to ALL category buttons (including "All")
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
function renderMenuItems(items) {
  const menuGrid = document.getElementById('menuGrid');

  if (items.length === 0) {
    menuGrid.innerHTML = '<p class="text-center text-muted py-5">No items found in this category.</p>';
    return;
  }

  menuGrid.innerHTML = items.map((item) => `
    <div class="col-sm-6 col-lg-4 col-xl-3">
      <div class="card menu-card">
        <img src="${item.image_url || 'https://via.placeholder.com/300x180?text=No+Image'}" alt="${item.name}">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title fw-semibold">${item.name}</h5>
          <p class="card-text text-muted small flex-grow-1">${item.description || ''}</p>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="fw-bold fs-5">₹${item.price}</span>
            <button class="btn btn-warning btn-sm fw-semibold add-to-cart-btn"
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

  // Attach click handlers to all "Add" buttons
  document.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: parseFloat(btn.dataset.price),
        image_url: btn.dataset.image
      });

      // Quick visual feedback
      btn.innerHTML = '<i class="bi bi-check-circle"></i> Added';
      setTimeout(() => {
        btn.innerHTML = '<i class="bi bi-plus-circle"></i> Add';
      }, 800);
    });
  });
}

// Filters items by category (or shows all)
function filterMenuByCategory(categoryId) {
  if (categoryId === 'all') {
    renderMenuItems(allMenuItems);
  } else {
    const filtered = allMenuItems.filter((item) => item.category._id === categoryId);
    renderMenuItems(filtered);
  }
}

// Checkout button — for now, redirects to order page (we'll build real checkout in Step 9)
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadMenuItems();

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (getCart().length === 0) {
        alert('Your cart is empty!');
        return;
      }
      window.location.href = 'order.html';
    });
  }
});