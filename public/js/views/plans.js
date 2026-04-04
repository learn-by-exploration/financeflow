// public/js/views/plans.js — AI Financial Planner View
import { Api, fmt, el, toast, openModal, closeModal, confirm, withLoading } from '../utils.js';
import { showLoading, showEmpty, showError, hideStates } from '../ui-states.js';

const GOAL_TYPE_META = {
  home_purchase:  { icon: '🏠', label: 'Home Purchase' },
  vehicle:        { icon: '🚗', label: 'Vehicle' },
  wedding:        { icon: '💒', label: 'Wedding' },
  education:      { icon: '🎓', label: 'Education' },
  retirement:     { icon: '🏖️', label: 'Retirement' },
  emergency_fund: { icon: '🛡️', label: 'Emergency Fund' },
  travel:         { icon: '✈️', label: 'Travel' },
  business:       { icon: '💼', label: 'Business' },
  debt_payoff:    { icon: '💳', label: 'Debt Payoff' },
  custom:         { icon: '🎯', label: 'Custom Goal' },
};

let currentTab = 'plans';

export async function renderPlans(container) {
  container.innerHTML = '';

  // Tab bar
  const tabBar = el('div', { className: 'tab-bar' }, [
    tabBtn('plans', 'My Plans', 'list_alt'),
    tabBtn('create', 'Create Plan', 'add_circle'),
    tabBtn('emi', 'EMI Calculator', 'calculate'),
    tabBtn('simulate', 'Simulator', 'trending_up'),
  ]);
  container.appendChild(el('div', { className: 'view-header' }, [
    el('h2', {}, [
      el('span', { className: 'material-icons-round entity-icon plan', textContent: 'architecture' }),
      el('span', { textContent: 'Financial Planner' }),
    ]),
  ]));
  container.appendChild(tabBar);

  const tabContent = el('div', { className: 'tab-content plan-tab-content' });
  container.appendChild(tabContent);

  switchTab(tabContent, currentTab);
}

