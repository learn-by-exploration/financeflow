// src/services/planning-engine.service.js
// Core financial planning engine — pure math, no AI dependency.
// Handles: cash flow simulation, goal decomposition, scenario generation,
// EMI calculations, tax optimization, what-if analysis.

module.exports = function createPlanningEngine({ db }) {

  // ─── Plan Templates ───
  const PLAN_TEMPLATES = {
    home_purchase: {
      name: 'Home Purchase',
      icon: '🏠',
      components: [
        { name: 'Down Payment', pct: 0.20, description: 'Typically 20% of property value' },
        { name: 'Stamp Duty & Registration', pct: 0.07, description: '5-7% of property value (varies by state)' },
        { name: 'Furnishing & Interiors', pct: 0.05, description: 'Basic furnishing budget' },
        { name: 'Emergency Buffer', pct: 0.03, description: '3 months EMI as safety net' },
        { name: 'Moving Costs', pct: 0.01, description: 'Movers, utility deposits, etc.' },
      ],
      tips: [
        'Section 80C: Deduct up to ₹1.5L/yr on principal repayment',
        'Section 24(b): Deduct up to ₹2L/yr on home loan interest',
        'Consider stamp duty deduction under Section 80C',
      ],
    },
    vehicle: {
      name: 'Vehicle Purchase',
      icon: '🚗',
      components: [
        { name: 'Down Payment', pct: 0.20, description: '20% recommended (20/4/10 rule)' },
        { name: 'Insurance (1st Year)', pct: 0.04, description: 'Comprehensive insurance' },
        { name: 'Registration & RTO', pct: 0.03, description: 'Road tax and registration fees' },
        { name: 'Accessories', pct: 0.02, description: 'Essential accessories' },
      ],
      tips: [
        '20/4/10 Rule: 20% down, max 4-year loan, total cost < 10% of gross income',
        'Compare on-road price across dealers before committing',
      ],
    },
    wedding: {
      name: 'Wedding',
      icon: '💒',
      components: [
        { name: 'Venue & Catering', pct: 0.35, description: 'Largest expense typically' },
        { name: 'Jewelry & Gifts', pct: 0.25, description: 'Gold, gifts for family' },
        { name: 'Clothing & Styling', pct: 0.10, description: 'Outfits for ceremonies' },
        { name: 'Decor & Photography', pct: 0.10, description: 'Decorations, photo/video' },
        { name: 'Travel & Stay', pct: 0.08, description: 'Guest accommodation, transport' },
        { name: 'Miscellaneous', pct: 0.12, description: 'Buffer for unexpected costs' },
      ],
      tips: [
        'Consider gold SGBs (Sovereign Gold Bonds) for jewelry — tax-free after 8 years',
        'Book venue 6-12 months ahead for better rates',
      ],
    },
    education: {
      name: 'Education',
      icon: '🎓',
      components: [
        { name: 'Tuition Fees', pct: 0.60, description: 'Course fees over duration' },
        { name: 'Living Expenses', pct: 0.20, description: 'Accommodation, food, transport' },
        { name: 'Books & Materials', pct: 0.05, description: 'Study materials' },
        { name: 'Application & Exam Fees', pct: 0.03, description: 'Entrance exams, applications' },
        { name: 'Buffer', pct: 0.12, description: 'For forex fluctuation (abroad) or inflation' },
      ],
      tips: [
        'Section 80E: Deduct interest on education loan (no upper limit) for 8 years',
        'Section 80C: Children tuition fees up to ₹1.5L/yr',
        'Start an SIP early — even ₹5K/month compounds significantly over 10+ years',
      ],
    },
    retirement: {
      name: 'Retirement',
      icon: '🏖️',
      components: [
        { name: 'Retirement Corpus', pct: 0.70, description: 'Core fund for monthly expenses' },
        { name: 'Healthcare Reserve', pct: 0.15, description: 'Medical expenses fund' },
        { name: 'Travel & Hobbies', pct: 0.10, description: 'Post-retirement lifestyle' },
        { name: 'Emergency Buffer', pct: 0.05, description: 'Unexpected expenses' },
      ],
      tips: [
        'NPS: Additional ₹50K deduction under 80CCD(1B) beyond 80C limit',
        'EPF + PPF for risk-free corpus building',
        'Rule of 25: Retirement corpus = 25x annual expenses',
        'Healthcare costs increase ~12-15% annually — plan accordingly',
      ],
    },
    emergency_fund: {
      name: 'Emergency Fund',
      icon: '🛡️',
      components: [
        { name: 'Core Emergency Fund', pct: 1.0, description: 'Target: 3-6 months of expenses' },
      ],
      tips: [
        'Keep in high-liquidity instruments: savings account, liquid funds, or FD',
        'Start with 1 month, then build to 3, then 6',
      ],
    },
    travel: {
      name: 'Travel',
      icon: '✈️',
      components: [
        { name: 'Flights/Transport', pct: 0.30, description: 'Travel tickets' },
        { name: 'Accommodation', pct: 0.30, description: 'Hotels, Airbnb' },
        { name: 'Food & Activities', pct: 0.25, description: 'Dining, experiences' },
        { name: 'Shopping & Misc', pct: 0.15, description: 'Souvenirs, tips, insurance' },
      ],
      tips: [
        'Book flights 2-3 months ahead for best prices',
        'Budget in local currency to avoid forex surprises',
      ],
    },
    business: {
      name: 'Start a Business',
      icon: '💼',
      components: [
        { name: 'Setup & Registration', pct: 0.05, description: 'Legal, registration, licenses' },
        { name: 'Equipment & Inventory', pct: 0.30, description: 'Initial inventory/equipment' },
        { name: 'Marketing & Branding', pct: 0.15, description: 'Website, logo, initial marketing' },
        { name: 'Runway (6 months)', pct: 0.40, description: 'Operating expenses before revenue' },
        { name: 'Buffer', pct: 0.10, description: 'Unexpected costs' },
      ],
      tips: [
        'Keep 6 months personal expenses separate from business fund',
        'Start lean — validate before scaling',
      ],
    },
    debt_payoff: {
      name: 'Debt Payoff',
      icon: '💳',
      components: [
        { name: 'Total Debt Principal', pct: 1.0, description: 'Outstanding debt balance' },
      ],
      tips: [
        'Avalanche method: Pay highest interest rate first (saves most money)',
        'Snowball method: Pay smallest balance first (builds momentum)',
        'Never pay just minimums on credit cards — 36% APR destroys wealth',
      ],
    },
    custom: {
      name: 'Custom Goal',
      icon: '🎯',
      components: [
        { name: 'Target Amount', pct: 1.0, description: 'Your custom goal amount' },
      ],
      tips: [],
    },
  };

  // ─── Financial Snapshot ───
  function getUserFinancialSnapshot(userId) {
    // Income & expenses (last 6 months, monthly averages)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const fromDate = sixMonthsAgo.toISOString().slice(0, 10);

    const incomeData = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total,
        COUNT(DISTINCT strftime('%Y-%m', date)) as months
      FROM transactions WHERE user_id = ? AND type = 'income' AND date >= ?
    `).get(userId, fromDate);

    const expenseData = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions WHERE user_id = ? AND type = 'expense' AND date >= ?
    `).get(userId, fromDate);

    const months = Math.max(1, incomeData.months);
    const avgMonthlyIncome = Math.round(incomeData.total / months);
    const avgMonthlyExpense = Math.round(expenseData.total / months);
    const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpense;

    // Account balances
    const accounts = db.prepare(
      'SELECT * FROM accounts WHERE user_id = ? AND is_active = 1'
    ).all(userId);

    let totalAssets = 0, totalLiabilities = 0, totalSavingsBalance = 0;
    for (const a of accounts) {
      if (a.type === 'credit_card' || a.type === 'loan') {
        totalLiabilities += Math.abs(a.balance);
      } else {
        totalAssets += a.balance;
        if (a.type === 'savings') totalSavingsBalance += a.balance;
      }
    }

    // Recurring expenses (committed monthly outflow)
    const recurringMonthly = db.prepare(`
      SELECT COALESCE(SUM(CASE
        WHEN frequency = 'monthly' THEN amount
        WHEN frequency = 'weekly' THEN amount * 4.33
        WHEN frequency = 'biweekly' THEN amount * 2.17
        WHEN frequency = 'quarterly' THEN amount / 3
        WHEN frequency = 'yearly' THEN amount / 12
        ELSE amount
      END), 0) as total
      FROM recurring_rules WHERE user_id = ? AND is_active = 1 AND type = 'expense'
    `).get(userId).total;

    // Existing goals
    const existingGoals = db.prepare(
      'SELECT * FROM savings_goals WHERE user_id = ? AND is_completed = 0'
    ).all(userId);
    const totalGoalAllocations = existingGoals.reduce((sum, g) => sum + (g.auto_allocate_percent || 0), 0);

    // Top spending categories (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const topCategories = db.prepare(`
      SELECT c.name, c.id, SUM(t.amount) as total,
        ROUND(SUM(t.amount) / 3) as monthly_avg
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ?
      GROUP BY c.id ORDER BY total DESC LIMIT 10
    `).all(userId, threeMonthsAgo.toISOString().slice(0, 10));

    // Income setting
    const incomeSetting = db.prepare(
      "SELECT value FROM settings WHERE user_id = ? AND key = 'monthly_income'"
    ).get(userId);

    return {
      avgMonthlyIncome: incomeSetting ? Math.max(avgMonthlyIncome, Number(incomeSetting.value)) : avgMonthlyIncome,
      avgMonthlyExpense,
      avgMonthlySavings: Math.max(0, avgMonthlySavings),
      totalAssets,
      totalLiabilities,
      totalSavingsBalance,
      netWorth: totalAssets - totalLiabilities,
      recurringMonthly: Math.round(recurringMonthly),
      disposableIncome: Math.max(0, avgMonthlyIncome - avgMonthlyExpense),
      existingGoals,
      totalGoalAllocations,
      topCategories,
      accounts,
    };
  }

  // ─── Cash Flow Simulation ───
  function simulateCashFlow({ monthlySavings, months, annualReturnRate = 0, inflationRate = 0.06 }) {
    let accumulated = 0;
    const trajectory = [];
    const monthlyReturn = annualReturnRate / 12;

    for (let m = 1; m <= months; m++) {
      accumulated = accumulated * (1 + monthlyReturn) + monthlySavings;
      trajectory.push({
        month: m,
        saved: Math.round(accumulated),
        contributed: monthlySavings * m,
        interest: Math.round(accumulated - monthlySavings * m),
      });
    }

    const inflationAdjusted = Math.round(accumulated / Math.pow(1 + inflationRate, months / 12));

    return {
      totalSaved: Math.round(accumulated),
      totalContributed: monthlySavings * months,
      totalInterest: Math.round(accumulated - monthlySavings * months),
      inflationAdjusted,
      trajectory,
    };
  }

  // ─── EMI Calculator ───
  function calculateEMI({ principal, annualRate, tenureMonths }) {
    if (annualRate === 0) return Math.round(principal / tenureMonths);
    const r = annualRate / 12 / 100;
    const emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
    return Math.round(emi);
  }

  function emiAffordability(userId, emiAmount) {
    const snapshot = getUserFinancialSnapshot(userId);
    const disposable = snapshot.disposableIncome;
    const ratio = disposable > 0 ? emiAmount / disposable : Infinity;
    return {
      disposable_income: disposable,
      proposed_emi: emiAmount,
      emi_to_disposable_ratio: Math.round(ratio * 100) / 100,
      affordable: ratio <= 0.5,
      risk_level: ratio <= 0.3 ? 'low' : ratio <= 0.5 ? 'moderate' : 'high',
      remaining_after_emi: disposable - emiAmount,
    };
  }

  // ─── Scenario Generation ───
  function generateScenarios({ targetAmount, currentSaved, targetDate, snapshot, inflationRate = 0.06 }) {
    const now = new Date();
    const target = targetDate ? new Date(targetDate + 'T00:00:00Z') : null;
    const maxMonths = target ? Math.max(1, Math.ceil((target - now) / (30.44 * 86400000))) : 60;
    const remaining = Math.max(0, targetAmount - currentSaved);
    const inflationAdjustedTarget = Math.round(targetAmount * Math.pow(1 + inflationRate, maxMonths / 12));

    const scenarios = {};
    const configs = {
      conservative: { returnRate: 0.05, savingsMultiplier: 0.6, label: 'Conservative' },
      moderate:     { returnRate: 0.08, savingsMultiplier: 0.8, label: 'Moderate' },
      aggressive:   { returnRate: 0.12, savingsMultiplier: 1.0, label: 'Aggressive' },
    };

    for (const [key, cfg] of Object.entries(configs)) {
      // Calculate monthly savings needed
      const monthlyReturn = cfg.returnRate / 12;
      let monthlySavings;
      if (monthlyReturn === 0) {
        monthlySavings = remaining / maxMonths;
      } else {
        // PMT formula: how much per month to reach remaining in maxMonths
        monthlySavings = remaining * monthlyReturn / (Math.pow(1 + monthlyReturn, maxMonths) - 1);
      }

      const sim = simulateCashFlow({
        monthlySavings: Math.round(monthlySavings),
        months: maxMonths,
        annualReturnRate: cfg.returnRate,
        inflationRate,
      });

      // Calculate duration if using a fraction of disposable income
      const affordableMonthlySavings = Math.round(snapshot.disposableIncome * cfg.savingsMultiplier);
      let durationAtAffordable = maxMonths;
      if (affordableMonthlySavings > 0 && monthlyReturn > 0) {
        // How many months to reach remaining at affordable savings rate
        durationAtAffordable = Math.ceil(
          Math.log((remaining * monthlyReturn / affordableMonthlySavings) + 1) / Math.log(1 + monthlyReturn)
        );
      } else if (affordableMonthlySavings > 0) {
        durationAtAffordable = Math.ceil(remaining / affordableMonthlySavings);
      }

      // Generate action items
      const actions = generateActionItems(snapshot, monthlySavings, key);

      scenarios[key] = {
        scenario_type: key,
        label: cfg.label,
        monthly_savings: Math.round(monthlySavings),
        duration_months: maxMonths,
        duration_at_affordable: Math.min(durationAtAffordable, 600),
        affordable_monthly: affordableMonthlySavings,
        total_saved: sim.totalSaved,
        total_interest: sim.totalInterest,
        inflation_adjusted_target: inflationAdjustedTarget,
        assumed_return_rate: cfg.returnRate,
        assumed_inflation_rate: inflationRate,
        feasible: monthlySavings <= snapshot.disposableIncome,
        actions,
      };
    }

    return scenarios;
  }

  // ─── Action Item Generation ───
  function generateActionItems(snapshot, targetMonthlySavings, scenarioType) {
    const actions = [];
    const gap = targetMonthlySavings - snapshot.avgMonthlySavings;

    if (gap <= 0) {
      actions.push({
        type: 'positive',
        text: `You already save ₹${snapshot.avgMonthlySavings}/month — enough for this plan!`,
      });
      return actions;
    }

    actions.push({
      type: 'info',
      text: `You need to save ₹${Math.round(targetMonthlySavings)}/month. Current savings: ₹${snapshot.avgMonthlySavings}/month. Gap: ₹${Math.round(gap)}/month.`,
    });

    // Suggest cuts from top discretionary categories
    const discretionary = ['Dining', 'Entertainment', 'Shopping', 'Subscriptions', 'Travel', 'Food Delivery'];
    let potentialSavings = 0;
    for (const cat of snapshot.topCategories) {
      if (discretionary.some(d => cat.name.toLowerCase().includes(d.toLowerCase())) && potentialSavings < gap) {
        const cutPct = scenarioType === 'aggressive' ? 0.40 : scenarioType === 'moderate' ? 0.25 : 0.15;
        const savings = Math.round(cat.monthly_avg * cutPct);
        if (savings >= 200) {
          actions.push({
            type: 'cut',
            category: cat.name,
            category_id: cat.id,
            current_monthly: cat.monthly_avg,
            suggested_cut: savings,
            cut_percentage: Math.round(cutPct * 100),
            text: `Reduce ${cat.name} by ${Math.round(cutPct * 100)}%: save ₹${savings}/month`,
          });
          potentialSavings += savings;
        }
      }
    }

    if (potentialSavings < gap) {
      actions.push({
        type: 'income',
        text: `Consider increasing income by ~₹${Math.round(gap - potentialSavings)}/month (freelancing, side projects, raise negotiation)`,
      });
    }

    return actions;
  }

  // ─── Milestone Generation ───
  function generateMilestones(targetAmount, durationMonths) {
    const milestones = [];
    const intervals = durationMonths <= 6 ? [0.25, 0.50, 0.75, 1.0]
      : durationMonths <= 12 ? [0.10, 0.25, 0.50, 0.75, 1.0]
      : [0.10, 0.25, 0.50, 0.75, 0.90, 1.0];

    for (let i = 0; i < intervals.length; i++) {
      const pct = intervals[i];
      const amount = Math.round(targetAmount * pct);
      const monthAt = Math.round(durationMonths * pct);
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + monthAt);

      milestones.push({
        title: pct === 1.0 ? '🎉 Goal Complete!' : `${Math.round(pct * 100)}% — ₹${amount.toLocaleString('en-IN')}`,
        target_amount: amount,
        target_date: targetDate.toISOString().slice(0, 10),
        position: i,
      });
    }

    return milestones;
  }

  // ─── Tax-Aware Suggestions (India) ───
  function getTaxSuggestions(goalType, targetAmount, snapshot) {
    const suggestions = [];
    const income = snapshot.avgMonthlyIncome * 12;

    // Check existing 80C usage
    const existing80C = snapshot.existingGoals
      .filter(g => g.name && (g.name.toLowerCase().includes('ppf') || g.name.toLowerCase().includes('elss')))
      .reduce((sum, g) => sum + (g.current_amount || 0), 0);
    const remaining80C = Math.max(0, 150000 - existing80C);

    if (goalType === 'home_purchase') {
      suggestions.push({
        section: '80C',
        benefit: 'Up to ₹1.5L deduction on home loan principal',
        remaining_limit: remaining80C,
        tax_saved: Math.round(Math.min(remaining80C, 150000) * 0.30),
      });
      suggestions.push({
        section: '24(b)',
        benefit: 'Up to ₹2L deduction on home loan interest',
        remaining_limit: 200000,
        tax_saved: Math.round(200000 * 0.30),
      });
      if (income > 0) {
        const stampDuty = Math.round(targetAmount * 0.06);
        suggestions.push({
          section: '80C (Stamp Duty)',
          benefit: `Stamp duty (~₹${stampDuty.toLocaleString('en-IN')}) deductible in year of purchase`,
          remaining_limit: remaining80C,
          tax_saved: Math.round(Math.min(stampDuty, remaining80C) * 0.30),
        });
      }
    }

    if (goalType === 'education') {
      suggestions.push({
        section: '80E',
        benefit: 'Education loan interest — full deduction, no upper limit, for 8 years',
        remaining_limit: null,
        tax_saved: null,
        note: 'Claim starts from year of first interest payment',
      });
      suggestions.push({
        section: '80C (Tuition)',
        benefit: "Children's tuition fees — up to ₹1.5L under 80C",
        remaining_limit: remaining80C,
        tax_saved: Math.round(Math.min(remaining80C, 150000) * 0.30),
      });
    }

    if (goalType === 'retirement') {
      suggestions.push({
        section: '80CCD(1B)',
        benefit: 'NPS — additional ₹50K deduction beyond 80C',
        remaining_limit: 50000,
        tax_saved: Math.round(50000 * 0.30),
      });
      suggestions.push({
        section: '80C',
        benefit: 'PPF, ELSS, EPF — up to ₹1.5L combined',
        remaining_limit: remaining80C,
        tax_saved: Math.round(Math.min(remaining80C, 150000) * 0.30),
      });
    }

    // Universal suggestions
    if (remaining80C > 0) {
      suggestions.push({
        section: '80C',
        benefit: `You have ₹${remaining80C.toLocaleString('en-IN')} unused under 80C. Consider ELSS for tax-saving with equity returns.`,
        remaining_limit: remaining80C,
        tax_saved: Math.round(remaining80C * 0.30),
      });
    }

    suggestions.push({
      section: '80D',
      benefit: 'Health insurance premium — ₹25K (self) + ₹25K (parents) deduction',
      remaining_limit: 50000,
      tax_saved: Math.round(50000 * 0.30),
      note: 'Not directly related to this goal, but reduces overall tax outflow',
    });

    return suggestions;
  }

  // ─── What-If Simulator ───
  function whatIf({ planId, userId, adjustments }) {
    const plan = db.prepare('SELECT * FROM financial_plans WHERE id = ? AND user_id = ?').get(planId, userId);
    if (!plan) return null;

    const snapshot = getUserFinancialSnapshot(userId);
    const base = {
      targetAmount: plan.target_amount,
      currentSaved: plan.current_saved,
      targetDate: plan.target_date,
      snapshot,
    };

    // Apply adjustments
    if (adjustments.income_change) {
      snapshot.avgMonthlyIncome += adjustments.income_change;
      snapshot.disposableIncome = Math.max(0, snapshot.avgMonthlyIncome - snapshot.avgMonthlyExpense);
      snapshot.avgMonthlySavings = Math.max(0, snapshot.disposableIncome);
    }
    if (adjustments.expense_cut) {
      snapshot.avgMonthlyExpense -= adjustments.expense_cut;
      snapshot.disposableIncome = Math.max(0, snapshot.avgMonthlyIncome - snapshot.avgMonthlyExpense);
      snapshot.avgMonthlySavings = Math.max(0, snapshot.disposableIncome);
    }
    if (adjustments.target_amount) {
      base.targetAmount = adjustments.target_amount;
    }
    if (adjustments.target_date) {
      base.targetDate = adjustments.target_date;
    }
    if (adjustments.lump_sum) {
      base.currentSaved += adjustments.lump_sum;
    }

    const scenarios = generateScenarios(base);

    return {
      adjustments,
      original_target: plan.target_amount,
      adjusted_target: base.targetAmount,
      scenarios,
    };
  }

  // ─── Full Plan Generation ───
  function generatePlan(userId, { goalType, targetAmount, targetDate, riskTolerance, constraints }) {
    const snapshot = getUserFinancialSnapshot(userId);
    const template = PLAN_TEMPLATES[goalType] || PLAN_TEMPLATES.custom;

    // Decompose goal into components
    const components = template.components.map(c => ({
      ...c,
      amount: Math.round(targetAmount * c.pct),
    }));

    // Generate scenarios
    const scenarios = generateScenarios({
      targetAmount,
      currentSaved: 0,
      targetDate,
      snapshot,
      inflationRate: constraints?.inflation_rate || 0.06,
    });

    // Pick scenario based on risk tolerance
    const selectedScenario = scenarios[riskTolerance || 'moderate'];

    // Generate milestones
    const milestones = generateMilestones(targetAmount, selectedScenario.duration_months);

    // Tax suggestions
    const taxSuggestions = getTaxSuggestions(goalType, targetAmount, snapshot);

    // EMI analysis (for home/vehicle)
    let emiAnalysis = null;
    if (['home_purchase', 'vehicle'].includes(goalType)) {
      const loanAmount = Math.round(targetAmount * 0.80);
      const rate = goalType === 'home_purchase' ? 8.5 : 9.5;
      const tenure = goalType === 'home_purchase' ? 240 : 60;
      const emi = calculateEMI({ principal: loanAmount, annualRate: rate, tenureMonths: tenure });
      emiAnalysis = {
        loan_amount: loanAmount,
        interest_rate: rate,
        tenure_months: tenure,
        emi,
        total_payment: emi * tenure,
        total_interest: emi * tenure - loanAmount,
        affordability: emiAffordability(userId, emi),
      };
    }

    return {
      template,
      snapshot: {
        avgMonthlyIncome: snapshot.avgMonthlyIncome,
        avgMonthlyExpense: snapshot.avgMonthlyExpense,
        avgMonthlySavings: snapshot.avgMonthlySavings,
        disposableIncome: snapshot.disposableIncome,
        totalAssets: snapshot.totalAssets,
        totalLiabilities: snapshot.totalLiabilities,
        netWorth: snapshot.netWorth,
      },
      components,
      scenarios,
      selectedScenario,
      milestones,
      taxSuggestions,
      emiAnalysis,
      tips: template.tips,
    };
  }

  // ─── Plan Progress Check ───
  function checkPlanProgress(planId, userId) {
    const plan = db.prepare('SELECT * FROM financial_plans WHERE id = ? AND user_id = ?').get(planId, userId);
    if (!plan) return null;

    const milestones = db.prepare(
      'SELECT * FROM plan_milestones WHERE plan_id = ? ORDER BY position'
    ).all(planId);

    // Check linked goal progress
    let goalProgress = null;
    if (plan.linked_goal_id) {
      const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(plan.linked_goal_id);
      if (goal) {
        goalProgress = {
          current_amount: goal.current_amount,
          target_amount: goal.target_amount,
          progress_pct: Math.round(goal.current_amount / goal.target_amount * 100),
        };
      }
    }

    const pct = plan.target_amount > 0 ? plan.current_saved / plan.target_amount : 0;

    // Time progress
    let timeProgressPct = 0;
    if (plan.target_date) {
      const created = new Date(plan.created_at);
      const target = new Date(plan.target_date + 'T00:00:00Z');
      const now = new Date();
      const totalDays = Math.max(1, (target - created) / 86400000);
      const elapsed = (now - created) / 86400000;
      timeProgressPct = Math.min(100, Math.round(elapsed / totalDays * 100));
    }

    // Determine if on track
    const isAhead = pct * 100 > timeProgressPct;
    const isBehind = pct * 100 < timeProgressPct * 0.8;

    return {
      plan,
      milestones,
      goalProgress,
      progress_pct: Math.round(pct * 100),
      time_progress_pct: timeProgressPct,
      status: isAhead ? 'ahead' : isBehind ? 'behind' : 'on_track',
      remaining: Math.max(0, plan.target_amount - plan.current_saved),
    };
  }

  return {
    PLAN_TEMPLATES,
    getUserFinancialSnapshot,
    simulateCashFlow,
    calculateEMI,
    emiAffordability,
    generateScenarios,
    generateMilestones,
    getTaxSuggestions,
    whatIf,
    generatePlan,
    checkPlanProgress,
    generateActionItems,
  };
};
