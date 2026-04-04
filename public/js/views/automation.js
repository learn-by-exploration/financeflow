// public/js/views/automation.js — Automation Hub View
import { Api, el, toast, fmt } from '../utils.js';

export async function renderAutomation(container) {
  container.textContent = '';

  // Header
  const header = el('div', { className: 'view-header' });
  const icon = el('span', { className: 'entity-icon material-icons-round' }, 'smart_toy');
  const title = el('h2', {});
  title.appendChild(icon);
  title.appendChild(document.createTextNode(' Automation Hub'));
  header.appendChild(title);
  const subtitle = el('p', { className: 'view-subtitle' }, 'All your financial automations in one place');
  header.appendChild(subtitle);
  container.appendChild(header);

  // Tab navigation
  const tabs = el('div', { className: 'tabs' });
  const tabData = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'activity', label: 'Activity Log', icon: 'history' },
    { id: 'suggestions', label: 'Suggestions', icon: 'lightbulb' },
    { id: 'presets', label: 'Presets', icon: 'tune' },
  ];
  let activeTab = 'overview';

  for (const t of tabData) {
    const btn = el('button', {
      className: `tab-btn ${t.id === activeTab ? 'active' : ''}`,
      'data-tab': t.id,
    });
    btn.appendChild(el('span', { className: 'material-icons-round' }, t.icon));
    btn.appendChild(document.createTextNode(' ' + t.label));
    btn.addEventListener('click', () => {
      activeTab = t.id;
      tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabContent();
    });
    tabs.appendChild(btn);
  }
  container.appendChild(tabs);

  const content = el('div', { className: 'automation-content' });
  container.appendChild(content);

  async function renderTabContent() {
    content.textContent = '';
    if (activeTab === 'overview') await renderOverview(content);
    else if (activeTab === 'activity') await renderActivityLog(content);
    else if (activeTab === 'suggestions') await renderSuggestions(content);
    else if (activeTab === 'presets') renderPresets(content);
  }

  await renderTabContent();
}

async function renderOverview(container) {
  try {
    const data = await Api.get('/automation/hub');
    const hub = data.hub;

    // Streak card at top
    const streakCard = el('div', { className: 'card streak-card' });
    const streakIcon = hub.streak.current_streak >= 7 ? '🔥' : hub.streak.current_streak > 0 ? '✨' : '💤';
    streakCard.appendChild(el('div', { className: 'card-header' },
      `${streakIcon} Logging Streak: ${hub.streak.current_streak} day${hub.streak.current_streak !== 1 ? 's' : ''}`
    ));
    if (hub.streak.longest_streak > 0) {
      streakCard.appendChild(el('p', { className: 'text-muted' }, `Best streak: ${hub.streak.longest_streak} days`));
    }
    container.appendChild(streakCard);

    // Automation stats grid
    const grid = el('div', { className: 'stats-grid' });
    const stats = [
      { label: 'Category Rules', count: hub.category_rules, icon: 'auto_fix_high', link: '#/rules' },
      { label: 'Recurring Rules', count: hub.recurring_rules, icon: 'repeat', link: '#/recurring' },
      { label: 'Bill Reminders', count: hub.bill_reminders, icon: 'notifications_active', link: '#/calendar' },
      { label: 'Spending Limits', count: hub.spending_limits, icon: 'speed', link: '#/settings' },
      { label: 'Balance Alerts', count: hub.balance_alerts, icon: 'account_balance', link: null },
      { label: 'Tag Rules', count: hub.tag_rules, icon: 'sell', link: '#/tags' },
      { label: 'Active Challenges', count: hub.active_challenges, icon: 'emoji_events', link: '#/challenges' },
      { label: 'Auto-Allocate Goals', count: hub.goals_with_auto_allocate, icon: 'savings', link: '#/goals' },
    ];

    for (const s of stats) {
      const card = el('div', { className: 'stat-card' });
      if (s.link) { card.style.cursor = 'pointer'; card.addEventListener('click', () => { location.hash = s.link; }); }
      const iconEl = el('span', { className: 'material-icons-round stat-icon' }, s.icon);
      const countEl = el('div', { className: 'stat-count' }, String(s.count));
      const labelEl = el('div', { className: 'stat-label' }, s.label);
      card.appendChild(iconEl);
      card.appendChild(countEl);
      card.appendChild(labelEl);
      grid.appendChild(card);
    }
    container.appendChild(grid);

    // Recent activity preview
    if (data.recent_activity.length > 0) {
      container.appendChild(el('h3', { style: 'margin-top: 1.5rem;' }, '📋 Recent Automation Activity'));
      const list = el('div', { className: 'activity-list' });
      for (const entry of data.recent_activity.slice(0, 5)) {
        const item = el('div', { className: 'activity-item' });
        const typeTag = el('span', { className: `badge badge-${getTagColor(entry.automation_type)}` }, entry.automation_type.replace(/_/g, ' '));
        const desc = el('span', {}, entry.description);
        const time = el('span', { className: 'text-muted text-sm' }, formatTimeAgo(entry.created_at));
        item.appendChild(typeTag);
        item.appendChild(desc);
        item.appendChild(time);
        list.appendChild(item);
      }
      container.appendChild(list);
    }

    // Activity summary
    if (data.activity_summary.length > 0) {
      container.appendChild(el('h3', { style: 'margin-top: 1.5rem;' }, '📊 Automation Summary'));
      const table = el('div', { className: 'simple-table' });
      for (const row of data.activity_summary) {
        const item = el('div', { className: 'table-row' });
        item.appendChild(el('span', { className: 'table-label' }, row.automation_type.replace(/_/g, ' ')));
        item.appendChild(el('span', { className: 'table-value' }, `${row.count} actions`));
        item.appendChild(el('span', { className: 'text-muted text-sm' }, row.last_run ? formatTimeAgo(row.last_run) : 'Never'));
        table.appendChild(item);
      }
      container.appendChild(table);
    }
  } catch (err) {
    container.appendChild(el('p', { className: 'error-text' }, 'Failed to load automation hub: ' + err.message));
  }
}

