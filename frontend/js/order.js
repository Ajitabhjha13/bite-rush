// ===== ORDER PAGE LOGIC =====

const ORDER_STATUS_STEPS = [
  { key: 'Received', icon: 'bi-receipt' },
  { key: 'Preparing', icon: 'bi-egg-fried' },
  { key: 'Ready', icon: 'bi-bag-check' },
  { key: 'Delivered', icon: 'bi-truck' }
];

// Renders a tracker with steps up to and including the order's CURRENT status
// marked active - used both for the just-placed confirmation and order history.
function renderStatusTracker(currentStatus) {
  const currentIndex = ORDER_STATUS_STEPS.findIndex((s) => s.key === currentStatus);

  return `
    <div class="status-tracker d-flex justify-content-between mx-auto mt-3" style="max-width: 420px;">
      ${ORDER_STATUS_STEPS.map((step, i) => `
        <div class="status-step ${i <= currentIndex ? 'active' : ''}">
          <i class="bi ${step.icon}"></i>
          <span>${step.key}</span>
        </div>
      `).join('')}
    </div>
  `;
}


// ===== DELIVERY DETAILS =====
// The server is the authority on every rule below; these checks only give instant feedback.
const DELIVERY_PIN_MIN = 390001;
const DELIVERY_PIN_MAX = 390025;

