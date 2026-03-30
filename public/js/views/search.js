// PersonalFi — Search Results View
import { Api, el, fmt } from '../utils.js';

export async function renderSearch(container, query) {
  container.innerHTML = '';

  const header = el('div', { className: 'view-header' }, [
    el('h2', { textContent: 'Search Results' }),
  ]);
  container.appendChild(header);

  if (!query || !query.trim()) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('span', { className: 'empty-icon', textContent: '🔍' }),
      el('p', { textContent: 'Enter a search term to find transactions, accounts, and categories.' }),
    ]));
    return;
  }

  container.appendChild(el('div', { className: 'loading', textContent: 'Searching...' }));

  try {
    const data = await Api.get(`/search?q=${encodeURIComponent(query.trim())}`);
    container.innerHTML = '';
    container.appendChild(header);

    const totalResults = (data.transactions?.length || 0) + (data.accounts?.length || 0) +
      (data.categories?.length || 0) + (data.subscriptions?.length || 0) + (data.tags?.length || 0);

    if (totalResults === 0) {
      container.appendChild(el('div', { className: 'empty-state' }, [
        el('span', { className: 'empty-icon', textContent: '😕' }),
        el('p', { textContent: `No results found for "${query}"` }),
      ]));
      return;
    }

    const summary = el('p', { className: 'search-summary', textContent: `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${query}"` });
    container.appendChild(summary);

    if (data.transactions?.length) {
      container.appendChild(buildSection('Transactions', 'receipt_long', data.transactions.map(t => transactionCard(t, query))));
    }
    if (data.accounts?.length) {
      container.appendChild(buildSection('Accounts', 'account_balance', data.accounts.map(a => accountCard(a, query))));
    }
    if (data.categories?.length) {
      container.appendChild(buildSection('Categories', 'category', data.categories.map(c => categoryCard(c, query))));
    }
    if (data.subscriptions?.length) {
      container.appendChild(buildSection('Subscriptions', 'autorenew', data.subscriptions.map(s => subscriptionCard(s, query))));
    }
    if (data.tags?.length) {
      container.appendChild(buildSection('Tags', 'label', data.tags.map(t => tagCard(t, query))));
    }
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(el('div', { className: 'error-state' }, [
      el('p', { textContent: 'Error searching: ' + err.message }),
    ]));
  }
}

function buildSection(title, icon, items) {
  return el('div', { className: 'search-section' }, [
    el('div', { className: 'search-section-header' }, [
      el('span', { className: 'material-icons-round', textContent: icon }),
      el('h3', { textContent: `${title} (${items.length})` }),
    ]),
    el('div', { className: 'search-results-grid' }, items),
  ]);
}

function highlightText(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  const span = document.createElement('span');
  parts.forEach(part => {
    if (part.toLowerCase() === query.toLowerCase()) {
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = part;
      span.appendChild(mark);
    } else {
      span.appendChild(document.createTextNode(part));
    }
  });
  return span;
}

function transactionCard(t, query) {
  const card = el('div', { className: 'card search-result-card' }, [
    el('div', { className: 'search-result-main' }, [
      el('div', { className: 'search-result-info' }, []),
      el('div', { className: `search-result-amount ${t.type === 'income' ? 'green' : 'red'}`, textContent: `${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}` }),
    ]),
    el('div', { className: 'search-result-meta' }, [
      el('span', { textContent: t.date }),
      t.account_name ? el('span', { textContent: t.account_name }) : null,
      t.category_name ? el('span', { textContent: `${t.category_icon || ''} ${t.category_name}` }) : null,
    ].filter(Boolean)),
  ]);
  const info = card.querySelector('.search-result-info');
  info.appendChild(highlightText(t.description, query));
  if (t.payee) {
    const payee = el('div', { className: 'search-result-sub' });
    payee.appendChild(highlightText(t.payee, query));
    info.appendChild(payee);
  }
  return card;
}

function accountCard(a, query) {
  const card = el('div', { className: 'card search-result-card' }, [
    el('div', { className: 'search-result-main' }, [
      el('div', { className: 'search-result-info' }, []),
      el('div', { className: 'search-result-amount', textContent: fmt(a.balance) }),
    ]),
    el('div', { className: 'search-result-meta' }, [
      el('span', { textContent: a.type }),
      el('span', { textContent: a.currency }),
    ]),
  ]);
  const info = card.querySelector('.search-result-info');
  const nameEl = highlightText(a.name, query);
  if (a.icon) {
    const wrap = el('span');
    wrap.appendChild(document.createTextNode(a.icon + ' '));
    wrap.appendChild(nameEl);
    info.appendChild(wrap);
  } else {
    info.appendChild(nameEl);
  }
  return card;
}

function categoryCard(c, query) {
  const card = el('div', { className: 'card search-result-card' }, [
    el('div', { className: 'search-result-main' }, [
      el('div', { className: 'search-result-info' }, []),
    ]),
    el('div', { className: 'search-result-meta' }, [
      el('span', { textContent: c.type }),
    ]),
  ]);
  const info = card.querySelector('.search-result-info');
  const nameEl = highlightText(c.name, query);
  if (c.icon) {
    const wrap = el('span');
    wrap.appendChild(document.createTextNode(c.icon + ' '));
    wrap.appendChild(nameEl);
    info.appendChild(wrap);
  } else {
    info.appendChild(nameEl);
  }
  return card;
}

function subscriptionCard(s, query) {
  const card = el('div', { className: 'card search-result-card' }, [
    el('div', { className: 'search-result-main' }, [
      el('div', { className: 'search-result-info' }, []),
      el('div', { className: 'search-result-amount', textContent: fmt(s.amount) }),
    ]),
    el('div', { className: 'search-result-meta' }, [
      el('span', { textContent: s.frequency }),
      s.provider ? el('span') : null,
    ].filter(Boolean)),
  ]);
  const info = card.querySelector('.search-result-info');
  info.appendChild(highlightText(s.name, query));
  if (s.provider) {
    const meta = card.querySelector('.search-result-meta');
    const providerEl = meta.lastElementChild;
    if (providerEl) providerEl.appendChild(highlightText(s.provider, query));
  }
  return card;
}

function tagCard(t, query) {
  const card = el('div', { className: 'card search-result-card' }, [
    el('div', { className: 'search-result-main' }, [
      el('div', { className: 'search-result-info' }, []),
    ]),
  ]);
  const info = card.querySelector('.search-result-info');
  const label = el('span', { className: 'tag-badge' });
  label.appendChild(document.createTextNode('🏷️ '));
  label.appendChild(highlightText(t.name, query));
  info.appendChild(label);
  return card;
}
