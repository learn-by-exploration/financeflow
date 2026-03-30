const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const createGroupRepository = require('../repositories/group.repository');

module.exports = function createGroupInviteRoutes({ db, audit }) {

  const groupRepo = createGroupRepository({ db });

  // POST /api/groups/:id/invites — create invite (owner only)
  router.post('/:id/invites', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only group owners can create invites' } });
      }

      const token = crypto.randomBytes(24).toString('hex');
      const { expires_at, max_uses } = req.body || {};

      const result = db.prepare(
        'INSERT INTO group_invites (group_id, token, created_by, expires_at, max_uses) VALUES (?, ?, ?, ?, ?)'
      ).run(group.id, token, req.user.id, expires_at || null, max_uses || 0);

      const invite = db.prepare('SELECT * FROM group_invites WHERE id = ?').get(result.lastInsertRowid);

      audit.log(req.user.id, 'group_invite.create', 'group_invite', invite.id);
      res.status(201).json({
        id: invite.id,
        token: invite.token,
        invite_url: '/join/' + invite.token,
        expires_at: invite.expires_at,
        max_uses: invite.max_uses,
      });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id/invites — list active invites (owner only)
  router.get('/:id/invites', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only group owners can list invites' } });
      }

      const invites = db.prepare('SELECT * FROM group_invites WHERE group_id = ? ORDER BY created_at DESC').all(group.id);
      res.json({ invites });
    } catch (err) { next(err); }
  });

  // POST /api/groups/join/:token — join group via invite
  router.post('/join/:token', (req, res, next) => {
    try {
      const invite = db.prepare('SELECT * FROM group_invites WHERE token = ?').get(req.params.token);
      if (!invite) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } });

      // Check expiration
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ error: { code: 'GONE', message: 'Invite has expired' } });
      }

      // Check max uses
      if (invite.max_uses > 0 && invite.use_count >= invite.max_uses) {
        return res.status(410).json({ error: { code: 'GONE', message: 'Invite has reached maximum uses' } });
      }

      // Check if user is already a member
      const existing = groupRepo.getMembership(invite.group_id, req.user.id);
      if (existing) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Already a member of this group' } });
      }

      // Add user to group
      const displayName = req.user.displayName || req.user.display_name || req.user.username;
      groupRepo.addMember(invite.group_id, req.user.id, displayName, 'member');

      // Increment use_count
      db.prepare('UPDATE group_invites SET use_count = use_count + 1 WHERE id = ?').run(invite.id);

      const group = groupRepo.findById(invite.group_id);
      audit.log(req.user.id, 'group_invite.join', 'group', invite.group_id);

      res.json({ group });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/invites/:inviteId — revoke invite (owner only)
  router.delete('/:id/invites/:inviteId', (req, res, next) => {
    try {
      const group = groupRepo.findById(req.params.id);
      if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });

      const membership = groupRepo.getMembership(group.id, req.user.id);
      if (!membership || membership.role !== 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only group owners can revoke invites' } });
      }

      const invite = db.prepare('SELECT * FROM group_invites WHERE id = ? AND group_id = ?').get(req.params.inviteId, group.id);
      if (!invite) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } });

      db.prepare('DELETE FROM group_invites WHERE id = ?').run(invite.id);
      audit.log(req.user.id, 'group_invite.revoke', 'group_invite', invite.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
