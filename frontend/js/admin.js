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
        <td class="small">${order.items.map((oi) => `${oi.item ? oi.item.name : 'Item'} x${oi.quantity}`).join(', ')}</td>
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
  document.getElementById('itemAvailable').checked = item.is_available;
  document.getElementById('itemVeg').checked = item.is_veg !== false;
  document.getElementById('itemBestseller').checked = !!item.is_bestseller;

  new bootstrap.Modal(document.getElementById('menuItemModal')).show();
}

function resetMenuForm() {
  document.getElementById('menuModalTitle').textContent = 'Add Menu Item';
  document.getElementById('menuItemForm').reset();
  document.getElementById('menuItemId').value = '';
  document.getElementById('itemAvailable').checked = true;
  document.getElementById('itemVeg').checked = true;
  document.getElementById('itemBestseller').checked = false;
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
    is_available: document.getElementById('itemAvailable').checked,
    is_veg: document.getElementById('itemVeg').checked,
    is_bestseller: document.getElementById('itemBestseller').checked
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

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateAuthNav();

  if (!checkAdminAccess()) return;

  setupTabs();
  loadOrders(true);
  loadCategoriesForForm();

  document.getElementById('addMenuItemBtn').addEventListener('click', resetMenuForm);
  document.getElementById('saveMenuItemBtn').addEventListener('click', saveMenuItem);

  autoRefreshInterval = setInterval(() => {
    const ordersTabVisible = !document.getElementById('ordersTab').classList.contains('d-none');
    if (ordersTabVisible) loadOrders();
  }, 30000);
});
