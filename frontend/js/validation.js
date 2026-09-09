// ===== FORM VALIDATION HELPERS =====
// Real-time field validation using Bootstrap's is-invalid / invalid-feedback pattern

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setFieldError(input, message) {
  input.classList.add('is-invalid');
  input.classList.remove('is-valid');
  const wrapper = input.closest('.mb-3') || input.parentElement;
  const feedback = wrapper.querySelector('.invalid-feedback');
  if (feedback) {
    feedback.textContent = message;
    feedback.style.display = 'block';
  }
}

function setFieldValid(input) {
  input.classList.remove('is-invalid');
  input.classList.add('is-valid');
  const wrapper = input.closest('.mb-3') || input.parentElement;
  const feedback = wrapper.querySelector('.invalid-feedback');
  if (feedback) feedback.style.display = 'none';
}

function validateEmailField(input) {
  const value = input.value.trim();
  if (!value) {
    setFieldError(input, 'Email is required.');
    return false;
  }
  if (!EMAIL_PATTERN.test(value)) {
    setFieldError(input, 'Enter a valid email address.');
    return false;
  }
  setFieldValid(input);
  return true;
}

function validatePasswordField(input, minLength = 6) {
  const value = input.value;
  if (!value) {
    setFieldError(input, 'Password is required.');
    return false;
  }
  if (value.length < minLength) {
    setFieldError(input, `Password must be at least ${minLength} characters.`);
    return false;
  }
  setFieldValid(input);
  return true;
}

function validateNameField(input) {
  const value = input.value.trim();
  if (!value) {
    setFieldError(input, 'Name is required.');
    return false;
  }
  if (value.length < 2) {
    setFieldError(input, 'Name must be at least 2 characters.');
    return false;
  }
  setFieldValid(input);
  return true;
}

function attachLiveValidation(input, validatorFn) {
  let touched = false;

  input.addEventListener('blur', () => {
    touched = true;
    validatorFn(input);
  });

  input.addEventListener('input', () => {
    if (touched) validatorFn(input);
  });
}

function attachPasswordToggle(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'password-field-wrapper position-relative';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-sm position-absolute top-50 end-0 translate-middle-y me-2 p-0 border-0 bg-transparent text-muted';
  toggleBtn.innerHTML = '<i class="bi bi-eye"></i>';
  toggleBtn.setAttribute('aria-label', 'Show password');
  wrapper.appendChild(toggleBtn);

  input.style.paddingRight = '2.5rem';

  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.innerHTML = isHidden ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
}
