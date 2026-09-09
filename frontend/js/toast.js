// ===== TOAST NOTIFICATIONS =====
// Reusable replacement for alert() — non-blocking, auto-dismisses.
// Usage: showToast('Item added to cart!', 'success')
//        showToast('Something went wrong', 'error')

function ensureToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info') {
  const colors = {
    success: { bg: '#1F7A3D', icon: 'bi-check-circle-fill' },
    error:   { bg: '#B3261E', icon: 'bi-x-circle-fill' },
    info:    { bg: '#14110F', icon: 'bi-info-circle-fill' }
  };
  const style = colors[type] || colors.info;

  const container = ensureToastContainer();

  const toast = document.createElement('div');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    background: ${style.bg};
    color: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.2);
    font-size: 0.9rem;
    font-weight: 500;
    min-width: 240px;
    max-width: 360px;
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `;
  toast.innerHTML = `<i class="bi ${style.icon}"></i><span>${message}</span>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}