function tabBtn(id, label, icon) {
  const active = currentTab === id ? ' active' : '';
  return el('button', {
    className: `tab-btn${active}`,
    'data-tab': id,
    onClick: (e) => {
      currentTab = id;
      document.querySelectorAll('.tab-bar .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.closest('.tab-btn').classList.add('active');
      const content = document.querySelector('.plan-tab-content');
      if (content) switchTab(content, id);
    },
  }, [
    el('span', { className: 'material-icons-round', textContent: icon, style: 'font-size:18px;margin-right:4px' }),
    el('span', { textContent: label }),
  ]);
}

async function switchTab(container, tab) {
  container.innerHTML = '';
  if (tab === 'plans') await renderPlanList(container);
  else if (tab === 'create') await renderCreatePlan(container);
  else if (tab === 'emi') renderEMICalculator(container);
  else if (tab === 'simulate') renderSimulator(container);
}

// ─── Plan List ───
async function renderPlanList(container) {
  showLoading(container);
  try {
    const data = await Api.get('/plans');
    hideStates(container);

    if (data.plans.length === 0) {
      showEmpty(container, {
        icon: '📋',
        title: 'No financial plans yet',
        message: 'Create your first plan to get AI-powered savings strategies.',
        actionText: '+ Create Plan',
        actionHandler: () => { currentTab = 'create'; renderPlans(container.parentElement); },
      });
      return;
    }

    const grid = el('div', { className: 'plans-grid' });
    for (const plan of data.plans) {
      grid.appendChild(planCard(plan, container));
    }
    container.appendChild(grid);
  } catch (err) {
    showError(container, { message: 'Failed to load plans: ' + err.message });
  }
}

function planCard(plan, parentContainer) {
  const meta = GOAL_TYPE_META[plan.goal_type] || GOAL_TYPE_META.custom;
  const pct = plan.target_amount > 0 ? Math.min(100, Math.round((plan.current_saved / plan.target_amount) * 100)) : 0;
  const statusColors = { active: '#22c55e', paused: '#f59e0b', completed: '#6366f1', draft: '#94a3b8', cancelled: '#ef4444' };

  return el('div', { className: 'card plan-card', onClick: () => openPlanDetail(plan.id, parentContainer) }, [
    el('div', { className: 'plan-card-header' }, [
      el('span', { className: 'plan-icon', textContent: meta.icon, style: 'font-size:2rem' }),
      el('div', { className: 'plan-card-title' }, [
        el('h3', { textContent: plan.name }),
        el('span', { className: 'badge', textContent: plan.status, style: `background:${statusColors[plan.status] || '#94a3b8'}` }),
      ]),
    ]),
    el('div', { className: 'plan-card-body' }, [
      el('div', { className: 'plan-meta' }, [
        el('span', { textContent: `Target: ${fmt(plan.target_amount)}` }),
        plan.monthly_savings_target > 0 ? el('span', { textContent: `Save: ${fmt(plan.monthly_savings_target)}/mo` }) : null,
      ].filter(Boolean)),
      el('div', { className: 'progress-bar-container' }, [
        el('div', { className: 'progress-bar', style: `width:${pct}%` }),
      ]),
      el('div', { className: 'plan-progress-label' }, [
        el('span', { textContent: `${fmt(plan.current_saved)} saved` }),
        el('span', { textContent: `${pct}%` }),
      ]),
    ]),
    plan.target_date ? el('div', { className: 'plan-card-footer' }, [
      el('span', { className: 'material-icons-round', textContent: 'event', style: 'font-size:16px;margin-right:4px' }),
      el('span', { textContent: `Target: ${plan.target_date}` }),
    ]) : null,
  ].filter(Boolean));
}

// ─── Plan Detail ───
async function openPlanDetail(planId, parentContainer) {
  try {
    const [planData, progressData] = await Promise.all([
      Api.get(`/plans/${planId}`),
      Api.get(`/plans/${planId}/progress`),
    ]);
    const { plan, scenarios, milestones } = planData;
    const planDataParsed = plan.plan_data ? JSON.parse(plan.plan_data) : {};

    const content = el('div', { className: 'plan-detail' });

    // Header
    const meta = GOAL_TYPE_META[plan.goal_type] || GOAL_TYPE_META.custom;
    content.appendChild(el('div', { className: 'plan-detail-header' }, [
      el('span', { textContent: meta.icon, style: 'font-size:2.5rem' }),
      el('div', {}, [
        el('h2', { textContent: plan.name }),
        el('span', { className: `badge badge-${progressData.status}`, textContent: progressData.status.replace('_', ' ') }),
      ]),
    ]));

    // Progress
    const pct = progressData.progress_pct;
    content.appendChild(el('div', { className: 'card' }, [
      el('h3', { textContent: 'Progress' }),
      el('div', { className: 'progress-bar-container large' }, [
        el('div', { className: 'progress-bar', style: `width:${pct}%` }),
      ]),
      el('div', { className: 'plan-progress-stats' }, [
        el('div', {}, [el('strong', { textContent: fmt(plan.current_saved) }), el('span', { textContent: ' saved' })]),
        el('div', {}, [el('strong', { textContent: fmt(progressData.remaining) }), el('span', { textContent: ' remaining' })]),
        el('div', {}, [el('strong', { textContent: `${pct}%` }), el('span', { textContent: ' complete' })]),
      ]),
    ]));

    // Scenarios
    if (scenarios.length > 0) {
      const scenarioCards = el('div', { className: 'scenarios-grid' });
      for (const s of scenarios) {
        const assumptions = s.assumptions ? JSON.parse(s.assumptions) : {};
        scenarioCards.appendChild(el('div', { className: `card scenario-card ${s.scenario_type === plan.selected_scenario ? 'selected' : ''}` }, [
          el('h4', { textContent: s.scenario_type.charAt(0).toUpperCase() + s.scenario_type.slice(1) }),
          el('div', { className: 'scenario-detail' }, [
            el('span', { textContent: `Save ${fmt(s.monthly_savings)}/mo` }),
            el('span', { textContent: `${s.duration_months} months` }),
            el('span', { textContent: `Returns: ${Math.round((assumptions.return_rate || 0) * 100)}%` }),
          ]),
          el('div', { className: 'scenario-total' }, [
            el('span', { textContent: `Total: ${fmt(s.total_saved)}` }),
            s.total_interest > 0 ? el('span', { className: 'interest', textContent: `Interest: ${fmt(s.total_interest)}` }) : null,
          ].filter(Boolean)),
          assumptions.feasible !== undefined ? el('span', { className: `feasibility ${assumptions.feasible ? 'feasible' : 'stretch'}`, textContent: assumptions.feasible ? '✅ Feasible' : '⚠️ Stretch' }) : null,
        ].filter(Boolean)));
      }
      content.appendChild(el('div', { className: 'card' }, [
        el('h3', { textContent: 'Savings Scenarios' }),
        scenarioCards,
      ]));
    }

    // Milestones
    if (milestones.length > 0) {
      const milestoneList = el('div', { className: 'milestone-list' });
      for (const m of milestones) {
        milestoneList.appendChild(el('div', { className: `milestone-item ${m.is_completed ? 'completed' : ''}` }, [
          el('span', { className: 'material-icons-round', textContent: m.is_completed ? 'check_circle' : 'radio_button_unchecked' }),
          el('span', { textContent: m.title }),
          el('span', { className: 'milestone-date', textContent: m.target_date }),
        ]));
      }
      content.appendChild(el('div', { className: 'card' }, [
        el('h3', { textContent: 'Milestones' }),
        milestoneList,
      ]));
    }

    // Tax Suggestions
    if (planDataParsed.taxSuggestions?.length > 0) {
      const taxList = el('div', { className: 'tax-suggestions' });
      for (const t of planDataParsed.taxSuggestions) {
        taxList.appendChild(el('div', { className: 'tax-item' }, [
          el('strong', { textContent: `Section ${t.section}` }),
          el('span', { textContent: t.benefit }),
          t.tax_saved ? el('span', { className: 'tax-saved', textContent: `Saves ~${fmt(t.tax_saved)}/yr` }) : null,
        ].filter(Boolean)));
      }
      content.appendChild(el('div', { className: 'card' }, [
        el('h3', { textContent: '🏛️ Tax Benefits' }),
        taxList,
      ]));
    }

    // EMI Analysis
    if (planDataParsed.emiAnalysis) {
      const emi = planDataParsed.emiAnalysis;
      content.appendChild(el('div', { className: 'card' }, [
        el('h3', { textContent: '🏦 Loan & EMI Analysis' }),
        el('div', { className: 'emi-stats' }, [
          statItem('Loan Amount', fmt(emi.loan_amount)),
          statItem('Interest Rate', `${emi.interest_rate}%`),
          statItem('EMI', fmt(emi.emi) + '/mo'),
          statItem('Total Interest', fmt(emi.total_interest)),
          statItem('Risk Level', emi.affordability?.risk_level || 'N/A'),
        ]),
      ]));
    }

    // AI Narrative
    if (plan.ai_narrative) {
      content.appendChild(el('div', { className: 'card ai-narrative-card' }, [
        el('h3', {}, [
          el('span', { className: 'material-icons-round', textContent: 'auto_awesome', style: 'margin-right:8px;color:var(--primary)' }),
          el('span', { textContent: 'AI Plan Summary' }),
        ]),
        el('div', { className: 'ai-narrative', innerHTML: '' }),
      ]));
      // Safely render markdown-like text
      const narrativeEl = content.querySelector('.ai-narrative');
      renderMarkdown(narrativeEl, plan.ai_narrative);
    }

    // Chat section
    content.appendChild(buildChatSection(plan));

    // Actions
    content.appendChild(el('div', { className: 'plan-actions' }, [
      el('button', { className: 'btn btn-secondary', textContent: '🔄 Replan', onClick: async () => {
        await withLoading(async () => {
          await Api.post(`/plans/${plan.id}/replan`);
          toast('Plan recalculated!', 'success');
          openPlanDetail(plan.id, parentContainer);
        });
      }}),
      el('button', { className: 'btn btn-secondary', textContent: '🔮 What-If', onClick: () => openWhatIfModal(plan) }),
      plan.status === 'active' ? el('button', { className: 'btn btn-secondary', textContent: '⏸ Pause', onClick: async () => {
        await Api.put(`/plans/${plan.id}`, { status: 'paused' });
        toast('Plan paused', 'info');
        openPlanDetail(plan.id, parentContainer);
      }}) : null,
      plan.status === 'paused' ? el('button', { className: 'btn btn-primary', textContent: '▶ Resume', onClick: async () => {
        await Api.put(`/plans/${plan.id}`, { status: 'active' });
        toast('Plan resumed', 'success');
        openPlanDetail(plan.id, parentContainer);
      }}) : null,
      el('button', { className: 'btn btn-danger btn-sm', textContent: 'Delete', onClick: async () => {
        if (await confirm('Delete this plan?', 'This action cannot be undone.')) {
          await Api.del(`/plans/${plan.id}`);
          toast('Plan deleted', 'success');
          currentTab = 'plans';
          renderPlans(parentContainer.parentElement);
        }
      }}),
    ].filter(Boolean)));

    openModal(el('div', { className: 'plan-detail-modal' }, [
      el('h2', { className: 'modal-title', textContent: 'Plan Details' }),
      content,
    ]));
  } catch (err) {
    toast('Error loading plan: ' + err.message, 'error');
  }
}

function statItem(label, value) {
  return el('div', { className: 'stat-item' }, [
    el('span', { className: 'stat-label', textContent: label }),
    el('strong', { className: 'stat-value', textContent: value }),
  ]);
}

function renderMarkdown(container, text) {
  // Simple safe markdown rendering using textContent for lines
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('## ')) {
      container.appendChild(el('h3', { textContent: line.slice(3) }));
    } else if (line.startsWith('**') && line.endsWith('**')) {
      container.appendChild(el('p', {}, [el('strong', { textContent: line.replace(/\*\*/g, '') })]));
    } else if (line.startsWith('- **')) {
      const parts = line.slice(2);
      const p = el('p', { className: 'md-list-item' });
      p.textContent = parts.replace(/\*\*/g, '');
      container.appendChild(p);
    } else if (line.startsWith('- ')) {
      container.appendChild(el('p', { className: 'md-list-item', textContent: line.slice(2) }));
    } else if (line.trim()) {
      container.appendChild(el('p', { textContent: line.replace(/\*\*/g, '') }));
    }
  }
}

