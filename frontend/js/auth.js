// ===== AUTH MODULE =====
// Handles login, register, logout, and navbar state across all pages

function saveSession(token, user) {
  localStorage.setItem('biteRushToken', token);
  localStorage.setItem('biteRushUser', JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem('biteRushToken');
}

function getCurrentUser() {
  const user = localStorage.getItem('biteRushUser');
  return user ? JSON.parse(user) : null;
}

function isLoggedIn() {
  return !!getToken();
}

function logout() {
  localStorage.removeItem('biteRushToken');
  localStorage.removeItem('biteRushUser');
  window.location.href = 'index.html';
}

function updateAuthNav() {
  const authNavItem = document.getElementById('authNavItem');
  if (!authNavItem) return;

  const user = getCurrentUser();

  if (user) {
    authNavItem.innerHTML = `
      <div class="dropdown">
        <button class="btn btn-outline-warning fw-semibold dropdown-toggle" type="button" data-bs-toggle="dropdown">
          <i class="bi bi-person-circle"></i> ${user.name.split(' ')[0]}
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          ${user.role === 'admin' ? '<li><a class="dropdown-item" href="admin.html"><i class="bi bi-speedometer2"></i> Admin Dashboard</a></li>' : ''}
          <li><a class="dropdown-item" href="order.html"><i class="bi bi-receipt"></i> My Orders</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
        </ul>
      </div>
    `;

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  } else {
    authNavItem.innerHTML = `<a class="btn btn-warning fw-semibold ms-lg-2" href="login.html">Login</a>`;
  }
}

function setupLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorBox = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    errorBox.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      saveSession(data.token, data.user);
      window.location.href = 'menu.html';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('d-none');
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });
}

function setupRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const errorBox = document.getElementById('registerError');
    const btn = document.getElementById('registerBtn');

    errorBox.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      saveSession(data.token, data.user);
      window.location.href = 'menu.html';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('d-none');
      btn.disabled = false;
      btn.textContent = 'Register';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateAuthNav();
  setupLoginForm();
  setupRegisterForm();
});