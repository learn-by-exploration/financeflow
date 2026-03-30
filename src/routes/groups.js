const express = require('express');
const router = express.Router();
const { createGroupSchema, addMemberSchema, updateGroupSchema } = require('../schemas/group.schema');

module.exports = function createGroupRoutes({ db, audit }) {

  // Helper: check membership + role
  function getMembership(groupId, userId) {
    return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  }

  // GET /api/groups — list groups user belongs to
  router.get('/', (req, res, next) => {
    try {
      const groups = db.prepare(`
        SELECT g.*, gm.role FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
        ORDER BY g.created_at DESC
      `).all(req.user.id);
      res.json({ groups });
    } catch (err) { next(err); }
  });

  // POST /api/groups — create a group
  router.post('/', (req, res, next) => {
    try {
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { name, icon, color } = parsed.data;
      const result = db.prepare('INSERT INTO groups (name, icon, color, created_by) VALUES (?, ?, ?, ?)')
        .run(name, icon || '👥', color || '#f59e0b', req.user.id);
      // Add creator as owner
      db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)')
        .run(result.lastInsertRowid, req.user.id, req.user.displayName || req.user.username, 'owner');
      audit.log(req.user.id, 'group.create', 'group', result.lastInsertRowid);
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ group });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id — group details with members
  router.get('/:id', (req, res, next) => {
    try {
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = getMembership(group.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });
      const members = db.prepare('SELECT gm.*, u.username FROM group_members gm LEFT JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ?').all(group.id);
      res.json({ group, members });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id — delete group (owner only)
  router.delete('/:id', (req, res, next) => {
    try {
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can delete groups' } });
      }
      db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
      audit.log(req.user.id, 'group.delete', 'group', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // PUT /api/groups/:id — update group (owner only)
  router.put('/:id', (req, res, next) => {
    try {
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can update groups' } });
      }
      const { name, icon, color } = parsed.data;
      db.prepare('UPDATE groups SET name = ?, icon = ?, color = ? WHERE id = ?')
        .run(name || group.name, icon || group.icon, color || group.color, group.id);
      audit.log(req.user.id, 'group.update', 'group', group.id);
      const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(group.id);
      res.json({ group: updated });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:id/members — add member
  router.post('/:id/members', (req, res, next) => {
    try {
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { username, display_name } = req.body;
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      let userId = null;
      let displayName = display_name || 'Guest';
      if (username) {
        const user = db.prepare('SELECT id, display_name FROM users WHERE username = ?').get(username);
        if (user) {
          userId = user.id;
          displayName = user.display_name || username;
          // Check for duplicate
          const existing = getMembership(req.params.id, userId);
          if (existing) {
            return res.status(409).json({ error: { code: 'CONFLICT', message: 'User is already a member' } });
          }
        }
      }

      const result = db.prepare('INSERT INTO group_members (group_id, user_id, display_name, role) VALUES (?, ?, ?, ?)')
        .run(req.params.id, userId, displayName, 'member');
      audit.log(req.user.id, 'group.add_member', 'group_member', result.lastInsertRowid);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/members/:memberId — remove member (owner only, can't remove last owner)
  router.delete('/:id/members/:memberId', (req, res, next) => {
    try {
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      // Must be owner to remove members
      const membership = getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can remove members' } });
      }

      // Can't remove last owner
      const target = db.prepare('SELECT * FROM group_members WHERE id = ? AND group_id = ?').get(req.params.memberId, req.params.id);
      if (target && target.role === 'owner') {
        const ownerCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND role = ?').get(req.params.id, 'owner').count;
        if (ownerCount <= 1) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot remove the last owner' } });
        }
      }

      db.prepare('DELETE FROM group_members WHERE id = ? AND group_id = ?').run(req.params.memberId, req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // SHARED BUDGETS
  // ═══════════════════════════════════════════

  // GET /api/groups/:id/budgets — list shared budgets
  router.get('/:id/budgets', (req, res, next) => {
    try {
      const membership = getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const budgets = db.prepare('SELECT * FROM shared_budgets WHERE group_id = ? ORDER BY created_at DESC').all(req.params.id);
      res.json({ budgets });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:id/budgets — create shared budget
  router.post('/:id/budgets', (req, res, next) => {
    try {
      const membership = getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const { name, period, items } = req.body;
      if (!name || !period) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name and period are required' } });
      }

      const result = db.prepare('INSERT INTO shared_budgets (group_id, name, period) VALUES (?, ?, ?)').run(req.params.id, name, period);
      const budgetId = result.lastInsertRowid;

      const insertedItems = [];
      if (items && items.length) {
        const insert = db.prepare('INSERT INTO shared_budget_items (shared_budget_id, category_id, amount) VALUES (?, ?, ?)');
        const tx = db.transaction(() => {
          for (const item of items) {
            const r = insert.run(budgetId, item.category_id || null, item.amount);
            insertedItems.push({ id: r.lastInsertRowid, category_id: item.category_id || null, amount: item.amount });
          }
        });
        tx();
      }

      audit.log(req.user.id, 'shared_budget.create', 'shared_budget', budgetId);
      const budget = db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(budgetId);
      res.status(201).json({ budget, items: insertedItems });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id/budgets/:budgetId — get single shared budget with items
  router.get('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const budget = db.prepare('SELECT * FROM shared_budgets WHERE id = ? AND group_id = ?').get(req.params.budgetId, req.params.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      const items = db.prepare('SELECT * FROM shared_budget_items WHERE shared_budget_id = ?').all(budget.id);
      res.json({ budget, items });
    } catch (err) { next(err); }
  });

  // PUT /api/groups/:id/budgets/:budgetId — update shared budget
  router.put('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const existing = db.prepare('SELECT * FROM shared_budgets WHERE id = ? AND group_id = ?').get(req.params.budgetId, req.params.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      const { name, period, is_active } = req.body;
      db.prepare(`UPDATE shared_budgets SET name = ?, period = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(name || existing.name, period || existing.period, is_active !== undefined ? is_active : existing.is_active, existing.id);

      audit.log(req.user.id, 'shared_budget.update', 'shared_budget', existing.id);
      const budget = db.prepare('SELECT * FROM shared_budgets WHERE id = ?').get(existing.id);
      res.json({ budget });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/budgets/:budgetId — delete shared budget
  router.delete('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const existing = db.prepare('SELECT * FROM shared_budgets WHERE id = ? AND group_id = ?').get(req.params.budgetId, req.params.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      db.prepare('DELETE FROM shared_budgets WHERE id = ?').run(existing.id);
      audit.log(req.user.id, 'shared_budget.delete', 'shared_budget', existing.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
