// PersonalFi — Export View
import { Api, el, fmt, toast } from '../utils.js';

export async function renderExport(container) {
  container.innerHTML = '';
  const header = el('div', { className: 'view-header' }, [el('h2', { textContent: 'Export Data' })]);
  container.appendChild(header);

  const card = el('div', { className: 'card' }, [
    el('h3', { textContent: 'Export Transactions' }),
    el('p', { textContent: 'Download your transaction data as CSV or JSON.' }),
  ]);

  const form = el('form', { className: 'form-grid' });
  form.innerHTML = `
    <div class="form-group">
      <label for="export-format">Format</label>
      <select id="export-format" class="form-input">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </div>
    <div class="form-group">
      <label for="export-start">Start Date (optional)</label>
      <input type="date" id="export-start" class="form-input" />
    </div>
    <div class="form-group">
      <label for="export-end">End Date (optional)</label>
      <input type="date" id="export-end" class="form-input" />
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">
        <span class="material-icons-round">download</span> Download
      </button>
    </div>
  `;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const format = document.getElementById('export-format').value;
    const start = document.getElementById('export-start').value;
    const end = document.getElementById('export-end').value;

    let url = `/api/export/transactions?format=${format}`;
    if (start) url += `&start_date=${start}`;
    if (end) url += `&end_date=${end}`;

    try {
      const token = localStorage.getItem('pfi_token');
      const resp = await fetch(url, { headers: { 'X-Session-Token': token } });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `transactions.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Export downloaded!', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  });

  card.appendChild(form);
  container.appendChild(card);
}
