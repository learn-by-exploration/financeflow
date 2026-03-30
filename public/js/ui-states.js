// PersonalFi — Reusable UI state components (Loading, Empty, Error)
import { el } from './utils.js';

/**
 * Show a loading skeleton/spinner in the given container.
 * Appends a .ui-loading element. Call hideStates() to remove.
 */
export function showLoading(container) {
  hideStates(container);
  const skeleton = el('div', { className: 'ui-loading' }, [
    el('div', { className: 'ui-spinner' }),
    el('div', { className: 'skeleton-rows' }, [
      el('div', { className: 'skeleton-line skeleton-line-lg' }),
      el('div', { className: 'skeleton-line skeleton-line-md' }),
      el('div', { className: 'skeleton-line skeleton-line-sm' }),
      el('div', { className: 'skeleton-line skeleton-line-md' }),
    ]),
  ]);
  container.appendChild(skeleton);
}

/**
 * Show a loading skeleton grid (for dashboard stats/charts).
 */
export function showLoadingSkeleton(container) {
  hideStates(container);
  const skeleton = el('div', { className: 'ui-loading' }, [
    el('div', { className: 'skeleton-grid' }, [
      el('div', { className: 'skeleton-card' }),
      el('div', { className: 'skeleton-card' }),
      el('div', { className: 'skeleton-card' }),
      el('div', { className: 'skeleton-card' }),
    ]),
    el('div', { className: 'skeleton-rows' }, [
      el('div', { className: 'skeleton-line skeleton-line-lg' }),
      el('div', { className: 'skeleton-line skeleton-line-md' }),
      el('div', { className: 'skeleton-line skeleton-line-sm' }),
    ]),
  ]);
  container.appendChild(skeleton);
}

/**
 * Show an empty state in the container.
 * @param {HTMLElement} container
 * @param {{ icon?: string, title?: string, message?: string, actionText?: string, actionHandler?: Function }} opts
 */
export function showEmpty(container, { icon = '📭', title = 'Nothing here yet', message = '', actionText = '', actionHandler = null } = {}) {
  hideStates(container);
  const children = [
    el('span', { className: 'ui-empty-icon', textContent: icon }),
    el('h3', { className: 'ui-empty-title', textContent: title }),
  ];
  if (message) {
    children.push(el('p', { className: 'ui-empty-message', textContent: message }));
  }
  if (actionText && actionHandler) {
    children.push(el('button', { className: 'btn btn-primary ui-empty-action', textContent: actionText, onClick: actionHandler }));
  }
  const emptyDiv = el('div', { className: 'ui-empty' }, children);
  container.appendChild(emptyDiv);
}

/**
 * Show an error state with retry button.
 * @param {HTMLElement} container
 * @param {{ message?: string, retryHandler?: Function }} opts
 */
export function showError(container, { message = 'Something went wrong. Please try again.', retryHandler = null } = {}) {
  hideStates(container);
  const children = [
    el('span', { className: 'material-icons-round ui-error-icon', textContent: 'error_outline' }),
    el('p', { className: 'ui-error-message', textContent: message }),
  ];
  if (retryHandler) {
    children.push(el('button', { className: 'btn btn-secondary ui-error-retry', textContent: 'Retry', onClick: retryHandler }));
  }
  const errorDiv = el('div', { className: 'ui-error' }, children);
  container.appendChild(errorDiv);
}

/**
 * Remove any ui-state overlays from the container.
 */
export function hideStates(container) {
  container.querySelectorAll('.ui-loading, .ui-empty, .ui-error').forEach(el => el.remove());
}