async function renderActivityLog(container) {
  try {
    const data = await Api.get('/automation/log?limit=50');
    if (data.entries.length === 0) {
      container.appendChild(el('div', { className: 'empty-state' },
        'No automation activity yet. Automations will log their actions here as they run.'));
      return;
    }

    container.appendChild(el('p', { className: 'text-muted' }, `${data.total} total entries`));

    const list = el('div', { className: 'activity-list' });
    for (const entry of data.entries) {
      const item = el('div', { className: 'activity-item' });
      const typeTag = el('span', { className: `badge badge-${getTagColor(entry.automation_type)}` }, entry.automation_type.replace(/_/g, ' '));
      const desc = el('span', {}, entry.description);
      const time = el('span', { className: 'text-muted text-sm' }, formatTimeAgo(entry.created_at));
      item.appendChild(typeTag);
      item.appendChild(desc);
      item.appendChild(time);
      list.appendChild(item);
    }
    container.appendChild(list);
  } catch (err) {
    container.appendChild(el('p', { className: 'error-text' }, 'Failed to load activity log: ' + err.message));
  }
}

async function renderSuggestions(container) {
  try {
    const data = await Api.get('/automation/suggestions');

    if (data.suggestions.length === 0) {
      container.appendChild(el('div', { className: 'empty-state' },
        'No suggestions right now. Keep logging transactions and suggestions will appear based on your patterns!'));
      return;
    }

    container.appendChild(el('p', { className: 'text-muted' }, `${data.suggestions.length} suggestions based on your activity`));

    for (const s of data.suggestions) {
      const card = el('div', { className: 'card suggestion-card' });
      const header = el('div', { className: 'card-header' });
      const icon = getSuggestionIcon(s.type);
      header.appendChild(el('span', { className: 'material-icons-round' }, icon));
      header.appendChild(el('strong', {}, ' ' + s.title));
      card.appendChild(header);
      card.appendChild(el('p', {}, s.message));

      const actionBtn = el('button', { className: 'btn btn-sm btn-primary' }, 'Set up');
      actionBtn.addEventListener('click', () => {
        navigateToSetup(s.type, s.action);
      });
      card.appendChild(actionBtn);
      container.appendChild(card);
    }
  } catch (err) {
    container.appendChild(el('p', { className: 'error-text' }, 'Failed to load suggestions: ' + err.message));
  }
}

function renderPresets(container) {
  container.appendChild(el('h3', {}, '⚡ Quick Setup Presets'));
  container.appendChild(el('p', { className: 'text-muted' }, 'Apply a notification preset to quickly configure your automation preferences.'));

  const presets = [
    {
      id: 'cautious',
      name: 'Cautious',
      icon: '🛡️',
      description: 'Get aggressive alerts and low thresholds. Best for tight budget control.',
      details: 'Inactivity: 1 day, Large txn: ₹2,000, All notifications ON',
    },
    {
      id: 'balanced',
      name: 'Balanced',
      icon: '⚖️',
      description: 'Sensible defaults. Get important notifications without overload.',
      details: 'Inactivity: 3 days, Large txn: ₹5,000, All notifications ON',
    },
    {
      id: 'hands_off',
      name: 'Hands Off',
      icon: '🧘',
      description: 'Minimal notifications. Only get critical alerts.',
      details: 'Inactivity: 7 days, Large txn: ₹20,000, Only critical notifications',
    },
  ];

  const grid = el('div', { className: 'preset-grid' });
  for (const p of presets) {
    const card = el('div', { className: 'card preset-card' });
    card.appendChild(el('div', { className: 'preset-icon' }, p.icon));
    card.appendChild(el('h4', {}, p.name));
    card.appendChild(el('p', {}, p.description));
    card.appendChild(el('p', { className: 'text-muted text-sm' }, p.details));

    const btn = el('button', { className: 'btn btn-primary' }, 'Apply');
    btn.addEventListener('click', async () => {
      try {
        await Api.post('/automation/presets', { preset: p.id });
        toast(`Applied "${p.name}" preset`, 'success');
      } catch (err) {
        toast('Failed: ' + err.message, 'error');
      }
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }
  container.appendChild(grid);
}

function getTagColor(type) {
  const map = {
    auto_categorize: 'blue', auto_tag: 'purple', challenge_tracking: 'green',
    recurring_spawn: 'orange', balance_alert: 'red', goal_allocation: 'teal',
  };
  return map[type] || 'gray';
}

function getSuggestionIcon(type) {
  const map = {
    category_rule: 'auto_fix_high', recurring_rule: 'repeat',
    savings_goal: 'savings', budget: 'pie_chart', spending_limit: 'speed',
  };
  return map[type] || 'lightbulb';
}

function navigateToSetup(type, action) {
  const viewMap = {
    category_rule: '#/rules', recurring_rule: '#/recurring',
    savings_goal: '#/goals', budget: '#/budgets', spending_limit: '#/settings',
  };
  location.hash = viewMap[type] || '#/settings';
}

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
