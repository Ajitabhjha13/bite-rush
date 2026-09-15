// ===== ADMIN DASHBOARD LOGIC =====

let allCategoriesAdmin = [];
let autoRefreshInterval;

function checkAdminAccess() {
  const user = getCurrentUser();

  if (!user || user.role !== 'admin') {
    document.getElementById('accessDenied').classList.remove('d-none');
    document.getElementById('adminContent').classList.add('d-none');
    return false;
  }

  document.getElementById('accessDenied').classList.add('d-none');
  document.getElementById('adminContent').classList.remove('d-none');
  return true;
}

// ===== TAB SWITCHING =====
function setupTabs() {
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.admin-tab').forEach((tab) => tab.classList.add('d-none'));
      document.getElementById(`${btn.dataset.tab}Tab`).classList.remove('d-none');

      if (btn.dataset.tab === 'menu') {
        loadMenuItemsAdmin();
      }

      if (btn.dataset.tab === 'combos') {
        loadCombosAdmin();
      }
    });
  });
}

// ===== ORDERS TAB =====
async function loadOrders(isInitialLoad = false) {
  const tbody = document.getElementById('ordersTableBody');

  if (isInitialLoad) {
    tbody.innerHTML = `
      <tr><td colspan="6" class="text-center py-4">
        <div class="spinner-border spinner-border-sm text-warning" role="status"></div>
        <span class="text-muted ms-2">Loading orders...</span>
      </td></tr>
    `;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/orders/admin/all`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const orders = await res.json();

    if (!res.ok) throw new Error(orders.message || 'Failed to load orders');

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map((order) => `
      <tr>
        <td class="fw-semibold">#${order._id.slice(-6).toUpperCase()}</td>
        <td>${order.user ? order.user.name : 'Unknown'}<br><span class="text-muted small">${order.user ? order.user.email : ''}</span></td>
        <td class="small">${order.items.map((oi) => {
          const label = oi.combo ? `${oi.combo.name} (Combo)` : (oi.item ? oi.item.name : 'Item');
          return `${label}${oi.spice_level ? ` (${oi.spice_level})` : ''} x${oi.quantity}`;
        }).join(', ')}</td>
        <td class="fw-semibold">₹${order.total_amount}</td>
        <td>
          <select class="form-select form-select-sm admin-status-select" data-order-id="${order._id}">
            <option value="Received" ${order.status === 'Received' ? 'selected' : ''}>Received</option>
            <option value="Preparing" ${order.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
            <option value="Ready" ${order.status === 'Ready' ? 'selected' : ''}>Ready</option>
            <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </td>
        <td class="small text-muted">${new Date(order.createdAt).toLocaleString()}</td>
      </tr>
    `).join('');

    document.querySelectorAll('.admin-status-select').forEach((select) => {
      select.addEventListener('change', () => updateOrderStatusAdmin(select.dataset.orderId, select.value));
    });

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${error.message}</td></tr>`;
  }
}

async function updateOrderStatusAdmin(orderId, newStatus) {
  try {
    const res = await fetch(`${API_BASE_URL}/orders/admin/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to update status');
    }

    showToast('Order status updated successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
    loadOrders();
  }
}

// ===== MENU MANAGEMENT TAB =====
async function loadCategoriesForForm() {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`);
    allCategoriesAdmin = await res.json();

    const select = document.getElementById('itemCategory');
    select.innerHTML = allCategoriesAdmin.map((cat) => `<option value="${cat._id}">${cat.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadMenuItemsAdmin() {
  const tbody = document.getElementById('menuTableBody');

  tbody.innerHTML = `
    <tr><td colspan="6" class="text-center py-4">
      <div class="spinner-border spinner-border-sm text-warning" role="status"></div>
      <span class="text-muted ms-2">Loading menu...</span>
    </td></tr>
  `;

  try {
    const res = await fetch(`${API_BASE_URL}/menu/admin/all`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const items = await res.json();

    if (!res.ok) throw new Error(items.message || 'Failed to load menu');

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No menu items yet.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map((item) => `
      <tr>
        <td><img src="${item.image_url || 'https://placehold.co/50x50/f1f1f1/999999?text=%20'}" width="45" height="45" style="object-fit:cover; border-radius:6px;" onerror="this.onerror=null; this.src='https://placehold.co/50x50/f1f1f1/999999?text=%20';"></td>
        <td class="fw-semibold">
          <span class="veg-indicator ${item.is_veg !== false ? 'veg' : 'non-veg'}" title="${item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'}"></span>
          ${item.name}
          ${item.is_bestseller ? '<span class="badge bg-warning text-dark ms-1">Bestseller</span>' : ''}
        </td>
        <td>${item.category ? item.category.name : '-'}</td>
        <td>₹${item.price}</td>
        <td>${item.is_available ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-item-btn" data-id="${item._id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-item-btn" data-id="${item._id}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');

    window.currentMenuItems = items;

    document.querySelectorAll('.edit-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.delete-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteMenuItemAdmin(btn.dataset.id));
    });

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${error.message}</td></tr>`;
  }
}

function openEditModal(itemId) {
  const item = window.currentMenuItems.find((i) => i._id === itemId);
  if (!item) return;

  document.getElementById('menuModalTitle').textContent = 'Edit Menu Item';
  document.getElementById('menuItemId').value = item._id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemDescription').value = item.description || '';
  document.getElementById('itemPrice').value = item.price;
  document.getElementById('itemImage').value = item.image_url || '';
  document.getElementById('itemCategory').value = item.category ? item.category._id : '';
  document.getElementById('itemPrepTime').value = item.prep_time || '';
  document.getElementById('itemAvailable').checked = item.is_available;
  document.getElementById('itemVeg').checked = item.is_veg !== false;
  document.getElementById('itemBestseller').checked = !!item.is_bestseller;
  document.getElementById('itemHasSpiceLevel').checked = !!item.has_spice_level;

  new bootstrap.Modal(document.getElementById('menuItemModal')).show();
}

function resetMenuForm() {
  document.getElementById('menuModalTitle').textContent = 'Add Menu Item';
  document.getElementById('menuItemForm').reset();
  document.getElementById('menuItemId').value = '';
  document.getElementById('itemPrepTime').value = '';
  document.getElementById('itemAvailable').checked = true;
  document.getElementById('itemVeg').checked = true;
  document.getElementById('itemBestseller').checked = false;
  document.getElementById('itemHasSpiceLevel').checked = false;
  document.getElementById('menuFormError').classList.add('d-none');
}

async function saveMenuItem() {
  const id = document.getElementById('menuItemId').value;
  const errorBox = document.getElementById('menuFormError');

  const payload = {
    name: document.getElementById('itemName').value,
    description: document.getElementById('itemDescription').value,
    price: parseFloat(document.getElementById('itemPrice').value),
    image_url: document.getElementById('itemImage').value,
    category: document.getElementById('itemCategory').value,
    prep_time: document.getElementById('itemPrepTime').value,
    is_available: document.getElementById('itemAvailable').checked,
    is_veg: document.getElementById('itemVeg').checked,
    is_bestseller: document.getElementById('itemBestseller').checked,
    has_spice_level: document.getElementById('itemHasSpiceLevel').checked
  };

  errorBox.classList.add('d-none');

  try {
    const url = id ? `${API_BASE_URL}/menu/admin/${id}` : `${API_BASE_URL}/menu/admin`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to save item');

    bootstrap.Modal.getInstance(document.getElementById('menuItemModal')).hide();
    loadMenuItemsAdmin();
    showToast(id ? 'Menu item updated successfully' : 'Menu item added successfully', 'success');

  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
}

async function deleteMenuItemAdmin(itemId) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  try {
    const res = await fetch(`${API_BASE_URL}/menu/admin/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to delete item');
    }

    loadMenuItemsAdmin();
    showToast('Menu item deleted successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== COMBO MANAGEMENT TAB =====
let allMenuItemsForCombo = [];

async function loadCombosAdmin() {
  const tbody = document.getElementById('comboTableBody');

  tbody.innerHTML = `
    <tr><td colspan="6" class="text-center py-4">
      <div class="spinner-border spinner-border-sm text-warning" role="status"></div>
      <span class="text-muted ms-2">Loading combos...</span>
    </td></tr>
  `;

  try {
    const res = await fetch(`${API_BASE_URL}/combos/admin/all`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const combos = await res.json();

    if (!res.ok) throw new Error(combos.message || 'Failed to load combos');

    if (combos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No combos yet — click "Add Combo" to create one.</td></tr>';
      return;
    }

    window.currentCombos = combos;

    tbody.innerHTML = combos.map((combo) => `
      <tr>
        <td><img src="${combo.image_url || 'https://placehold.co/50x50/f1f1f1/999999?text=%20'}" width="45" height="45" style="object-fit:cover; border-radius:6px;" onerror="this.onerror=null; this.src='https://placehold.co/50x50/f1f1f1/999999?text=%20';"></td>
        <td class="fw-semibold">${combo.name}</td>
        <td class="small text-muted">${combo.items.map((i) => i.name).join(', ')}</td>
        <td>₹${combo.combo_price} <span class="text-muted small text-decoration-line-through">₹${combo.original_price}</span></td>
        <td>${combo.is_available ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-combo-btn" data-id="${combo._id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-combo-btn" data-id="${combo._id}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.edit-combo-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditComboModal(btn.dataset.id));
    });

    document.querySelectorAll('.delete-combo-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteComboAdmin(btn.dataset.id));
    });

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${error.message}</td></tr>`;
  }
}

async function loadMenuItemsChecklist(selectedIds = []) {
  const container = document.getElementById('comboItemsChecklist');

  try {
    if (allMenuItemsForCombo.length === 0) {
      const res = await fetch(`${API_BASE_URL}/menu`);
      allMenuItemsForCombo = await res.json();
    }

    container.innerHTML = allMenuItemsForCombo.map((item) => `
      <div class="form-check">
        <input class="form-check-input combo-item-checkbox" type="checkbox" value="${item._id}" data-price="${item.price}" id="comboItem-${item._id}" ${selectedIds.includes(item._id) ? 'checked' : ''}>
        <label class="form-check-label small" for="comboItem-${item._id}">${item.name} — ₹${item.price}</label>
      </div>
    `).join('');

    document.querySelectorAll('.combo-item-checkbox').forEach((cb) => {
      cb.addEventListener('change', updateComboOriginalPriceHint);
    });

    updateComboOriginalPriceHint();

  } catch (error) {
    container.innerHTML = '<p class="text-danger small mb-0">Failed to load menu items.</p>';
  }
}

function updateComboOriginalPriceHint() {
  const checked = document.querySelectorAll('.combo-item-checkbox:checked');
  const total = Array.from(checked).reduce((sum, cb) => sum + parseFloat(cb.dataset.price), 0);
  const hint = document.getElementById('comboOriginalPriceHint');
  hint.textContent = checked.length > 0
    ? `Selected items total: ₹${total} (set your combo price below this for it to show savings)`
    : '';
}

function openEditComboModal(comboId) {
  const combo = window.currentCombos.find((c) => c._id === comboId);
  if (!combo) return;

  document.getElementById('comboModalTitle').textContent = 'Edit Combo';
  document.getElementById('comboId').value = combo._id;
  document.getElementById('comboName').value = combo.name;
  document.getElementById('comboDescription').value = combo.description || '';
  document.getElementById('comboImage').value = combo.image_url || '';
  document.getElementById('comboPrice').value = combo.combo_price;
  document.getElementById('comboAvailable').checked = combo.is_available;

  loadMenuItemsChecklist(combo.items.map((i) => i._id));

  new bootstrap.Modal(document.getElementById('comboModal')).show();
}

function resetComboForm() {
  document.getElementById('comboModalTitle').textContent = 'Add Combo';
  document.getElementById('comboForm').reset();
  document.getElementById('comboId').value = '';
  document.getElementById('comboAvailable').checked = true;
  document.getElementById('comboFormError').classList.add('d-none');
  loadMenuItemsChecklist([]);
}

async function saveCombo() {
  const id = document.getElementById('comboId').value;
  const errorBox = document.getElementById('comboFormError');

  const selectedItems = Array.from(document.querySelectorAll('.combo-item-checkbox:checked')).map((cb) => cb.value);

  const payload = {
    name: document.getElementById('comboName').value,
    description: document.getElementById('comboDescription').value,
    image_url: document.getElementById('comboImage').value,
    items: selectedItems,
    combo_price: parseFloat(document.getElementById('comboPrice').value),
    is_available: document.getElementById('comboAvailable').checked
  };

  errorBox.classList.add('d-none');

  if (selectedItems.length === 0) {
    errorBox.textContent = 'Please select at least one item for the combo.';
    errorBox.classList.remove('d-none');
    return;
  }

  try {
    const url = id ? `${API_BASE_URL}/combos/admin/${id}` : `${API_BASE_URL}/combos/admin`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to save combo');

    bootstrap.Modal.getInstance(document.getElementById('comboModal')).hide();
    loadCombosAdmin();
    showToast(id ? 'Combo updated successfully' : 'Combo added successfully', 'success');

  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
}

async function deleteComboAdmin(comboId) {
  if (!confirm('Are you sure you want to delete this combo?')) return;

  try {
    const res = await fetch(`${API_BASE_URL}/combos/admin/${comboId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to delete combo');
    }

    loadCombosAdmin();
    showToast('Combo deleted successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateAuthNav();

  if (!checkAdminAccess()) return;

  setupTabs();
  loadOrders(true);
  loadCategoriesForForm();

  document.getElementById('addMenuItemBtn').addEventListener('click', resetMenuForm);
  document.getElementById('saveMenuItemBtn').addEventListener('click', saveMenuItem);

  document.getElementById('addComboBtn').addEventListener('click', resetComboForm);
  document.getElementById('saveComboBtn').addEventListener('click', saveCombo);

  autoRefreshInterval = setInterval(() => {
    const ordersTabVisible = !document.getElementById('ordersTab').classList.contains('d-none');
    if (ordersTabVisible) loadOrders();
  }, 30000);
});
