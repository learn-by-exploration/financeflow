const express = require('express');
const router = express.Router();
const { createGroupSchema, addMemberSchema, updateGroupSchema } = require('../schemas/group.schema');
const createGroupRepository = require('../repositories/group.repository');
const createSplitService = require('../services/split.service');
const createNotificationRepository = require('../repositories/notification.repository');

module.exports = function createGroupRoutes({ db, audit }) {

  const groupRepo = createGroupRepository({ db });
  const splitService = createSplitService({ db });
  const notifRepo = createNotificationRepository({ db });

  // GET /api/groups — list groups user belongs to
  router.get('/', (req, res, next) => {
    try {
      const groups = groupRepo.findByUser(req.user.id);
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
      const group = groupRepo.create(name, icon, color, req.user.id, req.user.displayName || req.user.username);
      audit.log(req.user.id, 'group.create', 'group', group.id);
      res.status(201).json({ group });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id — group details with members
  router.get('/:id', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });
      const members = groupRepo.getMembers(group.id);
      res.json({ group, members });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id — delete group (owner only)
  router.delete('/:id', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can delete groups' } });
      }
      groupRepo.delete(req.params.id);
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
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can update groups' } });
      }
      const { name, icon, color } = parsed.data;
      const updated = groupRepo.update(group.id, { name, icon, color });
      audit.log(req.user.id, 'group.update', 'group', group.id);
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
      const { username, display_name } = parsed.data;
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this group' } });
      }

      let userId = null;
      let displayName = display_name || 'Guest';
      if (username) {
        const user = groupRepo.findUserByUsername(username);
        if (user) {
          userId = user.id;
          displayName = user.display_name || username;
          const existing = groupRepo.getMembership(req.params.id, userId);
          if (existing) {
            return res.status(409).json({ error: { code: 'CONFLICT', message: 'User is already a member' } });
          }
        }
      }

      const memberId = groupRepo.addMember(req.params.id, userId, displayName, 'member');
      audit.log(req.user.id, 'group.add_member', 'group_member', memberId);
      groupRepo.createActivity(req.params.id, req.user.id, 'member_added', `${displayName} was added to the group`);
      res.status(201).json({ id: memberId });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/members/:memberId — remove member (owner only, can't remove last owner)
  router.delete('/:id/members/:memberId', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners can remove members' } });
      }

      const target = groupRepo.getMemberById(req.params.memberId, req.params.id);
      if (target && target.role === 'owner') {
        const ownerCount = groupRepo.getOwnerCount(req.params.id);
        if (ownerCount <= 1) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot remove the last owner' } });
        }
      }

      const removedName = target ? target.display_name : 'Unknown';
      groupRepo.removeMember(req.params.memberId, req.params.id);
      groupRepo.createActivity(req.params.id, req.user.id, 'member_removed', `${removedName} was removed from the group`);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // SHARED BUDGETS
  // ═══════════════════════════════════════════

  // GET /api/groups/:id/budgets — list shared budgets
  router.get('/:id/budgets', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const budgets = groupRepo.getSharedBudgets(req.params.id);
      res.json({ budgets });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:id/budgets — create shared budget
  router.post('/:id/budgets', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const { name, period, items } = req.body;
      if (!name || typeof name !== 'string' || !name.trim() || name.length > 200) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required (max 200 chars)' } });
      }
      const VALID_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly'];
      if (!period || !VALID_PERIODS.includes(period)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Period must be one of: ${VALID_PERIODS.join(', ')}` } });
      }
      if (items !== undefined && !Array.isArray(items)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Items must be an array' } });
      }
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item.amount !== 'number' || item.amount < 0) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Each item must have a non-negative numeric amount' } });
          }
        }
      }

      const { budget, items: insertedItems } = groupRepo.createSharedBudget(req.params.id, name.trim(), period, items);
      audit.log(req.user.id, 'shared_budget.create', 'shared_budget', budget.id);
      res.status(201).json({ budget, items: insertedItems });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id/budgets/:budgetId — get single shared budget with items
  router.get('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const budget = groupRepo.getSharedBudget(req.params.budgetId, req.params.id);
      if (!budget) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      const items = groupRepo.getSharedBudgetItems(budget.id);
      res.json({ budget, items });
    } catch (err) { next(err); }
  });

  // PUT /api/groups/:id/budgets/:budgetId — update shared budget
  router.put('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const existing = groupRepo.getSharedBudget(req.params.budgetId, req.params.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      const { name, period, is_active } = req.body;
      if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string (max 200 chars)' } });
      }
      const VALID_BUDGET_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly'];
      if (period !== undefined && !VALID_BUDGET_PERIODS.includes(period)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Period must be one of: ${VALID_BUDGET_PERIODS.join(', ')}` } });
      }
      if (is_active !== undefined && ![0, 1, true, false].includes(is_active)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'is_active must be 0 or 1' } });
      }
      const budget = groupRepo.updateSharedBudget(existing.id, { name: name?.trim(), period, is_active: is_active !== undefined ? Number(!!is_active) : undefined });
      audit.log(req.user.id, 'shared_budget.update', 'shared_budget', existing.id);
      res.json({ budget });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/budgets/:budgetId — delete shared budget
  router.delete('/:id/budgets/:budgetId', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const existing = groupRepo.getSharedBudget(req.params.budgetId, req.params.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shared budget not found' } });

      groupRepo.deleteSharedBudget(existing.id);
      audit.log(req.user.id, 'shared_budget.delete', 'shared_budget', existing.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // SPLIT PAYMENT REMINDERS
  // ═══════════════════════════════════════════

  // POST /api/groups/:id/splits/remind — send reminders to debtors
  router.post('/:id/splits/remind', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      // Rate limit: once per 24h per group
      const lastReminder = groupRepo.getLastReminder(group.id);
      if (lastReminder) {
        const lastTime = new Date(lastReminder.created_at + 'Z').getTime();
        const now = Date.now();
        if (now - lastTime < 24 * 60 * 60 * 1000) {
          return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Reminders can only be sent once every 24 hours' } });
        }
      }

      // Calculate who owes money
      const balances = splitService.calculateBalances(group.id);
      const debtors = balances.filter(b => b.balance < -0.005);

      if (debtors.length === 0) {
        return res.json({ ok: true, reminded: 0 });
      }

      // Get member records with user_ids for notification
      const members = groupRepo.getMembers(group.id);
      const memberMap = {};
      members.forEach(m => { memberMap[m.id] = m; });

      let reminded = 0;
      for (const debtor of debtors) {
        const member = memberMap[debtor.id];
        if (!member || !member.user_id) continue; // skip guest members
        const owedAmount = Math.round(Math.abs(debtor.balance) * 100) / 100;
        notifRepo.create(member.user_id, {
          type: 'split_reminder',
          title: 'Payment Reminder',
          message: `You owe ₹${owedAmount} in group "${group.name}"`,
        });
        reminded++;
      }

      groupRepo.createActivity(group.id, req.user.id, 'remind', `Payment reminders sent to ${reminded} member(s)`);
      res.json({ ok: true, reminded });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // GROUP ACTIVITY FEED
  // ═══════════════════════════════════════════

  // GET /api/groups/:id/activities — paginated activity feed
  router.get('/:id/activities', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const { activities, total } = groupRepo.getActivities(group.id, { limit, offset });
      res.json({ activities, total, limit, offset });
    } catch (err) { next(err); }
  });

  return router;
};
