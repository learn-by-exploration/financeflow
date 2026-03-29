// PersonalFi — Settings View
import { Api, el, toast } from '../utils.js';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD', 'AED'];
const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'];

export async function renderSettings(container) {
  container.innerHTML = '';
  const { settings } = await Api.get('/settings');
  const user = JSON.parse(localStorage.getItem('pfi_user') || '{}');

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Settings' }),
  ]);
  container.appendChild(header);

  // User info card
  const userCard = el('div', { className: 'card settings-section' }, [
    el('h3', { textContent: 'Account' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Username' }),
      el('span', { className: 'settings-value', textContent: user.username || '—' }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Display Name' }),
      el('span', { className: 'settings-value', textContent: user.display_name || '—' }),
    ]),
  ]);
  container.appendChild(userCard);

  // Preferences card
  const prefsCard = el('div', { className: 'card settings-section' }, [
    el('h3', { textContent: 'Preferences' }),
    settingRow('Default Currency', 'default_currency', settings.default_currency, CURRENCIES),
    settingRow('Date Format', 'date_format', settings.date_format, DATE_FORMATS),
  ]);
  container.appendChild(prefsCard);

  // Data card
  const dataCard = el('div', { className: 'card settings-section' }, [
    el('h3', { textContent: 'Data' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Export Data' }),
      el('button', { className: 'btn btn-secondary', textContent: 'Export JSON', onClick: exportData }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Import Data' }),
      el('button', { className: 'btn btn-secondary', textContent: 'Import JSON', onClick: () => showImportForm() }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'CSV Template' }),
      el('button', { className: 'btn btn-secondary', textContent: 'Download', onClick: downloadCsvTemplate }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Import CSV' }),
      el('button', { className: 'btn btn-secondary', textContent: 'Upload CSV', onClick: () => showCsvImportForm() }),
    ]),
  ]);
  container.appendChild(dataCard);

  // App info
  const infoCard = el('div', { className: 'card settings-section' }, [
    el('h3', { textContent: 'About' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Version' }),
      el('span', { className: 'settings-value', textContent: '0.1.7' }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'License' }),
      el('span', { className: 'settings-value', textContent: 'MIT' }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'PWA' }),
      el('span', { className: 'settings-value', textContent: 'serviceWorker' in navigator ? 'Installed' : 'Not supported' }),
    ]),
  ]);
  container.appendChild(infoCard);
}

function settingRow(label, key, currentValue, options) {
  const select = el('select', { className: 'settings-select' });
  options.forEach(o => {
    const opt = el('option', { value: o, textContent: o });
    if (currentValue === o) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', async () => {
    try {
      await Api.put('/settings', { key, value: select.value });
      toast(`${label} updated`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  return el('div', { className: 'settings-row' }, [
    el('span', { className: 'settings-label', textContent: label }),
    select,
  ]);
}

async function exportData() {
  try {
    const data = await Api.get('/data/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personalfi-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showImportForm() {
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const file = e.target.querySelector('input[type="file"]').files[0];
    const password = e.target.password.value;
    if (!file || !password) { toast('File and password required', 'error'); return; }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await Api.post('/data/import', { password, data });
      toast('Data imported successfully', 'success');
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Import JSON Data' }),
    el('p', { className: 'form-hint', textContent: 'Warning: This replaces all your existing data.' }),
    formGroup('JSON File', el('input', { type: 'file', accept: '.json' })),
    formGroup('Confirm Password', el('input', { type: 'password', name: 'password', required: 'true', placeholder: 'Enter your password to confirm' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-danger', textContent: 'Import & Replace' }),
    ]),
  ]);
  openModal(form);
}

async function downloadCsvTemplate() {
  try {
    const res = await fetch('/api/data/csv-template', {
      headers: { 'X-Session-Token': localStorage.getItem('pfi_token') },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personalfi-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Template downloaded', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function showCsvImportForm() {
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    const file = e.target.querySelector('input[type="file"]').files[0];
    if (!file) { toast('Select a CSV file', 'error'); return; }
    try {
      const text = await file.text();
      const res = await fetch('/api/data/csv-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
          'X-Session-Token': localStorage.getItem('pfi_token'),
        },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Import failed');
      toast(`Imported ${data.imported || 0} transactions`, 'success');
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  }}, [
    el('h3', { className: 'modal-title', textContent: 'Import CSV' }),
    el('p', { className: 'form-hint', textContent: 'Upload a CSV file following the template format.' }),
    formGroup('CSV File', el('input', { type: 'file', accept: '.csv' })),
    el('div', { className: 'form-actions' }, [
      el('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Cancel', onClick: closeModal }),
      el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Import' }),
    ]),
  ]);
  openModal(form);
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [el('label', { textContent: label }), input]);
}
