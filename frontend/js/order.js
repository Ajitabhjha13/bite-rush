// ===== ORDER PAGE LOGIC =====

// Show checkout panel if cart has items and user is logged in
function renderCheckoutPanel() {
  const panel = document.getElementById('checkoutPanel');
  const itemsList = document.getElementById('checkoutItemsList');
  const totalEl = document.getElementById('checkoutTotal');
  const cart = getCart();

  if (cart.length === 0 || !isLoggedIn()) {
    panel.classList.add('d-none');
    return;
  }

  panel.classList.remove('d-none');

  itemsList.innerHTML = cart.map((item) => `
    <div class="d-flex justify-content-between py-2 border-bottom">
      <span>${item.name} <span class="text-muted">x${item.quantity}</span></span>
      <span class="fw-semibold">₹${item.price * item.quantity}</span>
    </div>
  `).join('');

  totalEl.textContent = `₹${getCartTotal()}`;
}

// Place the order via API
async function placeOrder() {
  const btn = document.getElementById('placeOrderBtn');
  const errorBox = document.getElementById('checkoutError');
  const cart = getCart();

  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  if (cart.length === 0) {
    return;
  }

  errorBox.classList.add('d-none');
  btn.disabled = true;
  btn.textContent = 'Placing order...';

  try {
    const cart_items = cart.map((item) => ({
      item_id: item.id,
      quantity: item.quantity
    }));

    const res = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ cart_items })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to place order');
    }

    // Show confirmation
    document.getElementById('checkoutPanel').classList.add('d-none');
    document.getElementById('confirmationPanel').classList.remove('d-none');
    document.getElementById('confirmOrderId').textContent = data.order_id;
    document.getElementById('confirmTotal').textContent = `₹${data.total_amount}`;

    clearCart();
    loadOrderHistory(); // refresh history to include the new order

  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = 'Confirm & Place Order';
  }
}

// Load order history from API
async function loadOrderHistory() {
  const container = document.getElementById('orderHistoryList');

  if (!isLoggedIn()) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-lock fs-1"></i>
        <p class="mt-2">Please <a href="login.html">login</a> to view your order history.</p>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/orders/my`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    const orders = await res.json();

    if (!res.ok) {
      throw new Error(orders.message || 'Failed to load orders');
    }

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-receipt fs-1"></i>
          <p class="mt-2">No orders yet. <a href="menu.html">Browse the menu</a> to place your first order!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map((order) => `
      <div class="card order-history-card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <span class="fw-semibold">Order #${order._id.slice(-6).toUpperCase()}</span>
              <span class="status-badge status-${order.status} ms-2">${order.status}</span>
              <div class="text-muted small mt-1">${new Date(order.createdAt).toLocaleString()}</div>
            </div>
            <div class="fw-bold fs-5">₹${order.total_amount}</div>
          </div>
          <div class="mt-2 small text-muted">
            ${order.items.map((oi) => `${oi.item ? oi.item.name : 'Item'} x${oi.quantity}`).join(', ')}
          </div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    container.innerHTML = `<p class="text-center text-danger py-4">${error.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCheckoutPanel();
  loadOrderHistory();

  const placeOrderBtn = document.getElementById('placeOrderBtn');
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', placeOrder);
  }
});