// ─── Chat Section ───
function buildChatSection(plan) {
  const chatHistory = [];
  const wrapper = el('div', { className: 'card chat-section' });
  wrapper.appendChild(el('h3', {}, [
    el('span', { className: 'material-icons-round', textContent: 'chat', style: 'margin-right:8px;color:var(--primary)' }),
    el('span', { textContent: 'Ask about your plan' }),
  ]));

  const messages = el('div', { className: 'chat-messages', id: 'plan-chat-messages' });
  wrapper.appendChild(messages);

  const inputRow = el('div', { className: 'chat-input-row' });
  const input = el('input', {
    type: 'text', placeholder: 'Ask about taxes, EMI, milestones, savings strategies...',
    className: 'input chat-input', maxLength: 2000,
  });
  const sendBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'Send' });

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;

    // Show user message
    messages.appendChild(el('div', { className: 'chat-msg user' }, [el('p', { textContent: msg })]));
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Show loading
    const loadingEl = el('div', { className: 'chat-msg assistant loading' }, [el('p', { textContent: 'Thinking...' })]);
    messages.appendChild(loadingEl);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await Api.post(`/plans/${plan.id}/chat`, {
        message: msg,
        history: chatHistory.slice(-10),
      });
      loadingEl.remove();
      chatHistory.push({ role: 'user', content: msg });
      chatHistory.push({ role: 'assistant', content: res.response });

      const responseEl = el('div', { className: 'chat-msg assistant' });
      renderMarkdown(responseEl, res.response);
      messages.appendChild(responseEl);
    } catch (err) {
      loadingEl.remove();
      messages.appendChild(el('div', { className: 'chat-msg error' }, [el('p', { textContent: 'Error: ' + err.message })]));
    }
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  wrapper.appendChild(inputRow);
  return wrapper;
}

