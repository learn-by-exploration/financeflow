const express = require('express');
const router = express.Router();
const createNotificationRepository = require('../repositories/notification.repository');
const { notificationQuerySchema } = require('../schemas/notification.schema');

module.exports = function createNotificationRoutes({ db }) {
  const notifRepo = createNotificationRepository({ db });

  // GET /api/notifications
  router.get('/', (req, res, next) => {
    try {
      const parsed = notificationQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      }
      const { limit, offset, unread_only } = parsed.data;
      const result = notifRepo.findAllByUser(req.user.id, { limit, offset, unread_only });
      res.json({
        notifications: result.notifications,
        unread_count: result.unread_count,
        total: result.total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (err) { next(err); }
  });

  // PUT /api/notifications/:id/read
  router.put('/:id/read', (req, res, next) => {
    try {
      const notification = notifRepo.findById(req.params.id, req.user.id);
      if (!notification) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      }
      const updated = notifRepo.markRead(req.params.id, req.user.id);
      res.json({ notification: updated });
    } catch (err) { next(err); }
  });

  // POST /api/notifications/read-all
  router.post('/read-all', (req, res, next) => {
    try {
      const count = notifRepo.markAllRead(req.user.id);
      res.json({ ok: true, updated: count });
    } catch (err) { next(err); }
  });

  // DELETE /api/notifications/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const notification = notifRepo.findById(req.params.id, req.user.id);
      if (!notification) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      }
      notifRepo.delete(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
