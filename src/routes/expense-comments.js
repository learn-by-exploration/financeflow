const express = require('express');
const router = express.Router();
const createGroupRepository = require('../repositories/group.repository');

module.exports = function createExpenseCommentRoutes({ db, audit: _audit }) {

  const groupRepo = createGroupRepository({ db });

  // POST /api/groups/:gid/expenses/:eid/comments — add comment
  router.post('/:gid/expenses/:eid/comments', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.gid, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const expense = db.prepare('SELECT * FROM shared_expenses WHERE id = ? AND group_id = ?').get(req.params.eid, req.params.gid);
      if (!expense) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });

      const { comment } = req.body || {};
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Comment is required' } });
      }
      if (comment.length > 500) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Comment must be 500 characters or less' } });
      }

      const result = db.prepare(
        'INSERT INTO expense_comments (expense_id, user_id, comment) VALUES (?, ?, ?)'
      ).run(expense.id, req.user.id, comment.trim());

      const created = db.prepare(`
        SELECT ec.*, u.display_name FROM expense_comments ec
        JOIN users u ON ec.user_id = u.id
        WHERE ec.id = ?
      `).get(result.lastInsertRowid);

      res.status(201).json({ comment: created });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:gid/expenses/:eid/comments — list comments
  router.get('/:gid/expenses/:eid/comments', (req, res, next) => {
    try {
      const membership = groupRepo.getMembership(req.params.gid, req.user.id);
      if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

      const expense = db.prepare('SELECT * FROM shared_expenses WHERE id = ? AND group_id = ?').get(req.params.eid, req.params.gid);
      if (!expense) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });

      const comments = db.prepare(`
        SELECT ec.*, u.display_name FROM expense_comments ec
        JOIN users u ON ec.user_id = u.id
        WHERE ec.expense_id = ?
        ORDER BY ec.created_at ASC, ec.id ASC
      `).all(expense.id);

      res.json({ comments });
    } catch (err) { next(err); }
  });

  return router;
};