// ─── What-If Modal ───
function openWhatIfModal(plan) {
  const form = el('form', { className: 'form plan-whatif-form' });

  const fields = [
    { name: 'income_change', label: 'Monthly income change (±)', type: 'number', placeholder: 'e.g. 10000' },
    { name: 'expense_cut', label: 'Monthly expense cut', type: 'number', placeholder: 'e.g. 5000', min: 0 },
    { name: 'lump_sum', label: 'Lump sum addition', type: 'number', placeholder: 'e.g. 100000', min: 0 },
    { name: 'target_amount', label: 'New target amount', type: 'number', placeholder: `Current: ${plan.target_amount}` },
    { name: 'target_date', label: 'New target date', type: 'date' },
  ];

  for (const f of fields) {
    const group = el('div', { className: 'form-group' }, [
      el('label', { textContent: f.label }),
      el('input', { type: f.type, name: f.name, placeholder: f.placeholder || '', className: 'input', min: f.min }),
    ]);
    form.appendChild(group);
  }

  const resultDiv = el('div', { className: 'whatif-results', id: 'whatif-results' });

  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Run What-If' }));
  form.appendChild(resultDiv);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adjustments = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (v !== '' && v !== undefined) adjustments[k] = Number(v);
    }

    try {
      resultDiv.textContent = 'Calculating...';
      const res = await Api.post(`/plans/${plan.id}/what-if`, { adjustments });
      resultDiv.innerHTML = '';

      if (res.scenarios) {
        for (const [key, sc] of Object.entries(res.scenarios)) {
          resultDiv.appendChild(el('div', { className: 'card scenario-card' }, [
            el('h4', { textContent: sc.label || key }),
            el('p', { textContent: `Save ${fmt(sc.monthly_savings)}/mo → ${fmt(sc.total_saved)} in ${sc.duration_months} months` }),
            el('p', { textContent: sc.feasible ? '✅ Feasible' : '⚠️ Stretch target' }),
          ]));
        }
      }
    } catch (err) {
      resultDiv.textContent = '';
      toast('What-if error: ' + err.message, 'error');
    }
  });

  openModal(el('div', { className: 'whatif-modal' }, [
    el('h2', { className: 'modal-title', textContent: 'What-If Simulator' }),
    form,
  ]));
}

