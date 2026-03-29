const express = require('express');
const router = express.Router();

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
      const { name, icon, color } = req.body;
      if (!name) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Group name is required' } });
      }
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

  // POST /api/groups/:id/members — add member
  router.post('/:id/members', (req, res, next) => {
    try {
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

  return router;
};
