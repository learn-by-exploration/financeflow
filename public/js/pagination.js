// PersonalFi — Reusable Pagination Component

/**
 * Render pagination controls into a container.
 * @param {HTMLElement} container — target element (will be cleared)
 * @param {Object} opts
 * @param {number} opts.currentPage — 1-based current page
 * @param {number} opts.totalPages
 * @param {function(number):void} opts.onPageChange — called with new 1-based page
 */
export function renderPagination(container, { currentPage, totalPages, onPageChange }) {
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const nav = document.createElement('nav');
  nav.className = 'pagination-controls';
  nav.setAttribute('aria-label', 'Pagination');

  const mkBtn = (text, page, opts = {}) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (opts.active ? ' active' : '') + (opts.disabled ? ' disabled' : '');
    btn.textContent = text;
    btn.disabled = !!opts.disabled;
    if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);
    if (opts.active) btn.setAttribute('aria-current', 'page');
    if (!opts.disabled) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  };

  // First & Prev
  nav.appendChild(mkBtn('« First', 1, { disabled: currentPage === 1, ariaLabel: 'First page' }));
  nav.appendChild(mkBtn('‹ Prev', currentPage - 1, { disabled: currentPage === 1, ariaLabel: 'Previous page' }));

  // Page numbers with ellipsis
  const pages = getPageNumbers(currentPage, totalPages);
  for (const p of pages) {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '…';
      nav.appendChild(span);
    } else {
      nav.appendChild(mkBtn(String(p), p, { active: p === currentPage }));
    }
  }

  // Next & Last
  nav.appendChild(mkBtn('Next ›', currentPage + 1, { disabled: currentPage === totalPages, ariaLabel: 'Next page' }));
  nav.appendChild(mkBtn('Last »', totalPages, { disabled: currentPage === totalPages, ariaLabel: 'Last page' }));

  // Page X of Y text
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} of ${totalPages}`;

  container.appendChild(nav);
  container.appendChild(info);
}

/**
 * Build an array of page numbers with '...' for ellipsis.
 * Always shows first, last, and up to 2 pages around current.
 */
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  const add = (n) => { if (!pages.includes(n)) pages.push(n); };

  add(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) add(i);
  if (current < total - 2) pages.push('...');
  add(total);

  return pages;
}
