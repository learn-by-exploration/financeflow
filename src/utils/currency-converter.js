const { roundCurrency } = require('./currency');

/**
 * Convert an amount from one currency to another using provided rates map.
 * @param {number} amount - The amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {object} rateMap - Map of "FROM->TO" => rate, e.g. { "USD->INR": 83.5 }
 * @returns {{ converted: number, rate: number } | null} - Converted amount and rate, or null if no rate found
 */
function convert(amount, fromCurrency, toCurrency, rateMap) {
  if (fromCurrency === toCurrency) {
    return { converted: amount, rate: 1 };
  }

  const directKey = `${fromCurrency}->${toCurrency}`;
  if (rateMap[directKey]) {
    return { converted: roundCurrency(amount * rateMap[directKey]), rate: rateMap[directKey] };
  }

  // Try reverse
  const reverseKey = `${toCurrency}->${fromCurrency}`;
  if (rateMap[reverseKey]) {
    const reverseRate = 1 / rateMap[reverseKey];
    return { converted: roundCurrency(amount * reverseRate), rate: reverseRate };
  }

  return null;
}

/**
 * Build a rate map from an array of exchange rate rows.
 * @param {Array<{base_currency: string, target_currency: string, rate: number}>} rates
 * @returns {object} Map of "BASE->TARGET" => rate
 */
function buildRateMap(rates) {
  const map = {};
  for (const r of rates) {
    map[`${r.base_currency}->${r.target_currency}`] = r.rate;
  }
  return map;
}

module.exports = { convert, buildRateMap };
