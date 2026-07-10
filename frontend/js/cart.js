// ===== CART MODULE =====
// Cart is stored in localStorage as an array: [{ id, name, price, image_url, quantity }]

function getCart() {
  const cart = localStorage.getItem('biteRushCart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('biteRushCart', JSON.stringify(cart));
  renderCart();
  updateCartCount();
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((c) => c.id === item.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      quantity: 1
    });
  }

  saveCart(cart);
}

function removeFromCart(itemId) {
  let cart = getCart();
  cart = cart.filter((c) => c.id !== itemId);
  saveCart(cart);
}

function updateQuantity(itemId, change) {
  const cart = getCart();
  const item = cart.find((c) => c.id === itemId);

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(itemId);
    return;
  }

  saveCart(cart);
}

function getCartTotal() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getCartItemCount() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function clearCart() {
  localStorage.removeItem('biteRushCart');
  renderCart();
  updateCartCount();
}

// Updates the little badge numbers in the navbar and floating button
function updateCartCount() {
  const count = getCartItemCount();
  const cartCountEl = document.getElementById('cartCount');
  const floatingCountEl = document.getElementById('floatingCartCount');

  if (cartCountEl) cartCountEl.textContent = count;
  if (floatingCountEl) floatingCountEl.textContent = count;
}

// Renders the cart sidebar contents (only runs on pages that have the cart offcanvas)
function renderCart() {
  const cartItemsList = document.getElementById('cartItemsList');
  const cartTotalEl = document.getElementById('cartTotal');

  if (!cartItemsList) return; // not on a page with the cart UI

  const cart = getCart();

  if (cart.length === 0) {
    cartItemsList.innerHTML = '<p class="text-muted text-center mt-4">Your cart is empty. Add some delicious items!</p>';
    cartTotalEl.textContent = '₹0';
    return;
  }

  cartItemsList.innerHTML = cart.map((item) => `
    <div class="cart-item-row d-flex align-items-center">
      <img src="${item.image_url || 'https://via.placeholder.com/60'}" alt="${item.name}" width="50" height="50" class="rounded me-2" style="object-fit:cover;">
      <div class="flex-grow-1">
        <div class="fw-semibold small">${item.name}</div>
        <div class="text-muted small">₹${item.price} x ${item.quantity}</div>
      </div>
      <div class="d-flex align-items-center gap-1">
        <button class="btn btn-outline-secondary btn-sm qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
        <span class="mx-1">${item.quantity}</span>
        <button class="btn btn-outline-secondary btn-sm qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
        <button class="btn btn-outline-danger btn-sm ms-2" onclick="removeFromCart('${item.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join('');

  cartTotalEl.textContent = `₹${getCartTotal()}`;
}

// Run on every page load
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  updateCartCount();
});