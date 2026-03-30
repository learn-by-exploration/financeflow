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

  return { calculateRatios, calculateScore, calculateScoreBreakdown, generateInterpretation };
};
