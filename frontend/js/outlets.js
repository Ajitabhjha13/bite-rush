// ===== OUTLETS PAGE =====
// Pulls the REAL categories from the API and themes each one as a
// "Bite Rush" outlet using the shared OUTLET_INFO data (js/outlet-data.js).

async function loadOutlets() {
  const grid = document.getElementById('outletGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${API_BASE_URL}/categories`);
    const categories = await res.json();

    if (categories.length === 0) {
      grid.innerHTML = '<p class="text-muted text-center py-4">No outlets available yet.</p>';
      return;
    }

    grid.innerHTML = categories.map((cat) => {
      const info = getOutletInfo(cat.name) || {
        outletName: `Bite Rush ${cat.name}`,
        tagline: `Explore our ${cat.name} selection.`,
        icon: 'bi-grid-fill',
        deliveryTime: '20-30 min',
        image: 'https://placehold.co/400x220/f1f1f1/999999?text=' + encodeURIComponent(cat.name)
      };

      return `
        <div class="col-sm-6 col-lg-3">
          <a href="menu.html?category=${cat._id}" class="text-decoration-none">
            <div class="card menu-card outlet-card h-100">
              <img src="${info.image}" alt="${info.outletName}" onerror="this.onerror=null; this.src='https://placehold.co/400x220/f1f1f1/999999?text=No+Image';">
              <span class="delivery-time-badge"><i class="bi bi-clock"></i> ${info.deliveryTime}</span>
              <div class="card-body d-flex flex-column">
                <div class="icon-circle-lg mb-3"><i class="bi ${info.icon}"></i></div>
                <h5 class="card-title fw-semibold text-dark">${info.outletName}</h5>
                <p class="text-muted small mb-3 flex-grow-1">${info.tagline}</p>
                <span class="btn btn-warning btn-sm fw-semibold w-100 mt-auto">View Menu <i class="bi bi-arrow-right-circle ms-1"></i></span>
              </div>
            </div>
          </a>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load outlets:', error);
    grid.innerHTML = '<p class="text-center text-danger py-4">Could not load outlets. Please check if the backend server is running.</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadOutlets);
