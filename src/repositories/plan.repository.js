// src/repositories/plan.repository.js
module.exports = function createPlanRepository({ db }) {

  function findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0, status, goal_type } = options;
    let sql = 'SELECT * FROM financial_plans WHERE user_id = ?';
    const params = [userId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (goal_type) { sql += ' AND goal_type = ?'; params.push(goal_type); }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return db.prepare(sql).all(...params);
  }

  function countByUser(userId, options = {}) {
    const { status, goal_type } = options;
    let sql = 'SELECT COUNT(*) as count FROM financial_plans WHERE user_id = ?';
    const params = [userId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (goal_type) { sql += ' AND goal_type = ?'; params.push(goal_type); }
    return db.prepare(sql).get(...params).count;
  }

  function findById(id, userId) {
    return db.prepare('SELECT * FROM financial_plans WHERE id = ? AND user_id = ?').get(id, userId);
  }

  function create(userId, data) {
    const {
      name, goal_type, target_amount, target_date, current_saved,
      status, selected_scenario, risk_tolerance, monthly_savings_target,
      constraints, plan_data, ai_narrative, linked_goal_id, notes,
    } = data;
    const result = db.prepare(`
      INSERT INTO financial_plans (user_id, name, goal_type, target_amount, target_date, current_saved,
        status, selected_scenario, risk_tolerance, monthly_savings_target,
        constraints, plan_data, ai_narrative, linked_goal_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, name, goal_type, target_amount, target_date || null, current_saved || 0,
      status || 'active', selected_scenario || risk_tolerance || 'moderate', risk_tolerance || 'moderate',
      monthly_savings_target || 0,
      constraints ? JSON.stringify(constraints) : null,
      plan_data ? JSON.stringify(plan_data) : null,
      ai_narrative || null, linked_goal_id || null, notes || null
    );
    return db.prepare('SELECT * FROM financial_plans WHERE id = ?').get(result.lastInsertRowid);
  }

  function update(id, userId, data) {
    const existing = db.prepare('SELECT * FROM financial_plans WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) return undefined;

    const fields = [];
    const params = [];
    const allowed = ['name', 'status', 'target_amount', 'target_date', 'current_saved',
      'risk_tolerance', 'selected_scenario', 'monthly_savings_target', 'plan_data',
      'ai_narrative', 'linked_goal_id', 'notes', 'constraints'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        const val = (key === 'plan_data' || key === 'constraints') && typeof data[key] === 'object'
          ? JSON.stringify(data[key]) : data[key];
        params.push(val);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    params.push(id, userId);
    db.prepare(`UPDATE financial_plans SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    return db.prepare('SELECT * FROM financial_plans WHERE id = ?').get(id);
  }

  function deleteById(id, userId) {
    return db.prepare('DELETE FROM financial_plans WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // ─── Scenarios ───
  function saveScenarios(planId, scenarios) {
    const del = db.prepare('DELETE FROM plan_scenarios WHERE plan_id = ?');
    const ins = db.prepare(`
      INSERT INTO plan_scenarios (plan_id, scenario_type, monthly_savings, duration_months,
        total_saved, total_interest, inflation_adjusted_target, assumptions, action_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      del.run(planId);
      for (const [key, sc] of Object.entries(scenarios)) {
        ins.run(
          planId, key,
          sc.monthly_savings, sc.duration_months,
          sc.total_saved, sc.total_interest, sc.inflation_adjusted_target || 0,
          JSON.stringify({ return_rate: sc.assumed_return_rate, inflation_rate: sc.assumed_inflation_rate, feasible: sc.feasible }),
          JSON.stringify(sc.actions || [])
        );
      }
    })();
  }

  function getScenarios(planId) {
    return db.prepare('SELECT * FROM plan_scenarios WHERE plan_id = ? ORDER BY scenario_type').all(planId);
  }

  // ─── Milestones ───
  function saveMilestones(planId, milestones) {
    const del = db.prepare('DELETE FROM plan_milestones WHERE plan_id = ?');
    const ins = db.prepare(`
      INSERT INTO plan_milestones (plan_id, title, target_amount, target_date, is_completed, position)
      VALUES (?, ?, ?, ?, 0, ?)
    `);

    db.transaction(() => {
      del.run(planId);
      for (const m of milestones) {
        ins.run(planId, m.title, m.target_amount, m.target_date, m.position);
      }
    })();
  }

  function getMilestones(planId) {
    return db.prepare('SELECT * FROM plan_milestones WHERE plan_id = ? ORDER BY position').all(planId);
  }

  function completeMilestone(milestoneId, planId) {
    db.prepare("UPDATE plan_milestones SET is_completed = 1 WHERE id = ? AND plan_id = ?").run(milestoneId, planId);
    return db.prepare('SELECT * FROM plan_milestones WHERE id = ?').get(milestoneId);
  }

  // ─── AI Log ───
  function logAIInteraction(planId, userId, data) {
    const { interaction_type, user_input, ai_output, provider, model, tokens_used } = data;
    const result = db.prepare(`
      INSERT INTO plan_ai_log (plan_id, user_id, interaction_type, user_input, ai_output, provider, model, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(planId, userId, interaction_type, user_input || null, ai_output || null, provider || null, model || null, tokens_used || 0);
    return db.prepare('SELECT * FROM plan_ai_log WHERE id = ?').get(result.lastInsertRowid);
  }

  function getAILog(planId, userId, limit = 50) {
    return db.prepare(
      'SELECT * FROM plan_ai_log WHERE plan_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(planId, userId, limit);
  }

  return {
    findAllByUser,
    countByUser,
    findById,
    create,
    update,
    deleteById,
    saveScenarios,
    getScenarios,
    saveMilestones,
    getMilestones,
    completeMilestone,
    logAIInteraction,
    getAILog,
  };
};
