// PersonalFi — Settings View
import { Api, el, toast, openModal, closeModal } from '../utils.js';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD', 'AED'];
const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FISCAL_MONTHS = MONTH_NAMES.map((n, i) => ({ value: String(i + 1), label: n }));

function sectionHeader(icon, title) {
  return el('div', { className: 'settings-section-header' }, [
    el('span', { className: 'material-icons-round', textContent: icon }),
    el('span', { textContent: title }),
  ]);
}

export async function renderSettings(container) {
  container.innerHTML = '';
  const { settings } = await Api.get('/settings');
  const user = JSON.parse(localStorage.getItem('pfi_user') || sessionStorage.getItem('pfi_user') || '{}');

  const header = el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon setting', textContent: 'settings' }),
      el('span', { textContent: 'Settings' }),
    ]),
  ]);
  container.appendChild(header);

  const grid = el('div', { className: 'settings-grid' });
  container.appendChild(grid);

  // ═══════════════════════════════════════
  // SECTION: Account
  // ═══════════════════════════════════════

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

  // ═══════════════════════════════════════
  // SECTION: Appearance
  // ═══════════════════════════════════════
  grid.appendChild(sectionHeader('palette', 'Appearance'));

  // Theme card
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
      el('div', { className: `swatch-preview swatch-bg-${t.id}` }, [
        el('div', { className: `swatch-preview-bar swatch-accent-${t.id}` }),
      ]),
      el('div', { className: `swatch-label swatch-surface-${t.id}` }, [
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

  // Preferences + Quick Setup (merged)
  const presets = [
    { label: '🇮🇳 India', currency: 'INR', date_format: 'DD/MM/YYYY' },
    { label: '🇺🇸 US', currency: 'USD', date_format: 'MM/DD/YYYY' },
    { label: '🇪🇺 EU', currency: 'EUR', date_format: 'DD.MM.YYYY' },
  ];
  const prefsCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'tune' }),
      document.createTextNode('Preferences'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Currency, date format and display options.' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Quick Setup' }),
      el('div', { className: 'preset-buttons' }, presets.map(p =>
        el('button', { className: 'btn btn-secondary btn-xs', textContent: p.label, onClick: async () => {
          try {
            await Api.put('/settings', { key: 'default_currency', value: p.currency });
            await Api.put('/settings', { key: 'date_format', value: p.date_format });
            toast(`Settings updated to ${p.label}`, 'success');
          } catch (err) { toast(err.message, 'error'); }
        }})
      )),
    ]),
    settingRow('Default Currency', 'default_currency', settings.default_currency, CURRENCIES),
    settingRow('Date Format', 'date_format', settings.date_format, DATE_FORMATS),
    textSizeRow(),
  ]);
  grid.appendChild(prefsCard);

  // ═══════════════════════════════════════
  // SECTION: Financial
  // ═══════════════════════════════════════
  grid.appendChild(sectionHeader('account_balance', 'Financial'));

  // Financial Settings card (with month names for fiscal year)
  const finCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'account_balance' }),
      document.createTextNode('Financial Settings'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Income, budget method, and financial year configuration.' }),
    settingInputRow('Monthly Income', 'monthly_income', settings.monthly_income || '', 'number', 'Your monthly salary/income'),
    settingRow('Budget Methodology', 'budget_methodology', settings.budget_methodology || '50/30/20', ['50/30/20', 'zero-based', 'conscious-spending', 'envelope', 'pay-yourself-first']),
    settingSelectRow('Fiscal Year Start', 'fiscal_year_start', settings.fiscal_year_start || '4', FISCAL_MONTHS),
    settingInputRow('Inactivity Nudge (days)', 'inactivity_nudge_days', settings.inactivity_nudge_days || '3', 'number', 'Days before reminder'),
    settingInputRow('Large Txn Threshold', 'large_transaction_threshold', settings.large_transaction_threshold || '10000', 'number', 'Alert when transaction exceeds'),
  ]);
  grid.appendChild(finCard);

  // Health Score Thresholds card (with helper text)
  const ratioFields = [
    { label: 'Max Needs Ratio', key: 'max_needs_ratio', def: '0.4', hint: 'Maximum % of income for essential needs (0.4 = 40%)' },
    { label: 'Max EMI Ratio', key: 'max_emi_ratio', def: '0.3', hint: 'Maximum % of income for EMI payments' },
    { label: 'Min Savings Ratio', key: 'min_savings_ratio', def: '0.2', hint: 'Minimum % of income to save each month' },
    { label: 'Min Investment Ratio', key: 'min_investment_ratio', def: '0.1', hint: 'Minimum % of income to invest' },
    { label: 'Max Wants Ratio', key: 'max_wants_ratio', def: '0.15', hint: 'Maximum % of income for discretionary spending' },
    { label: 'Emergency Fund', key: 'emergency_fund_months_target', def: '6', hint: 'Target months of salary in emergency fund' },
    { label: 'Saving Fund', key: 'saving_fund_months_target', def: '3', hint: 'Target months of salary in savings' },
    { label: 'SIP Target', key: 'sip_months_target', def: '12', hint: 'Target months of salary in SIP investments' },
  ];
  const ratioCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'analytics' }),
      document.createTextNode('Health Score Thresholds'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Configure ratio targets for your 3-axis financial health score.' }),
    ...ratioFields.map(f => settingInputWithHint(f.label, f.key, settings[f.key] || f.def, 'number', f.hint)),
  ]);
  grid.appendChild(ratioCard);

  // ═══════════════════════════════════════
  // SECTION: Notifications & Dashboard
  // ═══════════════════════════════════════
  grid.appendChild(sectionHeader('notifications', 'Notifications & Dashboard'));

  // Notification Preferences card (with Enable/Disable All)
  const notifTypes = [
    { key: 'notify_budget_overspend', label: 'Budget overspend alerts' },
    { key: 'notify_goal_completed', label: 'Goal completion' },
    { key: 'notify_bill_upcoming', label: 'Upcoming bills' },
    { key: 'notify_large_transaction', label: 'Large transactions' },
    { key: 'notify_spending_warning', label: 'Spending warnings' },
    { key: 'notify_unusual_spending', label: 'Unusual spending' },
    { key: 'notify_inactivity_nudge', label: 'Inactivity reminders' },
    { key: 'notify_monthly_digest', label: 'Monthly digest' },
    { key: 'notify_milestone', label: 'Milestones' },
    { key: 'notify_financial_tip', label: 'Financial tips' },
    { key: 'notify_new_ip_login', label: 'New IP login alerts' },
    { key: 'notify_split_reminder', label: 'Split reminders' },
  ];

  const notifToggles = [];
  const notifRows = notifTypes.map(nt => {
    const isOn = settings[nt.key] !== 'false';
    const toggle = el('input', { type: 'checkbox', id: `notif-${nt.key}` });
    if (isOn) toggle.checked = true;
    toggle.addEventListener('change', async () => {
      try {
        await Api.put('/settings', { key: nt.key, value: toggle.checked ? 'true' : 'false' });
      } catch (err) { toast(err.message, 'error'); }
    });
    notifToggles.push({ toggle, key: nt.key });
    return el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: nt.label }),
      el('label', { className: 'set-toggle' }, [toggle, el('span', { className: 'slider' })]),
    ]);
  });

  const setAllNotifs = async (state) => {
    for (const { toggle, key } of notifToggles) {
      toggle.checked = state;
      try { await Api.put('/settings', { key, value: state ? 'true' : 'false' }); } catch { /* continue */ }
    }
    toast(state ? 'All notifications enabled' : 'All notifications disabled', 'success');
  };

  const notifCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'notifications' }),
      document.createTextNode('Notification Preferences'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Choose which notifications you receive.' }),
    el('div', { className: 'settings-row notif-bulk-row' }, [
      el('span', { className: 'settings-label', textContent: 'Bulk Actions' }),
      el('div', { className: 'preset-buttons' }, [
        el('button', { className: 'btn btn-secondary btn-xs', textContent: 'Enable All', onClick: () => setAllNotifs(true) }),
        el('button', { className: 'btn btn-secondary btn-xs', textContent: 'Disable All', onClick: () => setAllNotifs(false) }),
      ]),
    ]),
    ...notifRows,
  ]);
  grid.appendChild(notifCard);

  // Dashboard Customization card
  const allCards = ['net_worth', 'spending_trend', 'budget_progress', 'recent_transactions', 'upcoming_recurring', 'savings_goals', 'group_balances', 'subscriptions', 'financial_health', 'calendar_preview'];
  let currentLayout;
  try {
    const layoutData = await Api.get('/settings/dashboard');
    currentLayout = layoutData.layout || allCards.slice(0, 6);
  } catch { currentLayout = allCards.slice(0, 6); }

  const dashCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'dashboard_customize' }),
      document.createTextNode('Dashboard Cards'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Choose which cards appear on your dashboard.' }),
    ...allCards.map(cardId => {
      const isEnabled = currentLayout.includes(cardId);
      const toggle = el('input', { type: 'checkbox', id: `dash-${cardId}` });
      if (isEnabled) toggle.checked = true;
      toggle.addEventListener('change', async () => {
        const newLayout = allCards.filter(c => {
          const cb = document.getElementById(`dash-${c}`);
          return cb && cb.checked;
        });
        try {
          await Api.put('/settings', { key: 'dashboard_layout', value: JSON.stringify(newLayout) });
          toast('Dashboard updated', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
      return el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', textContent: cardId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }),
        el('label', { className: 'set-toggle' }, [toggle, el('span', { className: 'slider' })]),
      ]);
    }),
  ]);
  grid.appendChild(dashCard);

  // ═══════════════════════════════════════
  // SECTION: Advanced
  // ═══════════════════════════════════════
  grid.appendChild(sectionHeader('build', 'Advanced'));

  // AI Assistant card
  const AI_PROVIDERS = [
    { value: 'template', label: 'Template (No LLM)' },
    { value: 'ollama', label: 'Ollama (Local)' },
    { value: 'openai', label: 'OpenAI-Compatible (Web)' },
  ];
  const curProvider = settings.ai_provider || 'template';
  const showLLMFields = curProvider !== 'template';

  const aiEndpointRow = settingInputRow('Endpoint', 'ai_endpoint', settings.ai_endpoint || '', 'text', 'http://localhost:11434');
  const aiModelRow = settingInputRow('Model', 'ai_model', settings.ai_model || '', 'text', 'llama3 or gpt-4');
  const aiKeyRow = settingInputRow('API Key', 'ai_api_key', settings.ai_api_key || '', 'password', 'sk-...');
  if (!showLLMFields) {
    aiEndpointRow.style.display = 'none';
    aiModelRow.style.display = 'none';
    aiKeyRow.style.display = 'none';
  }

  const aiProviderSelect = el('select', {
    className: 'settings-select',
    'aria-label': 'AI Provider',
    onChange: async (e) => {
      const val = e.target.value;
      const isLLM = val !== 'template';
      aiEndpointRow.style.display = isLLM ? '' : 'none';
      aiModelRow.style.display = isLLM ? '' : 'none';
      aiKeyRow.style.display = isLLM ? '' : 'none';
      try {
        await Api.put('/settings', { key: 'ai_provider', value: val });
        toast(`AI provider set to ${AI_PROVIDERS.find(p => p.value === val)?.label}`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    },
  }, AI_PROVIDERS.map(p => {
    const opt = el('option', { value: p.value, textContent: p.label });
    if (p.value === curProvider) opt.selected = true;
    return opt;
  }));

  const aiCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'smart_toy' }),
      document.createTextNode('AI Assistant'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Configure the AI provider for financial planning. Template mode works offline with no LLM.' }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Provider' }),
      aiProviderSelect,
    ]),
    aiEndpointRow,
    aiModelRow,
    aiKeyRow,
  ]);
  grid.appendChild(aiCard);

  // Keyboard Shortcuts + Vim (merged)
  const defaultShortcuts = { dashboard: 'd', transactions: 't', budgets: 'b', groups: 'g', quickAdd: 'n' };
  const savedShortcuts = JSON.parse(localStorage.getItem('pfi_shortcuts') || 'null') || defaultShortcuts;
  const vimEnabled = localStorage.getItem('pfi_vim') === '1';
  const vimToggle = el('input', { type: 'checkbox', id: 'vim-toggle' });
  if (vimEnabled) vimToggle.checked = true;
  vimToggle.addEventListener('change', () => {
    localStorage.setItem('pfi_vim', vimToggle.checked ? '1' : '0');
    toast(vimToggle.checked ? 'Vim navigation enabled' : 'Vim navigation disabled', 'success');
  });

  const shortcutsCard = el('div', { className: 'card settings-section' }, [
    el('h3', {}, [
      el('span', { className: 'material-icons-round', textContent: 'keyboard' }),
      document.createTextNode('Keyboard Shortcuts'),
    ]),
    el('p', { className: 'settings-section-desc', textContent: 'Navigate the app faster with keys.' }),
    ...Object.entries(savedShortcuts).map(([action, key]) => {
      const keyDisplay = el('kbd', { className: 'kbd-key', textContent: key.toUpperCase() });
      return el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', textContent: action.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) }),
        keyDisplay,
      ]);
    }),
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: 'Vim J/K navigation' }),
      el('label', { className: 'set-toggle' }, [vimToggle, el('span', { className: 'slider' })]),
    ]),
    el('div', { className: 'settings-row settings-row-action' }, [
      el('button', { className: 'btn btn-secondary btn-xs', textContent: 'Reset Shortcuts to Defaults', onClick: () => {
        localStorage.removeItem('pfi_shortcuts');
        toast('Shortcuts reset to defaults', 'success');
      }}),
    ]),
  ]);
  grid.appendChild(shortcutsCard);

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
    el('div', { className: 'settings-row' }, [
      el('span', { className: 'settings-label', textContent: "What's New" }),
      el('button', { className: 'btn btn-secondary', textContent: 'View Changelog', onClick: showWhatsNewModal }),
    ]),
  ]);
  grid.appendChild(infoCard);

  // ─── Lazy-loaded management sections ───
  const mgmtSections = [
    { id: 'tags', icon: 'label', label: 'Tags', module: './tags.js', fn: 'renderTags' },
    { id: 'rules', icon: 'auto_fix_high', label: 'Auto Rules', module: './rules.js', fn: 'renderRules' },
    { id: 'export', icon: 'file_download', label: 'Export Transactions', module: './export.js', fn: 'renderExport' },
  ];

  for (const sec of mgmtSections) {
    const details = el('details', { className: 'card settings-section settings-lazy-section' });
    const summary = el('summary', {}, [
      el('span', { className: 'material-icons-round', textContent: sec.icon }),
      document.createTextNode(sec.label),
    ]);
    details.appendChild(summary);
    const contentDiv = el('div', { className: 'lazy-section-content' });
    details.appendChild(contentDiv);
    let loaded = false;
    details.addEventListener('toggle', async () => {
      if (details.open && !loaded) {
        loaded = true;
        try {
          const mod = await import(sec.module);
          await mod[sec.fn](contentDiv);
        } catch (err) {
          contentDiv.appendChild(el('p', { className: 'error', textContent: `Failed to load: ${err.message}` }));
        }
      }
    });
    grid.appendChild(details);
  }

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

