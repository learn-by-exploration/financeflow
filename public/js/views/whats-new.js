import { Api, el } from '../utils.js';

export async function renderWhatsNew(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>What's New</h2>
    </div>
    <div id="whats-new-list" class="whats-new-list">
      <p class="text-muted">Loading changelog...</p>
    </div>
  `;

  try {
    const data = await Api.get('/whats-new');
    const list = document.getElementById('whats-new-list');

    if (!data.entries || data.entries.length === 0) {
      list.innerHTML = '<p class="text-muted">No release notes available.</p>';
      return;
    }

    list.innerHTML = '';
    data.entries.forEach(entry => {
      const entryDiv = el('div', { className: 'whats-new-entry card' });
      const header = el('div', { className: 'whats-new-header' }, [
        el('span', { className: 'whats-new-version', textContent: `v${entry.version}` }),
        el('span', { className: 'whats-new-date text-muted', textContent: entry.date }),
      ]);
      const ul = el('ul', { className: 'whats-new-changes' });
      (entry.changes || []).forEach(c => ul.appendChild(el('li', { textContent: c })));
      entryDiv.appendChild(header);
      entryDiv.appendChild(ul);
      list.appendChild(entryDiv);
    });
  } catch (err) {
    const list = document.getElementById('whats-new-list');
    list.innerHTML = `<p class="text-muted">Failed to load changelog.</p>`;
  }
}