// ─── Create Plan ───
async function renderCreatePlan(container) {
  let templates = [];
  try {
    const data = await Api.get('/plans/templates');
    templates = data.templates;
  } catch { /* ignore */ }

  // Template picker
  const picker = el('div', { className: 'template-picker' });
  container.appendChild(el('h3', { textContent: 'Choose a goal type' }));
  container.appendChild(picker);

  for (const t of templates) {
    const meta = GOAL_TYPE_META[t.id] || { icon: '🎯', label: t.name };
    picker.appendChild(el('button', {
      className: 'card template-btn',
      onClick: () => showCreateForm(container, t.id),
    }, [
      el('span', { textContent: meta.icon, style: 'font-size:2rem' }),
      el('span', { textContent: meta.label }),
    ]));
  }
}

async function showCreateForm(container, goalType) {
  container.innerHTML = '';
  const meta = GOAL_TYPE_META[goalType] || GOAL_TYPE_META.custom;

  container.appendChild(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:16px' }, [
    el('button', { className: 'btn btn-ghost btn-sm', textContent: '← Back', onClick: () => renderCreatePlan(container) }),
    el('h3', { textContent: `${meta.icon} ${meta.label} Plan` }),
  ]));

  const form = el('form', { className: 'form create-plan-form' });

  form.appendChild(formGroup('Plan Name', el('input', { type: 'text', name: 'name', className: 'input', placeholder: `My ${meta.label} Plan`, required: true, maxLength: 200 })));
  form.appendChild(formGroup('Target Amount (₹)', el('input', { type: 'number', name: 'target_amount', className: 'input', placeholder: 'e.g. 500000', required: true, min: 1 })));
  form.appendChild(formGroup('Target Date (optional)', el('input', { type: 'date', name: 'target_date', className: 'input' })));

  const riskSelect = el('select', { name: 'risk_tolerance', className: 'input' }, [
    el('option', { value: 'conservative', textContent: 'Conservative (5% returns)' }),
    el('option', { value: 'moderate', textContent: 'Moderate (8% returns)', selected: true }),
    el('option', { value: 'aggressive', textContent: 'Aggressive (12% returns)' }),
  ]);
  form.appendChild(formGroup('Risk Tolerance', riskSelect));

  form.appendChild(formGroup('Notes (optional)', el('textarea', { name: 'notes', className: 'input', placeholder: 'Any additional notes...', rows: 3, maxLength: 2000 })));

  const resultArea = el('div', { className: 'plan-creation-result' });

  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-lg', textContent: '🚀 Generate Plan' }));
  form.appendChild(resultArea);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      name: fd.get('name'),
      goal_type: goalType,
      target_amount: Number(fd.get('target_amount')),
      risk_tolerance: fd.get('risk_tolerance'),
    };
    if (fd.get('target_date')) body.target_date = fd.get('target_date');
    if (fd.get('notes')) body.notes = fd.get('notes');

    try {
      resultArea.textContent = 'Generating your personalized plan...';
      const res = await Api.post('/plans', body);
      resultArea.innerHTML = '';
      resultArea.appendChild(el('div', { className: 'success-message' }, [
        el('h3', { textContent: '✅ Plan Created!' }),
        el('p', { textContent: `Monthly savings target: ${fmt(res.plan.monthly_savings_target)}` }),
        el('p', { textContent: `${res.scenarios.length} scenarios, ${res.milestones.length} milestones generated` }),
      ]));

      // Show narrative
      if (res.narrative) {
        const narrativeDiv = el('div', { className: 'card ai-narrative-card' });
        renderMarkdown(narrativeDiv, res.narrative);
        resultArea.appendChild(narrativeDiv);
      }

      toast('Plan created!', 'success');
      // Switch to plans list
      setTimeout(() => { currentTab = 'plans'; renderPlans(container.parentElement); }, 3000);
    } catch (err) {
      resultArea.textContent = '';
      toast('Plan creation error: ' + err.message, 'error');
    }
  });

  container.appendChild(form);
}