function settingInputRow(label, key, currentValue, inputType, placeholder) {
  const input = el('input', {
    type: inputType || 'text',
    className: 'settings-input',
    value: currentValue,
    placeholder: placeholder || '',
  });
  if (inputType === 'number') input.step = 'any';
  let debounce;
  input.addEventListener('change', async () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        await Api.put('/settings', { key, value: input.value });
        toast(`${label} updated`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    }, 300);
  });
  return el('div', { className: 'settings-row' }, [
    el('span', { className: 'settings-label', textContent: label }),
    input,
  ]);
}

function settingSelectRow(label, key, currentValue, options) {
  const select = el('select', { className: 'settings-select' });
  options.forEach(o => {
    const opt = el('option', { value: o.value, textContent: o.label });
    if (currentValue === o.value) opt.selected = true;
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

function settingInputWithHint(label, key, currentValue, inputType, hint) {
  const input = el('input', {
    type: inputType || 'text',
    className: 'settings-input',
    value: currentValue,
  });
  if (inputType === 'number') input.step = 'any';
  let debounce;
  input.addEventListener('change', async () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        await Api.put('/settings', { key, value: input.value });
        toast(`${label} updated`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    }, 300);
  });
  return el('div', { className: 'settings-row settings-row-hint' }, [
    el('div', { className: 'settings-label-group' }, [
      el('span', { className: 'settings-label', textContent: label }),
      el('small', { className: 'settings-hint', textContent: hint }),
    ]),
    input,
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

async function showWhatsNewModal() {
  const container = el('div', { className: 'whats-new-modal' }, [
    el('h3', { className: 'modal-title', textContent: "What's New" }),
    el('p', { className: 'text-muted', textContent: 'Loading changelog...' }),
  ]);
  openModal(container);

  try {
    const data = await Api.get('/whats-new');
    container.innerHTML = '';
    container.appendChild(el('h3', { className: 'modal-title', textContent: "What's New" }));

    if (!data.entries || data.entries.length === 0) {
      container.appendChild(el('p', { className: 'text-muted', textContent: 'No release notes available.' }));
      return;
    }

    for (const entry of data.entries) {
      const entryDiv = el('div', { className: 'whats-new-entry' }, [
        el('div', { className: 'whats-new-header' }, [
          el('span', { className: 'whats-new-version', textContent: `v${entry.version}` }),
          el('span', { className: 'whats-new-date text-muted', textContent: entry.date }),
        ]),
      ]);
      const ul = el('ul', { className: 'whats-new-changes' });
      (entry.changes || []).forEach(c => ul.appendChild(el('li', { textContent: c })));
      entryDiv.appendChild(ul);
      container.appendChild(entryDiv);
    }
  } catch {
    container.innerHTML = '';
    container.appendChild(el('h3', { className: 'modal-title', textContent: "What's New" }));
    container.appendChild(el('p', { className: 'text-muted', textContent: 'Failed to load changelog.' }));
  }
}
