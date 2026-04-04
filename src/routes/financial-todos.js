// src/routes/financial-todos.js
const express = require('express');
const router = express.Router();
const { createTodoSchema, updateTodoSchema } = require('../schemas/financial-todo.schema');
const createFinancialTodoRepository = require('../repositories/financial-todo.repository');

module.exports = function createFinancialTodoRoutes({ db, audit }) {

  const todoRepo = createFinancialTodoRepository({ db });

  // GET /api/financial-todos
  router.get('/', (req, res, next) => {
    try {
      const { limit, offset, status, priority } = req.query;
      const filters = { limit: limit || 50, offset: offset || 0, status, priority };
      const todos = todoRepo.findAllByUser(req.user.id, filters);
      const total = todoRepo.countByUser(req.user.id, filters);
      res.json({ todos, total, limit: Number(filters.limit), offset: Number(filters.offset) });
    } catch (err) { next(err); }
  });

  // POST /api/financial-todos
  router.post('/', (req, res, next) => {
    try {
      const parsed = createTodoSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const todo = todoRepo.create(req.user.id, parsed.data);
      audit.log(req.user.id, 'financial_todo.create', 'financial_todo', todo.id);
      res.status(201).json({ todo });
    } catch (err) { next(err); }
  });

  // PUT /api/financial-todos/:id
  router.put('/:id', (req, res, next) => {
    try {
      const existing = todoRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Todo not found' } });
      const parsed = updateTodoSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
      const todo = todoRepo.update(req.params.id, req.user.id, parsed.data);
      audit.log(req.user.id, 'financial_todo.update', 'financial_todo', todo.id);
      res.json({ todo });
    } catch (err) { next(err); }
  });

  // DELETE /api/financial-todos/:id
  router.delete('/:id', (req, res, next) => {
    try {
      const existing = todoRepo.findById(req.params.id, req.user.id);
      if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Todo not found' } });
      todoRepo.delete(req.params.id, req.user.id);
      audit.log(req.user.id, 'financial_todo.delete', 'financial_todo', req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