function formGroup(label, input) {
  return el('div', { className: 'form-group' }, [
    el('label', { textContent: label }),
    input,
  ]);
}

// ─── EMI Calculator ───
function renderEMICalculator(container) {
  const form = el('form', { className: 'form emi-form' });
  form.appendChild(el('h3', { textContent: '🏦 EMI Calculator' }));
  form.appendChild(formGroup('Loan Amount (₹)', el('input', { type: 'number', name: 'principal', className: 'input', placeholder: 'e.g. 5000000', required: true, min: 1 })));
  form.appendChild(formGroup('Annual Interest Rate (%)', el('input', { type: 'number', name: 'annual_rate', className: 'input', placeholder: 'e.g. 8.5', required: true, min: 0, max: 100, step: 0.1 })));
  form.appendChild(formGroup('Tenure (months)', el('input', { type: 'number', name: 'tenure_months', className: 'input', placeholder: 'e.g. 240', required: true, min: 1, max: 600 })));

  const resultDiv = el('div', { className: 'emi-results' });
  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Calculate' }));
  form.appendChild(resultDiv);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await Api.post('/plans/emi', {
        principal: Number(fd.get('principal')),
        annual_rate: Number(fd.get('annual_rate')),
        tenure_months: Number(fd.get('tenure_months')),
      });
      resultDiv.innerHTML = '';
      resultDiv.appendChild(el('div', { className: 'card' }, [
        el('div', { className: 'emi-stats' }, [
          statItem('Monthly EMI', fmt(res.emi)),
          statItem('Total Payment', fmt(res.total_payment)),
          statItem('Total Interest', fmt(res.total_interest)),
          statItem('Affordable', res.affordability.affordable ? '✅ Yes' : '⚠️ No'),
          statItem('Risk Level', res.affordability.risk_level),
        ]),
      ]));
    } catch (err) {
      toast('EMI calculation error: ' + err.message, 'error');
    }
  });

  container.appendChild(form);
}

