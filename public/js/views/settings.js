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
  ]);
  container.appendChild(dataCard);

  // App info
  const infoCard = el('div', { className: 'card settings-section' }, [
    el('h3', { textContent: 'About' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Version' }),
      el('span', { className: 'settings-value', textContent: '0.1.4' }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'License' }),
      el('span', { className: 'settings-value', textContent: 'MIT' }),
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
