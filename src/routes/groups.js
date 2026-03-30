const express = require('express');
const router = express.Router();
const { createGroupSchema, addMemberSchema, updateGroupSchema } = require('../schemas/group.schema');
const createGroupRepository = require('../repositories/group.repository');

module.exports = function createGroupRoutes({ db, audit }) {

  const groupRepo = createGroupRepository({ db });

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
      const { username, display_name } = req.body;
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

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

      groupRepo.removeMember(req.params.memberId, req.params.id);
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
      if (!name || !period) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name and period are required' } });
      }

      const { budget, items: insertedItems } = groupRepo.createSharedBudget(req.params.id, name, period, items);
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
      const budget = groupRepo.updateSharedBudget(existing.id, { name, period, is_active });
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

  return router;
};
