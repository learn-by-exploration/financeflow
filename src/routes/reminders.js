const express = require('express');
const router = express.Router();
const { createReminderSchema, updateReminderSchema } = require('../schemas/reminder.schema');
const createReminderRepository = require('../repositories/reminder.repository');

module.exports = function createReminderRoutes({ db, audit }) {
  const reminderRepo = createReminderRepository({ db });

  // GET /api/reminders — list user's bill reminders
  router.get('/', (req, res, next) => {
    try {
      const reminders = reminderRepo.findAllByUser(req.user.id);
      res.json({ reminders });
    } catch (err) { next(err); }
  });

  // GET /api/reminders/upcoming — upcoming bills
  router.get('/upcoming', (req, res, next) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      const upcoming = reminderRepo.getUpcoming(req.user.id, days);
      res.json({ upcoming, days });
    } catch (err) { next(err); }
  });

  // POST /api/reminders — create reminder
  router.post('/', (req, res, next) => {
    try {
      const parsed = createReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }
      // Verify ownership of linked entity
      if (parsed.data.subscription_id) {
        const sub = db.prepare('SELECT id FROM subscriptions WHERE id = ? AND user_id = ?').get(parsed.data.subscription_id, req.user.id);
        if (!sub) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Subscription not found' } });
      }
      if (parsed.data.recurring_rule_id) {
        const rule = db.prepare('SELECT id FROM recurring_rules WHERE id = ? AND user_id = ?').get(parsed.data.recurring_rule_id, req.user.id);
        if (!rule) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Recurring rule not found' } });
      }
      const reminder = reminderRepo.create(req.user.id, parsed.data);
      audit.log(req.user.id, 'reminder.create', 'bill_reminder', reminder.id);
      res.status(201).json({ reminder });
    } catch (err) { next(err); }
  });

  // PUT /api/reminders/:id — update reminder
  router.put('/:id', (req, res, next) => {
    try {
      const existing = reminderRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reminder not found' } });

      const parsed = updateReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, details: parsed.error.issues } });
      }

      const reminder = reminderRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'reminder.update', 'bill_reminder', reminder.id);
      res.json({ reminder });
    } catch (err) { next(err); }
  });

  // DELETE /api/reminders/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = reminderRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reminder not found' } });
      reminderRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'reminder.delete', 'bill_reminder', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