function escapeText(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizePhone(value) {
  let d = String(value || '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

const DELIVERY_FIELDS = {
  name: 'delName', phone: 'delPhone', address_line: 'delAddress',
  area: 'delArea', landmark: 'delLandmark', pincode: 'delPincode'
};

function readDelivery() {
  const v = (id) => document.getElementById(id).value.trim();
  return {
    name: v('delName'), phone: normalizePhone(v('delPhone')), address_line: v('delAddress'),
    area: v('delArea'), landmark: v('delLandmark'), pincode: v('delPincode')
  };
}

function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  input.classList.toggle('is-invalid', Boolean(message));
  const fb = input.parentElement.querySelector('.invalid-feedback');
  if (fb) fb.textContent = message || '';
}

function validateDelivery(d) {
  const errors = {};
  if (d.name.length < 2) errors.name = 'Enter the name of the person receiving the order.';
  if (!/^[6-9]\d{9}$/.test(d.phone)) errors.phone = 'Enter a valid 10-digit mobile number.';
  if (d.address_line.length < 5) errors.address_line = 'Enter your flat, building and street.';
  if (d.area.length < 2) errors.area = 'Enter your area.';
  if (d.landmark.length > 80) errors.landmark = 'Landmark must be at most 80 characters.';
  if (!/^\d{6}$/.test(d.pincode)) {
    errors.pincode = 'Enter a 6-digit pincode.';
  } else if (Number(d.pincode) < DELIVERY_PIN_MIN || Number(d.pincode) > DELIVERY_PIN_MAX) {
    errors.pincode = 'Sorry, we deliver only within Vadodara (pincodes 390001 to 390025).';
  }
  return errors;
}

function showDeliveryErrors(errors) {
  Object.entries(DELIVERY_FIELDS).forEach(([key, id]) => setFieldError(id, errors[key]));
  const first = Object.keys(errors)[0];
  if (first) document.getElementById(DELIVERY_FIELDS[first]).focus();
}

function formatAddress(d) {
  if (!d || !d.address_line) return '';
  const parts = [d.address_line, d.area, d.landmark ? `Landmark: ${d.landmark}` : '', `${d.city || 'Vadodara'} ${d.pincode || ''}`.trim()];
  return parts.filter(Boolean).join(', ');
}

// Show checkout panel if cart has items and user is logged in.
// If cart has items but user ISN'T logged in, show a clear "please login" panel
// instead of silently hiding everything (which looked like the cart was empty).
function renderCheckoutPanel() {
  const panel = document.getElementById('checkoutPanel');
  const loginRequiredPanel = document.getElementById('loginRequiredPanel');
  const itemsList = document.getElementById('checkoutItemsList');
  const totalEl = document.getElementById('checkoutTotal');
  const cart = getCart();

  if (cart.length === 0) {
    panel.classList.add('d-none');
    loginRequiredPanel.classList.add('d-none');
    return;
  }

  if (!isLoggedIn()) {
    panel.classList.add('d-none');
    loginRequiredPanel.classList.remove('d-none');
    return;
  }

  loginRequiredPanel.classList.add('d-none');
  panel.classList.remove('d-none');

  itemsList.innerHTML = cart.map((item) => `
    <div class="d-flex justify-content-between py-2 border-bottom">
      <span>${item.name} ${item.type === 'combo' ? '<span class="badge bg-warning text-dark"><i class="bi bi-box-seam"></i> Combo</span>' : ''} ${item.spice_level ? `<span class="badge bg-light text-dark border">${item.spice_level}</span>` : ''} <span class="text-muted">x${item.quantity}</span></span>
      <span class="fw-semibold">₹${item.price * item.quantity}</span>
    </div>
  `).join('');

  totalEl.textContent = `₹${getCartTotal()}`;

  const nameInput = document.getElementById('delName');
  const user = getCurrentUser();
  if (nameInput && !nameInput.value && user && user.name) nameInput.value = user.name;
}

// ===== PAYMENT CHOICE =====
function selectedMethod() {
  const el = document.querySelector('input[name="payMethod"]:checked');
  return el ? el.value : 'cod';
}

function updatePayUi() {
  const online = selectedMethod() === 'online';
  const label = document.getElementById('placeOrderLabel');
  const hint = document.getElementById('payHint');
  if (label) label.textContent = online ? `Pay ₹${getCartTotal()}` : 'Confirm & Place Order';
  if (hint) hint.classList.toggle('d-none', !online);
}

// An online order that is waiting for payment. Kept while the page is open so a closed popup can be reopened
// for the SAME order (no second order, no second charge), but only while the cart and address are unchanged.
let pendingOnline = null;

function resetPlaceButton() {
  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = false;
  btn.classList.remove('disabled');
  updatePayUi();
}

function showError(message) {
  const errorBox = document.getElementById('checkoutError');
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

// Shows the "order placed" screen. `paidOnline` also starts the 30-second full-refund countdown.
function showConfirmation({ orderId, total, delivery, paidOnline, secondsLeft }) {
  document.getElementById('confirmAddress').textContent = formatAddress({ ...delivery, city: 'Vadodara' });
  document.getElementById('checkoutPanel').classList.add('d-none');
  document.getElementById('confirmationPanel').classList.remove('d-none');
  document.getElementById('confirmOrderId').textContent = orderId;
  document.getElementById('confirmTotal').textContent = `₹${total}`;
  document.getElementById('confirmPaymentText').textContent = paidOnline ? 'Paid online (test mode)' : 'Cash on delivery';
  document.getElementById('confirmStatusTracker').innerHTML = renderStatusTracker('Received');
  if (paidOnline) startUndoCountdown(orderId, secondsLeft);
  clearCart();
  loadOrderHistory();
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
  delete errorBox.dataset.kind;
  const delivery = readDelivery();
  const problems = validateDelivery(delivery);
  showDeliveryErrors(problems);
  if (Object.keys(problems).length > 0) {
    errorBox.textContent = 'Please fix the highlighted delivery details.';
    errorBox.dataset.kind = 'fields'; // hidden again as soon as every highlighted field is fixed
    errorBox.classList.remove('d-none');
    return;
  }

  const method = selectedMethod();
  if (method === 'online' && typeof Razorpay === 'undefined') {
    showError('The payment popup could not load. Check your internet connection, or choose cash on delivery.');
    return;
  }

  btn.disabled = true;
  document.getElementById('placeOrderLabel').textContent = method === 'online' ? 'Starting payment...' : 'Placing order...';

  try {
    const cart_items = cart.map((item) => ({
      type: item.type === 'combo' ? 'combo' : 'item',
      item_id: item.type === 'combo' ? undefined : item.id,
      combo_id: item.type === 'combo' ? item.id : undefined,
      quantity: item.quantity,
      spice_level: item.spice_level || undefined
    }));

    // Same cart and same address as the unfinished payment: reopen that payment instead of creating another order.
    const signature = JSON.stringify({ cart_items, delivery, method });
    if (method === 'online' && pendingOnline && pendingOnline.signature === signature) {
      openRazorpay(pendingOnline, delivery);
      return;
    }
    pendingOnline = null;

    const res = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ cart_items, delivery, payment_method: method })
    });

    const data = await res.json();

    if (!res.ok) {
      // Point at the exact field the server rejected, if it says which one.
      const serverErrors = {};
      (data.errors || []).forEach((e) => {
        const key = String(e.field || '').replace('delivery.', '');
        if (DELIVERY_FIELDS[key] && !serverErrors[key]) serverErrors[key] = e.message;
      });
      if (Object.keys(serverErrors).length > 0) {
        showDeliveryErrors(serverErrors);
        errorBox.dataset.kind = 'fields';
      }
      throw new Error(data.message || 'Failed to place order');
    }

    if (method === 'online') {
      pendingOnline = { signature, orderId: data.order_id, total: data.total_amount, payment: data.payment };
      openRazorpay(pendingOnline, delivery);
      return;
    }

    showConfirmation({ orderId: data.order_id, total: data.total_amount, delivery, paidOnline: false });

  } catch (error) {
    showError(error.message);
    resetPlaceButton();
  }
}

