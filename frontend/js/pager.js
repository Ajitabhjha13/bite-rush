// Small shared pager: "Previous | Page 2 of 5 | Next".
// renderPager(id, afterEl, { page, pages, total }, goToPage)
function renderPager(id, afterEl, info, goToPage) {
  let box = document.getElementById(id);
  if (!box) {
    box = document.createElement('div');
    box.id = id;
    afterEl.insertAdjacentElement('afterend', box);
  }
  if (!info || info.pages <= 1) {
    box.innerHTML = '';
    return;
  }
  box.className = 'd-flex justify-content-center align-items-center gap-3 my-3';
  box.innerHTML = `
    <button class="btn btn-sm btn-outline-dark" data-pg="prev" ${info.page <= 1 ? 'disabled' : ''}>
      <i class="bi bi-chevron-left"></i> Previous
    </button>
    <span class="small text-muted">Page ${info.page} of ${info.pages} &middot; ${info.total} total</span>
    <button class="btn btn-sm btn-outline-dark" data-pg="next" ${info.page >= info.pages ? 'disabled' : ''}>
      Next <i class="bi bi-chevron-right"></i>
    </button>`;
  box.querySelector('[data-pg="prev"]').addEventListener('click', () => goToPage(info.page - 1));
  box.querySelector('[data-pg="next"]').addEventListener('click', () => goToPage(info.page + 1));
}
