/**
 * Safe pattern matching utilities for auto-categorization.
 * Uses pipe-delimited string matching instead of regex to prevent ReDoS.
 * Pattern format: "term1|term2|term3" — matches if any term is found (case-insensitive).
 */

const MAX_PATTERN_LENGTH = 500;

/**
 * Validate a pipe-delimited pattern string.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validatePattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return { valid: false, reason: 'Pattern must be a non-empty string' };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { valid: false, reason: `Pattern must be ${MAX_PATTERN_LENGTH} characters or less` };
  }
  const terms = pattern.split('|').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) {
    return { valid: false, reason: 'Pattern must contain at least one non-empty term' };
  }
  return { valid: true };
}

/**
 * Test whether a string matches a pipe-delimited pattern (case-insensitive).
 * Pattern "swiggy|zomato" matches any string containing "swiggy" or "zomato".
 * Returns true if matched, false otherwise.
 */
function safePatternTest(pattern, str) {
  if (!pattern || !str) return false;
  const lowerStr = str.toLowerCase();
  const terms = pattern.toLowerCase().split('|');
  for (const term of terms) {
    const trimmed = term.trim();
    if (trimmed && lowerStr.includes(trimmed)) return true;
  }
  return false;
}

module.exports = { validatePattern, safePatternTest };
