/**
 * Round a currency amount to 2 decimal places.
 * Avoids floating point precision issues (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

module.exports = { roundCurrency };
