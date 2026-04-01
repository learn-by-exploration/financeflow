// src/services/stats.service.js — Extracted financial calculation logic
// Why: SOLID — route handlers should validate/respond, services should compute

/**
 * EMI calculation with amortization schedule.
 */
function calculateEMI(principal, annualRate, tenureMonths) {
  const monthlyRate = annualRate / 12 / 100;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  const totalPayment = emi * tenureMonths;
  const totalInterest = totalPayment - principal;

  const schedule = [];
  let balance = principal;
  for (let m = 1; m <= tenureMonths; m++) {
    const interest = balance * monthlyRate;
    const principalPart = emi - interest;
    balance -= principalPart;
    schedule.push({
      month: m,
      emi: Math.round(emi * 100) / 100,
      principal: Math.round(principalPart * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      balance: Math.max(0, Math.round(balance * 100) / 100),
    });
  }

  return {
    principal,
    annual_rate: annualRate,
    tenure_months: tenureMonths,
    monthly_emi: Math.round(emi * 100) / 100,
    total_payment: Math.round(totalPayment * 100) / 100,
    total_interest: Math.round(totalInterest * 100) / 100,
    schedule,
  };
}

/**
 * SIP (Systematic Investment Plan) calculator.
 * Calculates future value for monthly investments with compounding.
 * @param {number} monthlyInvestment - Amount invested monthly
 * @param {number} annualReturn - Expected annual return rate (%)
 * @param {number} years - Investment duration in years
 * @param {number} [stepUpPct=0] - Annual step-up percentage
 */
function calculateSIP(monthlyInvestment, annualReturn, years, stepUpPct = 0) {
  const monthlyRate = annualReturn / 12 / 100;
  const totalMonths = years * 12;

  let totalInvested = 0;
  let futureValue = 0;
  let currentMonthly = monthlyInvestment;
  const yearlyBreakdown = [];

  for (let month = 1; month <= totalMonths; month++) {
    futureValue = (futureValue + currentMonthly) * (1 + monthlyRate);
    totalInvested += currentMonthly;

    if (month % 12 === 0) {
      yearlyBreakdown.push({
        year: month / 12,
        invested: Math.round(totalInvested * 100) / 100,
        value: Math.round(futureValue * 100) / 100,
        gains: Math.round((futureValue - totalInvested) * 100) / 100,
        monthly_sip: Math.round(currentMonthly * 100) / 100,
      });
      // Apply step-up at year boundary
      if (stepUpPct > 0) {
        currentMonthly = currentMonthly * (1 + stepUpPct / 100);
      }
    }
  }

  return {
    monthly_investment: monthlyInvestment,
    annual_return: annualReturn,
    years,
    step_up_pct: stepUpPct,
    total_invested: Math.round(totalInvested * 100) / 100,
    future_value: Math.round(futureValue * 100) / 100,
    total_gains: Math.round((futureValue - totalInvested) * 100) / 100,
    gains_percentage: Math.round(((futureValue - totalInvested) / totalInvested) * 10000) / 100,
    yearly_breakdown: yearlyBreakdown,
  };
}

/**
 * Lumpsum investment calculator.
 * @param {number} principal - Initial investment
 * @param {number} annualReturn - Expected annual return rate (%)
 * @param {number} years - Investment duration
 */
function calculateLumpsum(principal, annualReturn, years) {
  const futureValue = principal * Math.pow(1 + annualReturn / 100, years);
  return {
    principal,
    annual_return: annualReturn,
    years,
    future_value: Math.round(futureValue * 100) / 100,
    total_gains: Math.round((futureValue - principal) * 100) / 100,
    gains_percentage: Math.round(((futureValue - principal) / principal) * 10000) / 100,
  };
}

/**
 * Fire number calculator — how much you need to retire.
 * @param {number} annualExpense - Current annual expenses
 * @param {number} withdrawalRate - Safe withdrawal rate (default 4%)
 * @param {number} inflationRate - Expected inflation (default 6%)
 * @param {number} yearsToRetirement - Years until retirement
 */
function calculateFIRE(annualExpense, withdrawalRate = 4, inflationRate = 6, yearsToRetirement = 20) {
  // Inflate expenses to retirement year
  const futureAnnualExpense = annualExpense * Math.pow(1 + inflationRate / 100, yearsToRetirement);
  const fireNumber = futureAnnualExpense / (withdrawalRate / 100);

  return {
    current_annual_expense: annualExpense,
    withdrawal_rate: withdrawalRate,
    inflation_rate: inflationRate,
    years_to_retirement: yearsToRetirement,
    future_annual_expense: Math.round(futureAnnualExpense * 100) / 100,
    fire_number: Math.round(fireNumber * 100) / 100,
    monthly_savings_needed: Math.round(fireNumber / (yearsToRetirement * 12) * 100) / 100,
  };
}

module.exports = { calculateEMI, calculateSIP, calculateLumpsum, calculateFIRE };
