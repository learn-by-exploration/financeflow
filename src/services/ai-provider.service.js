// src/services/ai-provider.service.js
// AI provider abstraction: supports template (no LLM), ollama (local), and openai-compatible APIs.
// Template mode generates narratives via string interpolation — always available, deterministic.
// LLM modes send structured prompts and return AI-generated narratives.

const config = require('../config');

module.exports = function createAIProvider() {

  // Resolve effective AI config: user settings override global config
  function resolveConfig(userSettings) {
    const us = userSettings || {};
    return {
      provider: us.ai_provider || config.ai.provider,
      endpoint: us.ai_endpoint || config.ai.endpoint,
      model: us.ai_model || config.ai.model,
      apiKey: us.ai_api_key || config.ai.apiKey,
      maxTokens: config.ai.maxTokens,
      timeoutMs: config.ai.timeoutMs,
    };
  }

  // ─── Template Narratives (No LLM Required) ───
  function templateNarrative(planData) {
    const { name, goalType, targetAmount, currentSaved, scenarios, snapshot, milestones, taxSuggestions, emiAnalysis, tips, components } = planData;
    const selected = scenarios.moderate || scenarios.conservative || Object.values(scenarios)[0];
    if (!selected) return 'Unable to generate narrative — no scenario data available.';

    const currency = '₹';
    const fmt = n => `${currency}${Number(n).toLocaleString('en-IN')}`;

    const lines = [];
    lines.push(`## Your ${name || goalType} Plan\n`);

    // Situation summary
    lines.push(`**Your Financial Snapshot:**`);
    if (snapshot) {
      lines.push(`- Monthly income: ${fmt(snapshot.avgMonthlyIncome)}`);
      lines.push(`- Monthly expenses: ${fmt(snapshot.avgMonthlyExpense)}`);
      lines.push(`- Disposable income: ${fmt(snapshot.disposableIncome)}/month`);
      lines.push(`- Net worth: ${fmt(snapshot.netWorth)}\n`);
    }

    // Goal breakdown
    lines.push(`**Goal:** ${fmt(targetAmount)} for ${name || goalType}`);
    if (currentSaved > 0) {
      lines.push(`**Already saved:** ${fmt(currentSaved)} (${Math.round(currentSaved / targetAmount * 100)}%)`);
    }
    lines.push('');

    // Components
    if (components && components.length > 1) {
      lines.push('**Cost Breakdown:**');
      for (const c of components) {
        lines.push(`- ${c.name}: ${fmt(c.amount)} — ${c.description}`);
      }
      lines.push('');
    }

    // Scenarios
    lines.push('**Savings Scenarios:**');
    for (const [key, sc] of Object.entries(scenarios)) {
      const feasibility = sc.feasible ? '✅ Feasible' : '⚠️ Stretch';
      lines.push(`- **${sc.label}** (${Math.round(sc.assumed_return_rate * 100)}% return): Save ${fmt(sc.monthly_savings)}/month for ${sc.duration_months} months → ${fmt(sc.total_saved)} (${feasibility})`);
    }
    lines.push('');

    // Recommended approach
    if (selected.feasible) {
      lines.push(`**Recommended:** The ${selected.label} plan requires ${fmt(selected.monthly_savings)}/month — that's ${Math.round(selected.monthly_savings / (snapshot?.disposableIncome || 1) * 100)}% of your disposable income.\n`);
    } else {
      lines.push(`**Note:** Even the recommended plan requires ${fmt(selected.monthly_savings)}/month, which exceeds your current disposable income. Consider extending the timeline or reducing the target.\n`);
    }

    // Action items
    if (selected.actions && selected.actions.length > 0) {
      lines.push('**Action Steps:**');
      for (const a of selected.actions) {
        lines.push(`- ${a.text}`);
      }
      lines.push('');
    }

    // EMI analysis
    if (emiAnalysis) {
      lines.push('**Loan Analysis:**');
      lines.push(`- Loan amount: ${fmt(emiAnalysis.loan_amount)} at ${emiAnalysis.interest_rate}% for ${Math.round(emiAnalysis.tenure_months / 12)} years`);
      lines.push(`- EMI: ${fmt(emiAnalysis.emi)}/month`);
      lines.push(`- Total interest: ${fmt(emiAnalysis.total_interest)}`);
      lines.push(`- Affordability: ${emiAnalysis.affordability.risk_level} risk (${Math.round(emiAnalysis.affordability.emi_to_disposable_ratio * 100)}% of disposable income)\n`);
    }

    // Tax
    if (taxSuggestions && taxSuggestions.length > 0) {
      lines.push('**Tax Benefits:**');
      for (const t of taxSuggestions) {
        const saved = t.tax_saved ? ` — potential savings: ${fmt(t.tax_saved)}/year` : '';
        lines.push(`- **Section ${t.section}:** ${t.benefit}${saved}`);
      }
      lines.push('');
    }

    // Milestones
    if (milestones && milestones.length > 0) {
      lines.push('**Milestones:**');
      for (const m of milestones) {
        lines.push(`- ${m.title} by ${m.target_date}`);
      }
      lines.push('');
    }

    // Tips
    if (tips && tips.length > 0) {
      lines.push('**Tips:**');
      for (const t of tips) {
        lines.push(`- ${t}`);
      }
    }

    return lines.join('\n');
  }

  // ─── LLM Prompt Builder ───
  function buildPrompt(planData, userMessage) {
    const { goalType, targetAmount, snapshot, scenarios, taxSuggestions } = planData;
    const selected = scenarios?.moderate || scenarios?.conservative || {};

    return `You are a friendly, expert Indian financial planner. The user is planning for: ${goalType}.

FINANCIAL CONTEXT (use these EXACT numbers — do not make up amounts):
- Target: ₹${targetAmount?.toLocaleString('en-IN')}
- Monthly income: ₹${snapshot?.avgMonthlyIncome?.toLocaleString('en-IN')}
- Monthly expenses: ₹${snapshot?.avgMonthlyExpense?.toLocaleString('en-IN')}
- Disposable income: ₹${snapshot?.disposableIncome?.toLocaleString('en-IN')}/month
- Net worth: ₹${snapshot?.netWorth?.toLocaleString('en-IN')}
- Recommended monthly savings: ₹${selected?.monthly_savings?.toLocaleString('en-IN')}
- Plan duration: ${selected?.duration_months} months

RULES:
1. Use ONLY the numbers above. Never invent or round amounts.
2. Keep Indian tax context (80C, 80D, 24b, NPS, ELSS, PPF, etc.).
3. Be encouraging but realistic.
4. Use ₹ with Indian number formatting.
5. Keep response under 500 words.
6. Do NOT give investment-specific buy/sell recommendations — suggest categories only.

USER MESSAGE: ${userMessage || 'Generate an overview of my financial plan.'}`;
  }

  // ─── Ollama Provider ───
  async function callOllama(prompt, aiCfg) {
    const endpoint = `${aiCfg.endpoint}/api/generate`;
    const model = aiCfg.model || 'llama3';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), aiCfg.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama responded with ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return {
        text: data.response || '',
        provider: 'ollama',
        model,
        tokens_used: data.eval_count || 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── OpenAI-Compatible Provider ───
  async function callOpenAI(prompt, aiCfg) {
    const endpoint = aiCfg.endpoint.includes('/v1/')
      ? aiCfg.endpoint
      : `${aiCfg.endpoint}/v1/chat/completions`;
    const model = aiCfg.model || 'gpt-3.5-turbo';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), aiCfg.timeoutMs);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (aiCfg.apiKey) {
        headers['Authorization'] = `Bearer ${aiCfg.apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: aiCfg.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API responded with ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return {
        text: data.choices?.[0]?.message?.content || '',
        provider: 'openai',
        model,
        tokens_used: data.usage?.total_tokens || 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Main Interface ───
  async function generateNarrative(planData, userMessage, userSettings) {
    const aiCfg = resolveConfig(userSettings);
    const provider = aiCfg.provider;

    if (provider === 'template' || !provider) {
      return {
        text: templateNarrative(planData),
        provider: 'template',
        model: 'template-v1',
        tokens_used: 0,
      };
    }

    const prompt = buildPrompt(planData, userMessage);

    if (provider === 'ollama') {
      return callOllama(prompt, aiCfg);
    }

    if (provider === 'openai') {
      return callOpenAI(prompt, aiCfg);
    }

    // Fallback to template
    return {
      text: templateNarrative(planData),
      provider: 'template',
      model: 'template-v1-fallback',
      tokens_used: 0,
    };
  }

  async function chat(planData, conversationHistory, userSettings) {
    const aiCfg = resolveConfig(userSettings);
    const provider = aiCfg.provider;
    const lastMessage = conversationHistory[conversationHistory.length - 1]?.content || '';

    if (provider === 'template' || !provider) {
      // Template chat — respond to common questions
      return {
        text: templateChatResponse(planData, lastMessage),
        provider: 'template',
        model: 'template-v1',
        tokens_used: 0,
      };
    }

    const systemPrompt = buildPrompt(planData, '');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    ];

    if (provider === 'ollama') {
      const fullPrompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      return callOllama(fullPrompt, aiCfg);
    }

    if (provider === 'openai') {
      const endpoint = aiCfg.endpoint.includes('/v1/')
        ? aiCfg.endpoint
        : `${aiCfg.endpoint}/v1/chat/completions`;
      const model = aiCfg.model || 'gpt-3.5-turbo';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), aiCfg.timeoutMs);

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (aiCfg.apiKey) headers['Authorization'] = `Bearer ${aiCfg.apiKey}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages, max_tokens: aiCfg.maxTokens }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Chat API error: ${response.status}`);
        const data = await response.json();
        return {
          text: data.choices?.[0]?.message?.content || '',
          provider: 'openai',
          model,
          tokens_used: data.usage?.total_tokens || 0,
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    return { text: templateChatResponse(planData, lastMessage), provider: 'template', model: 'template-v1-fallback', tokens_used: 0 };
  }

  // ─── Template Chat Responses ───
  function templateChatResponse(planData, question) {
    const q = question.toLowerCase();
    const fmt = n => `₹${Number(n).toLocaleString('en-IN')}`;
    const selected = planData.scenarios?.moderate || {};

    if ((q.includes('afford') || q.includes('can i')) && !q.includes('cut') && !q.includes('reduce') && !q.includes('save more')) {
      if (selected.feasible) {
        return `Based on your disposable income of ${fmt(planData.snapshot?.disposableIncome)}/month, the moderate plan at ${fmt(selected.monthly_savings)}/month looks feasible. That uses ${Math.round((selected.monthly_savings / (planData.snapshot?.disposableIncome || 1)) * 100)}% of your disposable income.`;
      }
      return `The required ${fmt(selected.monthly_savings)}/month exceeds your current disposable income of ${fmt(planData.snapshot?.disposableIncome)}. Consider extending your timeline or reducing the target amount.`;
    }

    if (q.includes('tax') || q.includes('80c') || q.includes('deduct')) {
      if (planData.taxSuggestions?.length > 0) {
        return 'Tax benefits available:\n' + planData.taxSuggestions.map(t =>
          `- Section ${t.section}: ${t.benefit}${t.tax_saved ? ` (saves ~${fmt(t.tax_saved)}/yr)` : ''}`
        ).join('\n');
      }
      return 'No specific tax benefits identified for this goal type. Consider general 80C instruments like ELSS or PPF.';
    }

    if (q.includes('emi') || q.includes('loan')) {
      if (planData.emiAnalysis) {
        return `Loan amount: ${fmt(planData.emiAnalysis.loan_amount)} at ${planData.emiAnalysis.interest_rate}% → EMI: ${fmt(planData.emiAnalysis.emi)}/month for ${Math.round(planData.emiAnalysis.tenure_months / 12)} years. Risk level: ${planData.emiAnalysis.affordability.risk_level}.`;
      }
      return 'No loan/EMI analysis has been configured for this plan type.';
    }

    if (q.includes('cut') || q.includes('save more') || q.includes('reduce')) {
      const actions = selected.actions?.filter(a => a.type === 'cut') || [];
      if (actions.length > 0) {
        return 'Here are some spending cuts I recommend:\n' + actions.map(a => `- ${a.text}`).join('\n');
      }
      return 'Your current spending looks efficient. Consider focusing on income growth instead.';
    }

    if (q.includes('milestone') || q.includes('progress') || q.includes('track')) {
      if (planData.milestones?.length > 0) {
        return 'Your milestones:\n' + planData.milestones.map(m => `- ${m.title} by ${m.target_date}`).join('\n');
      }
      return 'No milestones set yet. Create a plan first to see milestone tracking.';
    }

    if (q.includes('aggressive') || q.includes('fast')) {
      const agg = planData.scenarios?.aggressive;
      if (agg) {
        return `Aggressive plan: Save ${fmt(agg.monthly_savings)}/month at ${Math.round(agg.assumed_return_rate * 100)}% returns. Duration: ${agg.duration_months} months. ${agg.feasible ? 'Feasible with your current income.' : 'Would require additional income.'}`;
      }
    }

    if (q.includes('conservative') || q.includes('safe')) {
      const con = planData.scenarios?.conservative;
      if (con) {
        return `Conservative plan: Save ${fmt(con.monthly_savings)}/month at ${Math.round(con.assumed_return_rate * 100)}% returns. Duration: ${con.duration_months} months. ${con.feasible ? 'Feasible.' : 'Tight — consider a longer timeline.'}`;
      }
    }

    // Default
    return `Your ${planData.name || planData.goalType} plan targets ${fmt(planData.targetAmount)} with ${fmt(selected.monthly_savings)}/month in the moderate scenario over ${selected.duration_months} months. Ask me about taxes, EMI, milestones, or savings strategies!`;
  }

  return {
    generateNarrative,
    chat,
    templateNarrative,
    buildPrompt,
    templateChatResponse,
  };
};
