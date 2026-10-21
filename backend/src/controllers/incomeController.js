const asyncHandler = require('express-async-handler');
const Income = require('../models/Income');
const Counter = require('../models/Counter');
const Organization = require('../models/Organization');
const { getFinancialYear } = require('../utils/financialYear');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { source, status, from, to } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (source) filter.source = source;
  if (status) filter.status = status;
  if (from || to) filter.date = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const incomes = await Income.find(filter).sort({ date: -1 });
  return sendSuccess(res, { data: incomes });
});

// Manual entry point for non-Sale income (e.g. consultation fees, misc
// income). Pharmacy sale income is derived from Sale/Payment records
// directly in Stage 9's analytics rather than double-entered here — this
// endpoint is for the OTHER_INCOME / CONSULTATION sources.
const create = asyncHandler(async (req, res) => {
  if (req.body.source === 'PHARMACY_SALE' && !req.body.sale) {
    return sendError(res, { statusCode: 400, message: 'source PHARMACY_SALE requires a linked sale — use this endpoint only for CONSULTATION/OTHER_INCOME' });
  }
  const org = await Organization.findById(req.organizationId);
  const seq = await Counter.nextSequence(req.organizationId, 'INCOME');
  const incomeNumber = `INC-${String(seq).padStart(6, '0')}`;
  const financialYear = getFinancialYear(req.body.date, org?.financialYearStartMonth);

  const income = await Income.create({ ...req.body, incomeNumber, financialYear, organizationId: req.organizationId, branchId: req.branchId, createdBy: req.user._id });
  await logAction({ req, action: 'INCOME_RECORDED', entityType: 'Income', entityId: income._id, description: `Income ${incomeNumber} for ${income.amount} recorded` });
  return sendSuccess(res, { statusCode: 201, data: income });
});

const cancel = asyncHandler(async (req, res) => {
  const income = await Income.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { status: 'CANCELLED' }, { new: true });
  if (!income) return sendError(res, { statusCode: 404, message: 'Income record not found' });
  await logAction({ req, action: 'INCOME_CANCELLED', entityType: 'Income', entityId: income._id, description: `Income ${income.incomeNumber} cancelled` });
  return sendSuccess(res, { data: income });
});

module.exports = { list, create, cancel };
