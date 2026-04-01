// src/schemas/report.schema.js — Zod schemas for report query params
const { z } = require('zod');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;

const yearInReviewSchema = z.object({
  year: z.string().regex(YEAR_RE, 'year must be YYYY format'),
});

const monthlyReportSchema = z.object({
  month: z.string().regex(MONTH_RE, 'month must be YYYY-MM format'),
});

const dateRangeSchema = z.object({
  from: z.string().regex(DATE_RE, 'from must be YYYY-MM-DD format').optional(),
  to: z.string().regex(DATE_RE, 'to must be YYYY-MM-DD format').optional(),
});

module.exports = { yearInReviewSchema, monthlyReportSchema, dateRangeSchema, DATE_RE, MONTH_RE, YEAR_RE };
