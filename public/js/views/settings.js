// PersonalFi — Settings View
import { Api, el, toast, openModal, closeModal } from '../utils.js';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD', 'AED'];
const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'];

export async function renderSettings(container) {
  container.innerHTML = '';
  const { settings } = await Api.get('/settings');
  const user = JSON.parse(localStorage.getItem('pfi_user') || sessionStorage.getItem('pfi_user') || '{}');

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Settings' }),
  ]);
  container.appendChild(header);

  const grid = el('div', { className: 'settings-grid' });
  container.appendChild(grid);

  // Theme card (P16)
  const themes = [
    { id: 'dark', label: 'Midnight', bg: '#0f172a', surface: '#1e293b', accent: '#6366f1', text: '#f1f5f9' },
    { id: 'light', label: 'Light', bg: '#f8fafc', surface: '#ffffff', accent: '#4f46e5', text: '#0f172a' },
    { id: 'forest', label: 'Forest', bg: '#1a2f1a', surface: '#243524', accent: '#4caf50', text: '#e8f5e9' },
    { id: 'ocean', label: 'Ocean', bg: '#0d1b2a', surface: '#1b2838', accent: '#0097a7', text: '#e0f2f1' },
    { id: 'rose', label: 'Rosé', bg: '#2a1520', surface: '#3d1f30', accent: '#e91e63', text: '#fce4ec' },
    { id: 'nord', label: 'Nord', bg: '#2e3440', surface: '#3b4252', accent: '#88c0d0', text: '#eceff4' },
  ];
  const currentTheme = localStorage.getItem('pfi_theme') || 'dark';
  const themeSwatches = themes.map(t => {
    const swatch = el('button', {
      className: `color-swatch${currentTheme === t.id ? ' selected' : ''}`,
      title: t.label,
      'aria-label': `${t.label} theme`,
      onClick: () => {
        document.documentElement.setAttribute('data-theme', t.id);
        localStorage.setItem('pfi_theme', t.id);
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        toast(`Theme set to ${t.label}`, 'success');
      },
    }, [
      el('div', { className: 'swatch-preview', style: `background:${t.bg}` }, [
        el('div', { className: 'swatch-preview-bar', style: `background:${t.accent}` }),
      ]),
      el('div', { className: 'swatch-label', style: `background:${t.surface};color:${t.text}` }, [
        document.createTextNode(t.label),
      ]),
    ]);
    return swatch;
  });
  const themeCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'palette' }),
      document.createTextNode('Theme'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Choose a color scheme that suits your preference.' }),
    el('div', { className: 'color-picker' }, themeSwatches),
  ]);
  grid.appendChild(themeCard);

  // User info card
  const userCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'person' }),
      document.createTextNode('Account'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Your account information.' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Username' }),
      el('span', { className: 'settings-value', textContent: user.username || '—' }),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Display Name' }),
      el('span', { className: 'settings-value', textContent: user.display_name || '—' }),
    ]),
  ]);
  grid.appendChild(userCard);

  // Preferences card
  const prefsCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'tune' }),
      document.createTextNode('Preferences'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Currency, date format and display options.' }),
    settingRow('Default Currency', 'default_currency', settings.default_currency, CURRENCIES),
    settingRow('Date Format', 'date_format', settings.date_format, DATE_FORMATS),
    textSizeRow(),
  ]);
  grid.appendChild(prefsCard);

  // Quick Setup Presets (P17)
  const presets = [
    { label: '🇮🇳 India', currency: 'INR', date_format: 'DD/MM/YYYY' },
    { label: '🇺🇸 US', currency: 'USD', date_format: 'MM/DD/YYYY' },
    { label: '🇪🇺 EU', currency: 'EUR', date_format: 'DD.MM.YYYY' },
  ];
  const presetsCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'bolt' }),
      document.createTextNode('Quick Setup'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'One-click presets for common regional defaults.' }),
    el('div', { style: 'display:flex;gap:0.5rem;flex-wrap:wrap' }, presets.map(p =>
      el('button', { className: 'btn btn-secondary', textContent: p.label, onClick: async () => {
        try {
          await Api.put('/settings', { key: 'default_currency', value: p.currency });
          await Api.put('/settings', { key: 'date_format', value: p.date_format });
          toast(`Settings updated to ${p.label}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
      }})
    )),
  ]);
  grid.appendChild(presetsCard);

  // Keyboard Shortcuts (P26)
  const defaultShortcuts = { dashboard: 'd', transactions: 't', budgets: 'b', groups: 'g', quickAdd: 'n' };
  const savedShortcuts = JSON.parse(localStorage.getItem('pfi_shortcuts') || 'null') || defaultShortcuts;
  const shortcutsCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'keyboard' }),
      document.createTextNode('Keyboard Shortcuts'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Navigate the app faster with keys.' }),
    ...Object.entries(savedShortcuts).map(([action, key]) => {
      const keyDisplay = el('span', { className: 'settings-value', textContent: key.toUpperCase(), style: 'font-family:monospace;background:var(--bg-tertiary);padding:0.125rem 0.375rem;border-radius:4px' });
      return el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', textContent: action }),
        keyDisplay,
      ]);
    }),
    el('button', { className: 'btn btn-secondary', textContent: 'Reset to Defaults', style: 'margin-top:0.5rem', onClick: () => {
      localStorage.removeItem('pfi_shortcuts');
      toast('Shortcuts reset to defaults', 'success');
    }}),
  ]);
  grid.appendChild(shortcutsCard);

  // Vim Mode Toggle (P27)
  const vimEnabled = localStorage.getItem('pfi_vim') === '1';
  const vimToggle = el('input', { type: 'checkbox', id: 'vim-toggle' });
  if (vimEnabled) vimToggle.checked = true;
  vimToggle.addEventListener('change', () => {
    localStorage.setItem('pfi_vim', vimToggle.checked ? '1' : '0');
    toast(vimToggle.checked ? 'Vim navigation enabled' : 'Vim navigation disabled', 'success');
  });
  const vimCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'code' }),
      document.createTextNode('Vim Navigation'),
    ]),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Enable J/K navigation' }),
      el('label', { className: 'set-toggle' }, [vimToggle, el('span', { className: 'slider' })]),
    ]),
  ]);
  grid.appendChild(vimCard);

  // Data card
  const dataCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'storage' }),
      document.createTextNode('Data'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Export, import and manage your financial data.' }),
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
  grid.appendChild(dataCard);

  // App info
  const infoCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'info' }),
      document.createTextNode('About'),
    ]),
    el('div', { className: 'settings-row', id: 'version-row' }, [
      el('span', { className: 'settings-label', textContent: 'Version' }),
      el('span', { className: 'settings-value version-value', textContent: 'loading...' }),
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
  grid.appendChild(infoCard);

  // Fetch version from API
  try {
    const { version } = await Api.get('/version');
    const versionEl = infoCard.querySelector('.version-value');
    if (versionEl) versionEl.textContent = version || 'unknown';
  } catch {
    const versionEl = infoCard.querySelector('.version-value');
    if (versionEl) versionEl.textContent = 'unknown';
  }
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

function textSizeRow() {
  const sizes = [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
  ];
  const current = localStorage.getItem('pfi_text_size') || 'default';
  const select = el('select', { className: 'settings-select' });
  sizes.forEach(s => {
    const opt = el('option', { value: s.value, textContent: s.label });
    if (current === s.value) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const val = select.value;
    localStorage.setItem('pfi_text_size', val);
    if (val === 'default') {
      document.documentElement.removeAttribute('data-text-size');
    } else {
      document.documentElement.setAttribute('data-text-size', val);
    }
    toast(`Text size set to ${val}`, 'success');
  });
  return el('div', { className: 'settings-row' }, [
    el('span', { className: 'settings-label', textContent: 'Text Size' }),
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
