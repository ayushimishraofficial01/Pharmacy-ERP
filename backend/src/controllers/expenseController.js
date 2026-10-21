const asyncHandler = require('express-async-handler');
const Expense = require('../models/Expense');
const Counter = require('../models/Counter');
const Organization = require('../models/Organization');
const { getFinancialYear } = require('../utils/financialYear');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// Phase 8 section 12: a configurable threshold above which a "Large Expense"
// alert should fire. Kept simple here (fixed default); Stage 9 makes this a
// per-org configurable AlertRule.
const LARGE_EXPENSE_THRESHOLD = 50000;

const list = asyncHandler(async (req, res) => {
  const { category, status, from, to } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (from || to) filter.date = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const expenses = await Expense.find(filter).populate('category', 'name').sort({ date: -1 });
  return sendSuccess(res, { data: expenses });
});

const create = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.organizationId);
  const seq = await Counter.nextSequence(req.organizationId, 'EXPENSE');
  const expenseNumber = `EXP-${String(seq).padStart(6, '0')}`;
  const financialYear = getFinancialYear(req.body.date, org?.financialYearStartMonth);

  const expense = await Expense.create({ ...req.body, expenseNumber, financialYear, organizationId: req.organizationId, branchId: req.branchId, createdBy: req.user._id });

  await logAction({
    req,
    action: Number(expense.amount) >= LARGE_EXPENSE_THRESHOLD ? 'LARGE_EXPENSE_RECORDED' : 'EXPENSE_RECORDED',
    entityType: 'Expense',
    entityId: expense._id,
    description: `Expense ${expenseNumber} for ${expense.amount} recorded`,
  });

  return sendSuccess(res, { statusCode: 201, data: expense });
});

const cancel = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { status: 'CANCELLED' }, { new: true });
  if (!expense) return sendError(res, { statusCode: 404, message: 'Expense not found' });
  await logAction({ req, action: 'EXPENSE_CANCELLED', entityType: 'Expense', entityId: expense._id, description: `Expense ${expense.expenseNumber} cancelled` });
  return sendSuccess(res, { data: expense });
});

module.exports = { list, create, cancel };