// ─── Cash Flow Simulator ───
function renderSimulator(container) {
  const form = el('form', { className: 'form sim-form' });
  form.appendChild(el('h3', { textContent: '📈 Savings Simulator' }));
  form.appendChild(formGroup('Monthly Savings (₹)', el('input', { type: 'number', name: 'monthly_savings', className: 'input', placeholder: 'e.g. 10000', required: true, min: 1 })));
  form.appendChild(formGroup('Duration (months)', el('input', { type: 'number', name: 'months', className: 'input', placeholder: 'e.g. 60', required: true, min: 1, max: 600 })));
  form.appendChild(formGroup('Annual Return Rate (decimal)', el('input', { type: 'number', name: 'annual_return_rate', className: 'input', placeholder: 'e.g. 0.08', step: 0.01, min: 0, max: 1, value: '0.08' })));

  const resultDiv = el('div', { className: 'sim-results' });
  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Simulate' }));
  form.appendChild(resultDiv);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await Api.post('/plans/simulate', {
        monthly_savings: Number(fd.get('monthly_savings')),
        months: Number(fd.get('months')),
        annual_return_rate: Number(fd.get('annual_return_rate')),
      });
      resultDiv.innerHTML = '';
      resultDiv.appendChild(el('div', { className: 'card' }, [
        el('div', { className: 'emi-stats' }, [
          statItem('Total Saved', fmt(res.total_saved)),
          statItem('Contributed', fmt(res.total_contributed)),
          statItem('Interest Earned', fmt(res.total_interest)),
          statItem('Inflation-Adjusted', fmt(res.inflation_adjusted)),
        ]),
      ]));

      // Simple text-based trajectory
      if (res.trajectory?.length > 0) {
        const trajTable = el('table', { className: 'data-table compact' });
        trajTable.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', { textContent: 'Month' }),
            el('th', { textContent: 'Saved' }),
            el('th', { textContent: 'Interest' }),
          ]),
        ]));
        const tbody = el('tbody');
        for (const t of res.trajectory) {
          tbody.appendChild(el('tr', {}, [
            el('td', { textContent: t.month }),
            el('td', { textContent: fmt(t.saved) }),
            el('td', { textContent: fmt(t.interest) }),
          ]));
        }
        trajTable.appendChild(tbody);
        resultDiv.appendChild(el('div', { className: 'card', style: 'margin-top:12px' }, [
          el('h4', { textContent: 'Growth Trajectory' }),
          trajTable,
        ]));
      }
    } catch (err) {
      toast('Simulation error: ' + err.message, 'error');
    }
  });

  container.appendChild(form);
}
