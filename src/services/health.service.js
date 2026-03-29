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

  return { calculateRatios, calculateScore, generateInterpretation };
};
