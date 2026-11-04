// ===== HERO ROTATING WORD =====
// Cycles the highlighted word in the homepage headline (e.g. "Craving fresh Biryani?")

// Matches if ANY word in the dish name starts with the query - so "Biryani"
// correctly finds "Veg Biryani" (kept in sync with the same helper in menu.js).
function matchesSearchQuery(name, query) {
  const words = name.toLowerCase().split(/\s+/);
  return words.some((word) => word.startsWith(query));
}

const heroWords = ['Biryani', 'Pizza', 'Burgers', 'Momos', 'Desserts'];
let heroWordIndex = 0;

function cycleHeroWord() {
  const el = document.getElementById('rotateWord');
  if (!el) return;

  el.classList.add('swap');

  setTimeout(() => {
    heroWordIndex = (heroWordIndex + 1) % heroWords.length;
    el.textContent = heroWords[heroWordIndex];
    el.classList.remove('swap');
  }, 250);
}

// Background video: only for wide screens, not when the visitor asks for less motion or Data Saver is on.
function startHeroVideo() {
  const video = document.getElementById('heroVideo');
  if (!video) return;
  const wide = window.matchMedia('(min-width: 768px)').matches;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saver = navigator.connection && navigator.connection.saveData;
  if (!wide || calm || saver) return; // the poster image stays
  video.src = video.dataset.src;
  const p = video.play();
  if (p && p.catch) p.catch(() => {}); // autoplay blocked: the poster stays
}

document.addEventListener('DOMContentLoaded', () => {
  startHeroVideo();
  if (document.getElementById('rotateWord')) {
    setInterval(cycleHeroWord, 2200);
  }

  // "Order Now" reflects real intent to order - get the user logged in upfront
  // instead of letting them build a cart and only discover the login requirement at checkout.
  const orderNowBtn = document.getElementById('orderNowBtn');
  if (orderNowBtn) {
    orderNowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        window.location.href = 'menu.html';
      } else {
        window.location.href = 'login.html';
      }
    });
  }

  // Homepage search - deep-links into the menu page with the search query applied
  const heroSearchForm = document.getElementById('heroSearchForm');
  const heroSearchInput = document.getElementById('heroSearchInput');
  const suggestionsBox = document.getElementById('heroSearchSuggestions');

  if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      goToMenuSearch(heroSearchInput.value.trim());
    });
  }

  if (heroSearchInput && suggestionsBox) {
    heroSearchInput.addEventListener('input', () => {
      renderHeroSearchSuggestions(heroSearchInput.value.trim());
    });

    document.addEventListener('click', (e) => {
      if (!heroSearchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add('d-none');
      }
    });

    heroSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') suggestionsBox.classList.add('d-none');
    });
  }
});

// Browsers restore old form values when navigating back via the back/forward button
// (bfcache), and that restore doesn't re-fire DOMContentLoaded. 'pageshow' fires in
// both cases, so we use it to always reset the search box to its empty placeholder state.
window.addEventListener('pageshow', () => {
  const heroSearchInput = document.getElementById('heroSearchInput');
  if (heroSearchInput) heroSearchInput.value = '';

  const suggestionsBox = document.getElementById('heroSearchSuggestions');
  if (suggestionsBox) suggestionsBox.classList.add('d-none');
});

function goToMenuSearch(query) {
  window.location.href = query
    ? `menu.html?search=${encodeURIComponent(query)}`
    : 'menu.html';
}

// Shows up to 4 live dish-name matches (from real menu data) as the user types.
function renderHeroSearchSuggestions(query) {
  const suggestionsBox = document.getElementById('heroSearchSuggestions');
  if (!suggestionsBox) return;

  const q = query.toLowerCase();

  if (q === '' || typeof allMenuItemsForSearch === 'undefined' || allMenuItemsForSearch.length === 0) {
    suggestionsBox.classList.add('d-none');
    return;
  }

  const matches = allMenuItemsForSearch
    .filter((item) => matchesSearchQuery(item.name, q))
    .slice(0, 4);

  if (matches.length === 0) {
    suggestionsBox.innerHTML = `<div class="hero-search-suggestion-item text-muted">No dishes found for "${escapeHtml(query)}"</div>`;
    suggestionsBox.classList.remove('d-none');
    return;
  }

  suggestionsBox.innerHTML = matches.map((item) => `
    <div class="hero-search-suggestion-item" data-name="${escapeHtml(item.name)}">
      <i class="bi bi-search"></i> ${escapeHtml(item.name)}
      <span class="suggestion-price">₹${item.price}</span>
    </div>
  `).join('');

  suggestionsBox.classList.remove('d-none');

  suggestionsBox.querySelectorAll('.hero-search-suggestion-item[data-name]').forEach((el) => {
    el.addEventListener('click', () => {
      goToMenuSearch(el.dataset.name);
    });
  });
}
