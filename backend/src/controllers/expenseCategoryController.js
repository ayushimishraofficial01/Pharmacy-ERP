const asyncHandler = require('express-async-handler');
const ExpenseCategory = require('../models/ExpenseCategory');
const buildMasterController = require('./masterController');
const { sendSuccess } = require('../utils/apiResponse');

const base = buildMasterController(ExpenseCategory, 'ExpenseCategory');

// POST /api/expense-categories/seed-defaults — one-time helper for a new
// organization to populate Phase 6's default category list instead of
// typing them in one at a time.
const seedDefaults = asyncHandler(async (req, res) => {
  const existing = await ExpenseCategory.find({ organizationId: req.organizationId }).distinct('name');
  const toCreate = ExpenseCategory.DEFAULT_EXPENSE_CATEGORIES.filter((n) => !existing.includes(n));
  const created = await ExpenseCategory.insertMany(toCreate.map((name) => ({ name, organizationId: req.organizationId })));
  return sendSuccess(res, { statusCode: 201, message: `${created.length} default categories added`, data: created });
});

module.exports = { ...base, seedDefaults };
