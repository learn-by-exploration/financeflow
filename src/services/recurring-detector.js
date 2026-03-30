const crypto = require('crypto');

function computePatternHash(description, amount, accountId) {
  return crypto.createHash('sha256')
    .update(`${description.toLowerCase()}|${amount}|${accountId}`)
    .digest('hex');
}

function detectFrequency(intervals) {
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  const ranges = [
    { name: 'daily', target: 1 },
    { name: 'weekly', target: 7 },
    { name: 'monthly', target: 30 },
    { name: 'quarterly', target: 90 },
    { name: 'yearly', target: 365 },
  ];

  for (const { name, target } of ranges) {
    const tolerance = target * 0.2;
    if (Math.abs(avg - target) <= tolerance) {
      return name;
    }
  }

  return null;
}

function computeConfidence(intervals, frequency) {
  if (intervals.length === 0) return 0;

  const targets = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
  const target = targets[frequency];
  if (!target) return 0;

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 1;

  // Lower coefficient of variation = higher confidence
  // cv of 0 = perfect consistency = 1.0 confidence
  // cv of 0.5+ = low confidence
  const confidence = Math.max(0, Math.min(1, 1 - cv * 2));
  return Math.round(confidence * 100) / 100;
}

function detectRecurringPatterns(transactions, dismissedHashes = []) {
  const dismissedSet = new Set(dismissedHashes);

  // Group by description + amount + account_id
  const groups = new Map();
  for (const tx of transactions) {
    const key = `${tx.description.toLowerCase()}|${tx.amount}|${tx.account_id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(tx);
  }

  const suggestions = [];

  for (const [key, txns] of groups) {
    // Minimum 3 occurrences
    if (txns.length < 3) continue;

    const [descLower, amountStr, accountIdStr] = key.split('|');
    const patternHash = computePatternHash(descLower, amountStr, accountIdStr);

    if (dismissedSet.has(patternHash)) continue;

    // Sort by date ascending
    const sorted = txns.slice().sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals in days
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1].date);
      const d2 = new Date(sorted[i].date);
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const frequency = detectFrequency(intervals);
    if (!frequency) continue;

    const confidence = computeConfidence(intervals, frequency);

    suggestions.push({
      pattern_hash: patternHash,
      description: sorted[0].description,
      amount: Number(amountStr),
      account_id: Number(accountIdStr),
      frequency,
      confidence,
      occurrence_count: sorted.length,
      last_date: sorted[sorted.length - 1].date,
      type: sorted[0].type,
    });
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

module.exports = { detectRecurringPatterns, computePatternHash, detectFrequency, computeConfidence };
