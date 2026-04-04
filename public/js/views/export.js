// PersonalFi — Export View
import { Api, el, fmt, toast } from '../utils.js';

export async function renderExport(container) {
  container.innerHTML = '';
  const header = el('div', { className: 'view-header' }, [el('h2', {}, [
    el('span', { className: 'material-icons-round entity-icon export', textContent: 'file_download' }),
    el('span', { textContent: 'Export Data' }),
  ])]);
  container.appendChild(header);

  const card = el('div', { className: 'card' }, [
    el('h3', { textContent: 'Export Transactions' }),
    el('p', { textContent: 'Download your transaction data as CSV or JSON.' }),
  ]);

  const form = el('form', { className: 'form-grid' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'export-format', textContent: 'Format' }),
      (() => {
        const select = el('select', { id: 'export-format', className: 'form-input' });
        select.appendChild(el('option', { value: 'csv', textContent: 'CSV' }));
        select.appendChild(el('option', { value: 'json', textContent: 'JSON' }));
        return select;
      })(),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { for: 'export-start', textContent: 'Start Date (optional)' }),
      el('input', { type: 'date', id: 'export-start', className: 'form-input' }),
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { for: 'export-end', textContent: 'End Date (optional)' }),
      el('input', { type: 'date', id: 'export-end', className: 'form-input' }),
    ]),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'submit', className: 'btn btn-primary' }, [
        el('span', { className: 'material-icons-round', textContent: 'download' }),
        document.createTextNode(' Download'),
      ]),
    ]),
  ]);

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
