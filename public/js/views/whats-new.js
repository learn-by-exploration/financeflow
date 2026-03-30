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

    list.innerHTML = data.entries.map(entry => `
      <div class="whats-new-entry card">
        <div class="whats-new-header">
          <span class="whats-new-version">v${entry.version}</span>
          <span class="whats-new-date text-muted">${entry.date}</span>
        </div>
        <ul class="whats-new-changes">
          ${entry.changes.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  } catch (err) {
    const list = document.getElementById('whats-new-list');
    list.innerHTML = `<p class="text-muted">Failed to load changelog.</p>`;
  }
}
