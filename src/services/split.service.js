module.exports = function createSplitService({ db }) {

  /**
   * Distribute remainder pennies round-robin across members.
   * Guarantees sum(result) === target amount.
   */
  function distributeRemainder(amounts, totalAmount) {
    const sum = amounts.reduce((s, a) => s + a, 0);
    let remainderCents = Math.round((totalAmount - sum) * 100);
    let i = 0;
    while (remainderCents > 0) {
      amounts[i % amounts.length] = Math.round((amounts[i % amounts.length] + 0.01) * 100) / 100;
      remainderCents--;
      i++;
    }
    return amounts;
  }

  /**
   * Calculate equal split amounts with rounding.
   * Floor each share, distribute remainder pennies round-robin.
   * Guarantees sum(splits) === amount.
   */
  function calculateEqualSplit(amount, memberCount) {
    const share = Math.floor(amount / memberCount * 100) / 100;
    const amounts = Array(memberCount).fill(share);
    return distributeRemainder(amounts, amount);
  }

  /**
   * Simplify debts using greedy algorithm.
   * Returns array of { from, from_name, to, to_name, amount }.
   */
  function simplifyDebts(balances) {
    const creditors = balances.filter(b => b.balance > 0.005).map(b => ({ ...b }));
    const debtors = balances.filter(b => b.balance < -0.005).map(b => ({ ...b, balance: -b.balance }));
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);

    const settlements = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const transfer = Math.min(creditors[ci].balance, debtors[di].balance);
      if (transfer > 0.005) {
        settlements.push({
          from: debtors[di].id,
          from_name: debtors[di].name,
          to: creditors[ci].id,
          to_name: creditors[ci].name,
          amount: Math.round(transfer * 100) / 100
        });
      }
      creditors[ci].balance -= transfer;
      debtors[di].balance -= transfer;
      if (creditors[ci].balance < 0.005) ci++;
      if (debtors[di].balance < 0.005) di++;
    }
    return settlements;
  }

  /**
   * Calculate net balances for a group.
   */
  function calculateBalances(groupId) {
    const members = db.prepare('SELECT id, display_name FROM group_members WHERE group_id = ?').all(groupId);
    const balances = {};
    members.forEach(m => { balances[m.id] = { id: m.id, name: m.display_name, balance: 0 }; });

    const expenses = db.prepare('SELECT * FROM shared_expenses WHERE group_id = ? AND is_settled = 0').all(groupId);
    for (const exp of expenses) {
      balances[exp.paid_by].balance += exp.amount;
      const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? AND is_settled = 0').all(exp.id);
      for (const split of splits) {
        balances[split.member_id].balance -= split.amount;
      }
    }

    const settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(groupId);
    for (const s of settlements) {
      balances[s.from_member].balance += s.amount;
      balances[s.to_member].balance -= s.amount;
    }

    return Object.values(balances);
  }

  /**
   * Calculate percentage-based split amounts.
   * Each member's amount = floor(total * percentage / 100, 2 decimals).
   * Remainder distributed round-robin to guarantee sum === amount.
   */
  function calculatePercentageSplit(amount, percentages) {
    const amounts = percentages.map(p => Math.floor(amount * p / 100 * 100) / 100);
    return distributeRemainder(amounts, amount);
  }

  /**
   * Calculate shares-based split amounts.
   * Each member's amount = floor(total * myShares / totalShares, 2 decimals).
   * Remainder distributed round-robin to guarantee sum === amount.
   */
  function calculateSharesSplit(amount, shares) {
    const totalShares = shares.reduce((s, sh) => s + sh, 0);
    const amounts = shares.map(sh => Math.floor(amount * sh / totalShares * 100) / 100);
    return distributeRemainder(amounts, amount);
  }

  return { calculateEqualSplit, calculatePercentageSplit, calculateSharesSplit, simplifyDebts, calculateBalances };
};