function openRazorpay(pending, delivery) {
  const user = getCurrentUser() || {};
  const rzp = new Razorpay({
    key: pending.payment.key_id,
    amount: pending.payment.amount,
    currency: pending.payment.currency,
    order_id: pending.payment.order_id,
    name: 'Bite Rush',
    description: 'Food order',
    image: 'images/logo.png',
    prefill: { name: delivery.name || user.name || '', email: user.email || '', contact: delivery.phone || '' },
    theme: { color: '#E8A93B' },
    timeout: pending.payment.timeout_seconds,
    handler: (resp) => confirmOnlinePayment(pending, delivery, resp),
    modal: {
      ondismiss: () => {
        showError('Payment was not completed. Your cart is saved. Press the pay button to try again.');
        resetPlaceButton();
      }
    }
  });
  rzp.on('payment.failed', (r) => {
    const why = r && r.error && r.error.description ? r.error.description : 'Payment failed.';
    showError(`${why} You can try again.`);
  });
  document.getElementById('checkoutError').classList.add('d-none');
  rzp.open();
}

async function confirmOnlinePayment(pending, delivery, resp) {
  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  document.getElementById('placeOrderLabel').textContent = 'Confirming your payment...';
  try {
    const res = await fetch(`${API_BASE_URL}/orders/${pending.orderId}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Could not confirm the payment');
    pendingOnline = null;
    showConfirmation({
      orderId: data.order._id, total: data.order.total_amount, delivery,
      paidOnline: true, secondsLeft: data.full_refund_seconds_left
    });
  } catch (error) {
    // The payment may have gone through even though this call failed (the server also hears from Razorpay directly).
    showError(`${error.message}. If money was deducted, your order will appear in the list below within a minute, or the amount will be refunded.`);
    resetPlaceButton();
    loadOrderHistory();
  }
}

// ===== 30-SECOND FULL-REFUND WINDOW =====
let undoTimer = null;

function startUndoCountdown(orderId, secondsLeft) {
  const box = document.getElementById('undoBox');
  const active = document.getElementById('undoActive');
  const late = document.getElementById('undoLate');
  const secs = document.getElementById('undoSeconds');
  const bar = document.getElementById('undoBar');
  const btn = document.getElementById('undoCancelBtn');
  const total = Math.max(1, secondsLeft || 0);
  const endAt = Date.now() + (secondsLeft || 0) * 1000;

  clearInterval(undoTimer);
  document.getElementById('undoResult').classList.add('d-none');
  box.classList.remove('d-none');
  active.classList.remove('d-none');
  late.classList.add('d-none');
  btn.disabled = false;

  const tick = () => {
    const left = Math.max(0, (endAt - Date.now()) / 1000);
    secs.textContent = Math.ceil(left);
    bar.style.width = `${(left / total) * 100}%`;
    if (left <= 0) {
      clearInterval(undoTimer);
      active.classList.add('d-none');
      late.classList.remove('d-none');
    }
  };
  tick();
  undoTimer = setInterval(tick, 250);

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const out = await cancelOrderRequest(orderId);
      clearInterval(undoTimer);
      box.classList.add('d-none');
      const result = document.getElementById('undoResult');
      result.textContent = out.refund && out.refund.status === 'processed'
        ? `Order cancelled. ₹${out.refund.amount_rupees} (${out.refund.percent}%) is being refunded to your payment method.`
        : 'Order cancelled. Your refund is being processed.';
      result.classList.remove('d-none');
      document.getElementById('confirmStatusTracker').innerHTML = '<p class="text-danger small mb-0"><i class="bi bi-x-circle"></i> This order was cancelled.</p>';
      loadOrderHistory();
    } catch (error) {
      btn.disabled = false;
      showToast(error.message, 'error');
    }
  };
}

// Re-adds every item from a past order back into the current cart
function reorderPastOrder(orderId, orders) {
  const order = orders.find((o) => o._id === orderId);
  if (!order) return;

  order.items.forEach((oi) => {
    if (oi.combo) {
      addToCart({
        id: oi.combo._id,
        name: oi.combo.name,
        price: oi.unit_price,
        image_url: oi.combo.image_url,
        quantity: oi.quantity,
        type: 'combo'
      });
      return;
    }

    if (!oi.item) return; // menu item may have been deleted since
    addToCart({
      id: oi.item._id,
      name: oi.item.name,
      price: oi.item.price,
      image_url: oi.item.image_url,
      quantity: oi.quantity,
      spice_level: oi.spice_level || undefined
    });
  });

  showToast('Items added to your cart!', 'success');
  window.location.href = 'menu.html';
}

// Asks the server to cancel an order. The server decides the refund.
async function cancelOrderRequest(orderId) {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}/cancel`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to cancel order');
  return data;
}

// Cancels a past order (only allowed while status is still "Received")
async function cancelOrder(orderId, info = {}) {
  let question = 'Are you sure you want to cancel this order?';
  if (info.paidOnline) {
    const percent = Date.now() < info.fullRefundEndsAt ? 100 : 25;
    const amount = Math.round(info.total * percent) / 100;
    question = percent === 100
      ? `Cancel this order? The full ₹${info.total} will be refunded.`
      : `Cancel this order? Only 25% (₹${amount} of ₹${info.total}) will be refunded, because the 30-second full-refund window has passed.`;
  }
  if (!confirm(question)) return;

  try {
    const data = await cancelOrderRequest(orderId);
    const r = data.refund;
    showToast(r && r.status === 'processed'
      ? `Order cancelled. ₹${r.amount_rupees} (${r.percent}%) is being refunded.`
      : 'Order cancelled successfully', 'success');
    loadOrderHistory();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// One line about money back, for cancelled online orders.
function refundLine(order) {
  if (order.payment_method !== 'online' || order.status !== 'Cancelled') return '';
  const rupees = (order.refund_amount || 0) / 100;
  if (order.refund_status === 'done') return `<div class="mt-2 small text-success"><i class="bi bi-arrow-return-left"></i> Refunded ₹${rupees} to your payment method.</div>`;
  if (order.refund_status === 'failed') return '<div class="mt-2 small text-warning"><i class="bi bi-hourglass-split"></i> Your refund hit a problem and will be retried by the restaurant.</div>';
  return '<div class="mt-2 small text-muted"><i class="bi bi-hourglass-split"></i> Your refund is being processed.</div>';
}

// Load order history from API
let historyPage = 1;

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
    const res = await fetch(`${API_BASE_URL}/orders/my?page=${historyPage}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to load orders');
    }

    const orders = data.items;
    if (orders.length === 0 && data.page > 1) {
      historyPage = data.pages;
      return loadOrderHistory();
    }
    renderPager('historyPager', container, data, (p) => { historyPage = p; loadOrderHistory(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-receipt fs-1"></i>
          <p class="mt-2">No orders yet. <a href="menu.html">Browse the menu</a> to place your first order!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map((order, index) => `
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
            ${order.items.map((oi) => {
              const label = oi.combo ? `${oi.combo.name} (Combo)` : (oi.item ? oi.item.name : 'Item');
              return `${label}${oi.spice_level ? ` (${oi.spice_level})` : ''} x${oi.quantity}`;
            }).join(', ')}
          </div>
          ${order.delivery && order.delivery.address_line ? `
            <div class="mt-2 small text-muted">
              Delivering to ${escapeText(order.delivery.name)}, ${escapeText(formatAddress(order.delivery))}. Phone ${escapeText(order.delivery.phone)}. ${order.payment_method === 'online' ? 'Paid online (test mode).' : 'Cash on delivery.'}
            </div>
          ` : ''}
          ${refundLine(order)}
          <div class="mt-3 d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-warning btn-sm order-again-btn" data-order-id="${order._id}">
              <i class="bi bi-arrow-repeat"></i> Order Again
            </button>
            <button class="btn btn-outline-dark btn-sm track-order-btn" data-bs-toggle="collapse" data-bs-target="#tracker-${index}">
              <i class="bi bi-truck"></i> Track Order
            </button>
            ${order.status === 'Received' ? `
              <button class="btn btn-outline-danger btn-sm cancel-order-btn" data-order-id="${order._id}" data-index="${index}">
                <i class="bi bi-x-circle"></i> Cancel Order
              </button>
            ` : ''}
          </div>
          <div class="collapse mt-3" id="tracker-${index}">
            ${order.status === 'Cancelled'
              ? '<p class="text-danger small mb-0"><i class="bi bi-x-circle"></i> This order was cancelled.</p>'
              : renderStatusTracker(order.status)}
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.order-again-btn').forEach((btn) => {
      btn.addEventListener('click', () => reorderPastOrder(btn.dataset.orderId, orders));
    });

    const loadedAt = Date.now();
    document.querySelectorAll('.cancel-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const o = orders[Number(btn.dataset.index)];
        const paidOnline = o.payment_method === 'online' && o.payment_status === 'paid';
        cancelOrder(btn.dataset.orderId, {
          paidOnline,
          total: o.total_amount,
          fullRefundEndsAt: loadedAt + (o.full_refund_seconds_left || 0) * 1000
        });
      });
    });

  } catch (error) {
    container.innerHTML = `<p class="text-center text-danger py-4">${error.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCheckoutPanel();
  loadOrderHistory();

  Object.values(DELIVERY_FIELDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        setFieldError(id, '');
        // Once nothing is highlighted any more, the "please fix" message has done its job.
        const errorBox = document.getElementById('checkoutError');
        if (errorBox.dataset.kind === 'fields' && !document.querySelector('#deliveryForm .is-invalid')) {
          errorBox.classList.add('d-none');
          delete errorBox.dataset.kind;
        }
      });
    }
  });

  document.querySelectorAll('input[name="payMethod"]').forEach((r) => r.addEventListener('change', updatePayUi));
  updatePayUi();

  const placeOrderBtn = document.getElementById('placeOrderBtn');
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', placeOrder);
  }
});
