/**
 * Financial health scoring, ratio calculations, and interpretation.
 */
module.exports = function createHealthService() {

  function calculateRatios({ savingsBalance, avgMonthlyExpense, avgMonthlyIncome, liabilities }) {
    const emergencyFundMonths = avgMonthlyExpense > 0 ? savingsBalance / avgMonthlyExpense : 0;
    const savingsRate = avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100 : 0;
    const debtToIncome = avgMonthlyIncome > 0 ? (liabilities / (avgMonthlyIncome * 12)) * 100 : 0;
    return { emergencyFundMonths, savingsRate, debtToIncome };
  }

  function calculateScore({ emergencyFundMonths, savingsRate, debtToIncome }) {
    let score = 50;
    if (emergencyFundMonths >= 6) score += 20; else if (emergencyFundMonths >= 3) score += 10;
    if (savingsRate >= 20) score += 15; else if (savingsRate >= 10) score += 8;
    if (debtToIncome < 36) score += 15; else if (debtToIncome < 50) score += 5;
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  function calculateScoreBreakdown({ emergencyFundMonths, savingsRate, debtToIncome }) {
    const ratios = [];

    // Emergency Fund
    let efScore = 0;
    const efMax = 20;
    if (emergencyFundMonths >= 6) efScore = 20;
    else if (emergencyFundMonths >= 3) efScore = 10;
    const efRounded = Math.round(emergencyFundMonths * 10) / 10;
    let efRec = `Your emergency fund covers ${efRounded} months. `;
    if (efRounded < 3) efRec += 'Target is 3-6 months of expenses.';
    else if (efRounded >= 6) efRec += 'Great — you exceed the 3-6 month target.';
    else efRec += 'Good progress toward the 3-6 month target.';
    ratios.push({ name: 'Emergency Fund', value: efRounded, score: efScore, max: efMax, recommendation: efRec });

    // Savings Rate
    let srScore = 0;
    const srMax = 15;
    if (savingsRate >= 20) srScore = 15;
    else if (savingsRate >= 10) srScore = 8;
    const srRounded = Math.round(savingsRate * 10) / 10;
    let srRec = `Savings rate: ${srRounded}%. `;
    if (savingsRate < 10) srRec += 'Try to save at least 10-20% of income.';
    else if (savingsRate >= 20) srRec += 'Excellent savings discipline.';
    else srRec += 'On track — aim for 20%+.';
    ratios.push({ name: 'Savings Rate', value: srRounded, score: srScore, max: srMax, recommendation: srRec });

    // Debt-to-Income
    let dtiScore = 0;
    const dtiMax = 15;
    if (debtToIncome < 36) dtiScore = 15;
    else if (debtToIncome < 50) dtiScore = 5;
    const dtiRounded = Math.round(debtToIncome * 10) / 10;
    let dtiRec = `Debt-to-income ratio: ${dtiRounded}%. `;
    if (debtToIncome < 36) dtiRec += 'Well within healthy limits.';
    else if (debtToIncome < 50) dtiRec += 'Consider reducing debt below 36%.';
    else dtiRec += 'High debt — prioritize debt repayment.';
    ratios.push({ name: 'Debt-to-Income', value: dtiRounded, score: dtiScore, max: dtiMax, recommendation: dtiRec });

    const totalScore = 50 + ratios.reduce((sum, r) => sum + r.score, 0);
    // Add base score as a ratio entry
    ratios.unshift({ name: 'Base Score', value: 50, score: 50, max: 50, recommendation: 'Base score awarded for having financial data.' });

    return { score: Math.min(100, Math.max(0, totalScore)), ratios };
  }

  function generateInterpretation({ emergencyFundMonths, savingsRate }) {
    const efRounded = Math.round(emergencyFundMonths * 10) / 10;
    let interpretation = `Your emergency fund covers ${efRounded} months of expenses. `;
    if (efRounded < 3) interpretation += 'Target is 3-6 months. ';
    else if (efRounded >= 6) interpretation += 'Great — you exceed the 3-6 month target. ';
    else interpretation += 'Good progress toward the 3-6 month target. ';
    interpretation += `Savings rate: ${Math.round(savingsRate)}%. `;
    if (savingsRate < 10) interpretation += 'Try to save at least 10-20% of income.';
    else if (savingsRate >= 20) interpretation += 'Excellent savings discipline.';
    else interpretation += 'On track — aim for 20%+.';
    return interpretation;
  }

  // ─── 3-Axis Detailed Scoring (from Excel Current Status model) ───

  const DEFAULT_THRESHOLDS = {
    max_needs_ratio: 0.4,
    max_emi_ratio: 0.3,
    min_savings_ratio: 0.2,
    min_investment_ratio: 0.1,
    max_wants_ratio: 0.15,
    emergency_fund_months_target: 6,
    saving_fund_months_target: 3,
    sip_months_target: 12,
  };

  function getUserThresholds(userSettings) {
    const t = { ...DEFAULT_THRESHOLDS };
    if (userSettings) {
      for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
        if (userSettings[key] !== undefined && userSettings[key] !== null) {
          t[key] = Number(userSettings[key]);
        }
      }
    }
    return t;
  }

  /**
   * 3-axis scoring model:
   * - Investment Score: how well savings + investments + extra income meet targets
   * - Expenditure Score: how well fixed + variable + EMI expenses stay under caps
   * - Funds Score: how adequate emergency/saving/SIP funds are vs targets
   *
   * Each axis returns a raw score (can be negative or > 100).
   * Overall = average of all 3, clamped to 0-100.
   */
  function calculateDetailedScore({
    salary, extraIncome = 0,
    fixedExpenses, variableExpenses, emiTotal,
    monthlySavings, monthlyInvestments,
    emergencyFund, savingFund, sipTotal,
    userSettings,
  }) {
    const t = getUserThresholds(userSettings);
    const income = salary + extraIncome;
    if (income <= 0) return { investment_score: 0, expenditure_score: 0, funds_score: 0, overall: 0 };

    // Compute target amounts
    const minSavingsAmt = t.min_savings_ratio * salary;
    const minInvestmentAmt = t.min_investment_ratio * salary + t.min_investment_ratio * 3 * extraIncome;
    const maxNeedsAmt = t.max_needs_ratio * salary;
    const maxWantsAmt = 0.7 * extraIncome + salary * t.max_wants_ratio / 3;
    const maxEmiAmt = t.max_emi_ratio * salary;
    const minEmergency = t.emergency_fund_months_target * salary;
    const minSaving = t.saving_fund_months_target * salary;
    const minSip = t.sip_months_target * salary;

    // Investment Score: ((savings/target) + (investment/target) + (extraIncome/salary)) × 100/3
    const savingsRatio = minSavingsAmt > 0 ? monthlySavings / minSavingsAmt : 0;
    const investRatio = minInvestmentAmt > 0 ? monthlyInvestments / minInvestmentAmt : 0;
    const extraIncomeRatio = salary > 0 ? extraIncome / salary : 0;
    const investmentScore = ((savingsRatio + investRatio + extraIncomeRatio) * 100) / 3;

    // Expenditure Score: (2 - (fixed/maxNeeds + variable/maxWants + emi/maxEmi)) × 100/3
    const needsRatio = maxNeedsAmt > 0 ? fixedExpenses / maxNeedsAmt : 0;
    const wantsRatio = maxWantsAmt > 0 ? variableExpenses / maxWantsAmt : 0;
    const emiRatio = maxEmiAmt > 0 ? emiTotal / maxEmiAmt : 0;
    const expenditureScore = ((2 - (needsRatio + wantsRatio + emiRatio)) * 100) / 3;

    // Funds Score: ((emergency/target) + (saving/target) + (sip/target)) × 100/3
    const efRatio = minEmergency > 0 ? emergencyFund / minEmergency : 0;
    const sfRatio = minSaving > 0 ? savingFund / minSaving : 0;
    const sipRatio = minSip > 0 ? sipTotal / minSip : 0;
    const fundsScore = ((efRatio + sfRatio + sipRatio) * 100) / 3;

    // Overall = average of 3 axes, clamped 0-100
    const rawOverall = (investmentScore + expenditureScore + fundsScore) / 3;
    const overall = Math.min(100, Math.max(0, Math.round(rawOverall)));

    return {
      investment_score: Math.round(investmentScore * 10) / 10,
      expenditure_score: Math.round(expenditureScore * 10) / 10,
      funds_score: Math.round(fundsScore * 10) / 10,
      overall,
      thresholds: t,
      // Sub-ratios for transparency
      sub_ratios: {
        savings_to_target: Math.round(savingsRatio * 100) / 100,
        investment_to_target: Math.round(investRatio * 100) / 100,
        needs_to_cap: Math.round(needsRatio * 100) / 100,
        wants_to_cap: Math.round(wantsRatio * 100) / 100,
        emi_to_cap: Math.round(emiRatio * 100) / 100,
        emergency_to_target: Math.round(efRatio * 100) / 100,
        saving_to_target: Math.round(sfRatio * 100) / 100,
        sip_to_target: Math.round(sipRatio * 100) / 100,
      },
    };
  }

  /**
   * Calculate budget adherence: how well user sticks to their budget allocations.
   * Returns 0-100 percentage. 100 = all spending within budget.
   */
  function calculateBudgetAdherence(budgetItems) {
    if (!budgetItems || budgetItems.length === 0) return null;
    let withinBudget = 0;
    for (const item of budgetItems) {
      if (item.allocated > 0 && item.spent <= item.allocated) withinBudget++;
    }
    return Math.round((withinBudget / budgetItems.length) * 100);
  }

  /**
   * Age of Money: average days between income receipt and money being spent.
   * Approximation: average balance / average daily spending.
   */
  function calculateAgeOfMoney({ avgBalance, avgDailyExpense }) {
    if (avgDailyExpense <= 0) return null;
    return Math.round(avgBalance / avgDailyExpense);
  }

  /**
   * Expected Net Worth (Millionaire Next Door formula): Age × Annual Income ÷ 10
   * PAW = net worth ≥ 2× expected, UAW = ≤ 0.5× expected
   */
  function calculateExpectedNetWorth({ age, annualIncome, actualNetWorth }) {
    if (!age || !annualIncome) return null;
    const expected = (age * annualIncome) / 10;
    let classification = 'AAW'; // Average Accumulator
    if (actualNetWorth >= 2 * expected) classification = 'PAW'; // Prodigious
    else if (actualNetWorth <= 0.5 * expected) classification = 'UAW'; // Under
    return {
      expected_net_worth: Math.round(expected),
      actual_net_worth: Math.round(actualNetWorth),
      ratio: expected > 0 ? Math.round((actualNetWorth / expected) * 100) / 100 : 0,
      classification,
    };
  }

  return {
    calculateRatios, calculateScore, calculateScoreBreakdown, generateInterpretation,
    calculateDetailedScore, calculateBudgetAdherence, calculateAgeOfMoney, calculateExpectedNetWorth,
    getUserThresholds, DEFAULT_THRESHOLDS,
  };
};
