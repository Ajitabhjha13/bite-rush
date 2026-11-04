// Forgot password and reset password pages.

function showBox(el, text) {
  el.textContent = text;
  el.classList.remove('d-none');
}

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok) {
    const first = Array.isArray(data.errors) && data.errors[0] && (data.errors[0].msg || data.errors[0].message);
    throw new Error(data.message && data.message !== 'Validation failed' ? data.message : (first || data.message || 'Something went wrong. Please try again.'));
  }
  return data;
}

function setupForgotForm() {
  const form = document.getElementById('forgotForm');
  if (!form) return;
  const emailInput = document.getElementById('forgotEmail');
  const errorBox = document.getElementById('forgotError');
  const doneBox = document.getElementById('forgotDone');
  const btn = document.getElementById('forgotBtn');
  attachLiveValidation(emailInput, validateEmailField);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateEmailField(emailInput)) return;
    errorBox.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const data = await postJson('/auth/forgot-password', { email: emailInput.value.trim() });
      form.classList.add('d-none');
      showBox(doneBox, data.message + ' Check your spam folder too.');
      doneBox.focus();
    } catch (err) {
      showBox(errorBox, err.message);
      btn.disabled = false;
      btn.textContent = 'Send reset link';
    }
  });
}

function setupResetForm() {
  const form = document.getElementById('resetForm');
  if (!form) return;
  const passInput = document.getElementById('resetPassword');
  const confirmInput = document.getElementById('resetConfirm');
  const errorBox = document.getElementById('resetError');
  const doneBox = document.getElementById('resetDone');
  const btn = document.getElementById('resetBtn');

  // Read the token, then remove it from the address bar so it is not left in history or screenshots.
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (window.location.search) history.replaceState(null, '', window.location.pathname);

  if (!/^[a-f0-9]{64}$/.test(token)) {
    form.classList.add('d-none');
    showBox(errorBox, 'This reset link is not valid. Please ask for a new one.');
    document.getElementById('resetLinks').innerHTML =
      '<a href="forgot-password.html" class="text-decoration-none fw-semibold" style="color:var(--color-gold-dark);">Get a new reset link</a>';
    return;
  }

  const checkConfirm = (input) => {
    if (!input.value) { setFieldError(input, 'Please confirm your password.'); return false; }
    if (input.value !== passInput.value) { setFieldError(input, 'The two passwords do not match.'); return false; }
    setFieldValid(input);
    return true;
  };
  attachLiveValidation(passInput, (i) => validatePasswordField(i, 8));
  attachLiveValidation(confirmInput, checkConfirm);
  attachPasswordToggle(passInput);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const okPass = validatePasswordField(passInput, 8);
    const okConfirm = checkConfirm(confirmInput);
    if (!okPass || !okConfirm) return;
    errorBox.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const data = await postJson('/auth/reset-password', { token, password: passInput.value });
      form.classList.add('d-none');
      showBox(doneBox, data.message);
      document.getElementById('resetLinks').innerHTML =
        '<a href="login.html" class="btn btn-warning fw-semibold px-4">Go to login</a>';
      doneBox.focus();
    } catch (err) {
      showBox(errorBox, err.message);
      document.getElementById('resetLinks').innerHTML =
        '<a href="forgot-password.html" class="text-decoration-none fw-semibold" style="color:var(--color-gold-dark);">Ask for a new link</a>';
      btn.disabled = false;
      btn.textContent = 'Change password';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupForgotForm();
  setupResetForm();
});
