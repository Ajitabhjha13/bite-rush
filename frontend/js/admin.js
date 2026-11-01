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

      if (btn.dataset.tab === 'reservations') {
        initReservations();
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
            <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
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

  // Reservations grid refreshes faster: holds appear/expire within minutes
  setInterval(() => {
    const visible = !document.getElementById('reservationsTab').classList.contains('d-none');
    const modalOpen = document.getElementById('resModal').classList.contains('show');
    if (visible && !modalOpen) loadReservations();
  }, 15000);
});


// ===== RESERVATIONS TAB =====
let resState = { date: null, grid: null, inited: false, selected: null };

function istTodayString() {
  // en-CA gives YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slotLabel(slot) {
  const [h, m] = slot.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function adminApi(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors && data.errors[0] && data.errors[0].msg) || data.message || 'Something went wrong');
  return data;
}

function initReservations() {
  if (!resState.inited) {
    resState.inited = true;
    resState.date = istTodayString();
    const input = document.getElementById('resDate');
    input.addEventListener('change', () => { if (input.value) { resState.date = input.value; loadReservations(); } });
    document.getElementById('resPrevBtn').addEventListener('click', () => setResDate(shiftDate(resState.date, -1)));
    document.getElementById('resNextBtn').addEventListener('click', () => setResDate(shiftDate(resState.date, 1)));
    document.getElementById('resTodayBtn').addEventListener('click', () => setResDate(istTodayString()));

    document.getElementById('resGrid').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-res-id]');
      if (cell) openReservation(cell.dataset.resId);
    });
    document.getElementById('resTables').addEventListener('change', (e) => {
      const sw = e.target.closest('[data-table-id]');
      if (sw) toggleTable(sw);
    });
    document.getElementById('resModalFooter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-res-action]');
      if (btn) runReservationAction(btn.dataset.resAction);
    });
  }
  document.getElementById('resDate').value = resState.date;
  loadReservations();
}

function setResDate(d) {
  resState.date = d;
  document.getElementById('resDate').value = d;
  loadReservations();
}

async function loadReservations() {
  try {
    resState.grid = await adminApi(`/bookings/admin/grid?date=${resState.date}`);
    renderReservations();
  } catch (err) {
    document.getElementById('resGrid').innerHTML =
      `<tbody><tr><td class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr></tbody>`;
  }
}

function cellClass(c) {
  if (!c) return 'res-free';
  if (c.status === 'held') return 'res-held';
  if (c.attendance === 'seated') return 'res-seated';
  if (c.attendance === 'no_show') return 'res-noshow';
  return 'res-confirmed';
}

function renderReservations() {
  const g = resState.grid;
  const s = g.summary;
  const card = (label, value, icon) => `
    <div class="col-6 col-lg-3"><div class="res-stat">
      <div class="res-stat-icon"><i class="bi ${icon}"></i></div>
      <div><div class="res-stat-value">${value}</div><div class="res-stat-label">${label}</div></div>
    </div></div>`;
  document.getElementById('resSummary').innerHTML =
    card('Confirmed', s.confirmed, 'bi-check-circle') +
    card('Paying now (held)', s.held, 'bi-hourglass-split') +
    card('Expected guests', s.expected_guests, 'bi-people') +
    card('Free online slots', s.free_online_slots, 'bi-grid-3x3-gap');

  const head = `<thead><tr><th>Table</th>${g.slots.map((sl) => `<th class="text-center">${slotLabel(sl)}</th>`).join('')}</tr></thead>`;
  const rows = g.tables.map((t) => {
    const off = !t.is_active;
    const badge = off ? '<span class="badge bg-secondary">Off</span>'
      : t.bookable_online ? '<span class="badge bg-success-subtle text-success-emphasis">Online</span>'
      : '<span class="badge bg-info-subtle text-info-emphasis">Walk-in</span>';
    const tds = g.slots.map((sl) => {
      const c = t.cells[sl];
      if (!c) return `<td class="res-cell res-free ${off ? 'res-off' : ''}"></td>`;
      const who = c.status === 'held' ? 'Paying...' : escapeHtml((c.customer && c.customer.name) || 'Guest');
      const tag = c.attendance === 'seated' ? 'Seated' : c.attendance === 'no_show' ? 'No-show' : `${c.guests} guests`;
      return `<td class="res-cell ${cellClass(c)}" data-res-id="${c.reservation_id}" role="button">
        <div class="res-cell-name">${who}</div><div class="res-cell-sub">${tag}</div></td>`;
    }).join('');
    return `<tr><th scope="row" class="res-table-head">T${t.number}
      <div class="small fw-normal text-muted">${t.seats} seats</div>${badge}</th>${tds}</tr>`;
  }).join('');
  document.getElementById('resGrid').innerHTML = head + `<tbody>${rows}</tbody>`;

  document.getElementById('resTables').innerHTML = g.tables.map((t) => `
    <div class="col-6 col-md-4 col-lg-3"><div class="res-table-card ${t.is_active ? '' : 'opacity-50'}">
      <div class="fw-semibold">T${t.number} <span class="text-muted small">· ${t.seats} seats</span></div>
      <div class="form-check form-switch mt-1">
        <input class="form-check-input" type="checkbox" id="tbl-online-${t._id}" data-table-id="${t._id}" data-field="bookable_online" ${t.bookable_online ? 'checked' : ''}>
        <label class="form-check-label small" for="tbl-online-${t._id}">Online booking</label>
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="tbl-active-${t._id}" data-table-id="${t._id}" data-field="is_active" ${t.is_active ? 'checked' : ''}>
        <label class="form-check-label small" for="tbl-active-${t._id}">In service</label>
      </div>
    </div></div>`).join('');
}

function findCell(id) {
  for (const t of resState.grid.tables) {
    for (const sl of resState.grid.slots) {
      const c = t.cells[sl];
      if (c && String(c.reservation_id) === String(id)) return { table: t, slot: sl, cell: c };
    }
  }
  return null;
}

function openReservation(id) {
  const found = findCell(id);
  if (!found) return;
  resState.selected = found;
  const { table, slot, cell } = found;
  const isToday = resState.date <= istTodayString();
  const line = (k, v) => `<div class="d-flex justify-content-between py-1 border-bottom"><span class="text-muted">${k}</span><span class="fw-semibold text-end">${v}</span></div>`;
  const att = cell.attendance === 'seated' ? 'Seated' : cell.attendance === 'no_show' ? 'No-show' : 'Not arrived yet';
  document.getElementById('resModalBody').innerHTML =
    line('Table', `T${table.number} (${table.seats} seats)`) +
    line('Date & time', `${resState.date}, ${slotLabel(slot)}`) +
    line('Customer', escapeHtml((cell.customer && cell.customer.name) || '—')) +
    line('Email', escapeHtml((cell.customer && cell.customer.email) || '—')) +
    line('Guests', cell.guests) +
    line('Status', cell.status === 'held' ? 'Held, waiting for payment' : 'Confirmed') +
    line('Deposit', `₹${(cell.amount || 0) / 100} (${escapeHtml(cell.payment_status)})`) +
    (cell.razorpay_payment_id ? line('Payment id', `<code>${escapeHtml(cell.razorpay_payment_id)}</code>`) : '') +
    line('Attendance', att);

  let buttons = '';
  if (cell.status === 'confirmed') {
    if (isToday && cell.attendance !== 'seated') buttons += '<button class="btn btn-success" data-res-action="seated"><i class="bi bi-person-check"></i> Seated</button>';
    if (isToday && cell.attendance !== 'no_show') buttons += '<button class="btn btn-outline-secondary" data-res-action="no_show">No-show</button>';
    if (isToday && cell.attendance !== 'pending') buttons += '<button class="btn btn-link" data-res-action="pending">Undo</button>';
  }
  if (cell.attendance !== 'seated') {
    buttons += `<button class="btn btn-outline-danger ms-auto" data-res-action="cancel">${cell.status === 'confirmed' ? 'Cancel &amp; refund 100%' : 'Release hold'}</button>`;
  }
  document.getElementById('resModalFooter').innerHTML = buttons || '<span class="text-muted small">No actions available.</span>';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('resModal')).show();
}

async function runReservationAction(action) {
  const sel = resState.selected;
  if (!sel) return;
  const id = sel.cell.reservation_id;
  if (action === 'cancel') {
    const msg = sel.cell.status === 'confirmed'
      ? `Cancel this booking and refund ₹${(sel.cell.amount || 0) / 100} to ${(sel.cell.customer && sel.cell.customer.name) || 'the customer'}?`
      : 'Release this held table?';
    if (!window.confirm(msg)) return;
  }
  const btns = document.querySelectorAll('#resModalFooter button');
  btns.forEach((b) => { b.disabled = true; });
  try {
    if (action === 'cancel') {
      const out = await adminApi(`/bookings/admin/${id}/cancel`, { method: 'PUT', body: '{}' });
      const r = out.refund;
      if (r.status === 'processed') showToast(`Cancelled. ₹${r.amount / 100} refunded.`, 'success');
      else if (r.status === 'pending') showToast('Cancelled, but the refund failed and needs a retry.', 'error');
      else showToast('Cancelled.', 'success');
    } else {
      await adminApi(`/bookings/admin/${id}/attendance`, { method: 'PUT', body: JSON.stringify({ attendance: action }) });
      showToast('Updated.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('resModal')).hide();
    await loadReservations();
  } catch (err) {
    showToast(err.message, 'error');
    btns.forEach((b) => { b.disabled = false; });
  }
}

async function toggleTable(input) {
  const body = { [input.dataset.field]: input.checked };
  input.disabled = true;
  try {
    const out = await adminApi(`/tables/${input.dataset.tableId}`, { method: 'PUT', body: JSON.stringify(body) });
    if (out.upcoming_bookings > 0) {
      showToast(`Saved. ${out.upcoming_bookings} upcoming booking(s) on this table are unchanged.`, 'info');
    } else {
      showToast('Table updated.', 'success');
    }
  } catch (err) {
    input.checked = !input.checked;
    showToast(err.message, 'error');
  } finally {
    input.disabled = false;
    loadReservations();
  }
}
