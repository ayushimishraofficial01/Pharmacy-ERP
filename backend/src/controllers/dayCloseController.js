const asyncHandler = require('express-async-handler');
const DayClose = require('../models/DayClose');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Purchase = require('../models/Purchase');
const Organization = require('../models/Organization');
const { getFinancialYear } = require('../utils/financialYear');
const money = require('../utils/money');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// Variance beyond this must carry an explanation (Phase 8 section 6:
// "Require explanation for significant variance").
const SIGNIFICANT_VARIANCE_THRESHOLD = 200;

function dayBounds(dateStr) {
  const start = new Date(dateStr);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// GET /api/day-close/preview?date=YYYY-MM-DD
// Computes expected cash from actual transaction data so the closer isn't
// hand-typing every figure — pulled straight from the same collections
// Stage 3/4 write to (Payment for sale receipts, Expense for cash-outs,
// Purchase for cash purchases/supplier payments).
const preview = asyncHandler(async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
  const { start, end } = dayBounds(dateStr);
  const filter = { organizationId: req.organizationId, branchId: req.branchId };

  const [cashSalePayments, cashRefunds, cashExpenses, cashPurchases] = await Promise.all([
    Payment.find({ ...filter, direction: 'IN', method: 'CASH', referenceType: 'Sale', paymentDate: { $gte: start, $lt: end } }),
    Payment.find({ ...filter, direction: 'OUT', method: 'CASH', referenceType: 'SalesReturn', paymentDate: { $gte: start, $lt: end } }),
    Expense.find({ ...filter, paymentMethod: 'CASH', status: 'RECORDED', date: { $gte: start, $lt: end } }),
    Purchase.find({ ...filter, purchaseType: 'CASH', status: 'ACTIVE', createdAt: { $gte: start, $lt: end } }),
  ]);

  const cashSales = money.sum(...cashSalePayments.map((p) => p.amount));
  const cashRefundsTotal = money.sum(...cashRefunds.map((p) => p.amount));
  const cashExpensesTotal = money.sum(...cashExpenses.map((e) => e.amount));
  const cashPurchasesTotal = money.sum(...cashPurchases.map((p) => p.paidAmount));

  const previousClose = await DayClose.findOne({ ...filter, closingDate: { $lt: start } }).sort({ closingDate: -1 });
  const openingCash = previousClose ? previousClose.actualCash : 0;

  return sendSuccess(res, {
    data: {
      closingDate: dateStr,
      openingCash,
      cashSales,
      cashPaymentsReceived: cashSales, // alias kept for Phase 6 field-name compatibility
      cashExpenses: cashExpensesTotal,
      cashPurchases: cashPurchasesTotal,
      cashSupplierPayments: 0, // supplier cash payments outside of a Purchase itself — Stage 9 wires a standalone payment flow if needed
      cashRefunds: cashRefundsTotal,
    },
  });
});

// POST /api/day-close
// body: { closingDate, openingCash, cashSales, cashExpenses, cashPurchases,
//         cashSupplierPayments, cashRefunds, cashIn, cashOut, actualCash, varianceExplanation, notes }
const closeDay = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.closingDate || body.actualCash === undefined) {
    return sendError(res, { statusCode: 400, message: 'closingDate and actualCash are required' });
  }

  const existing = await DayClose.findOne({ organizationId: req.organizationId, branchId: req.branchId, closingDate: new Date(body.closingDate) });
  if (existing) return sendError(res, { statusCode: 409, message: `Day ${body.closingDate} is already closed` });

  const expectedCash = money.sum(
    body.openingCash || 0,
    body.cashSales || 0,
    body.cashPaymentsReceived || body.cashSales || 0,
    body.cashIn || 0,
    -(body.cashExpenses || 0),
    -(body.cashPurchases || 0),
    -(body.cashSupplierPayments || 0),
    -(body.cashRefunds || 0),
    -(body.cashOut || 0)
  );
  const actualCash = money.clean(body.actualCash);
  const difference = money.subtract(actualCash, expectedCash);

  if (Math.abs(difference) >= SIGNIFICANT_VARIANCE_THRESHOLD && !body.varianceExplanation) {
    return sendError(res, { statusCode: 400, message: `Cash variance of ${difference} requires an explanation before closing.` });
  }

  const org = await Organization.findById(req.organizationId);
  const financialYear = getFinancialYear(body.closingDate, org?.financialYearStartMonth);

  const dayClose = await DayClose.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    closingDate: body.closingDate,
    openingCash: body.openingCash || 0,
    cashSales: body.cashSales || 0,
    cashPaymentsReceived: body.cashPaymentsReceived || body.cashSales || 0,
    cashExpenses: body.cashExpenses || 0,
    cashPurchases: body.cashPurchases || 0,
    cashSupplierPayments: body.cashSupplierPayments || 0,
    cashRefunds: body.cashRefunds || 0,
    cashIn: body.cashIn || 0,
    cashOut: body.cashOut || 0,
    expectedCash,
    actualCash,
    difference,
    varianceExplanation: body.varianceExplanation || '',
    notes: body.notes || '',
    closedBy: req.user._id,
    financialYear,
  });

  await logAction({
    req,
    action: Math.abs(difference) >= SIGNIFICANT_VARIANCE_THRESHOLD ? 'NEGATIVE_CASH_VARIANCE' : 'DAY_CLOSE',
    entityType: 'DayClose',
    entityId: dayClose._id,
    description: `Day ${body.closingDate} closed. Expected ${expectedCash}, actual ${actualCash}, variance ${difference}`,
  });

  return sendSuccess(res, { statusCode: 201, message: 'Day closed', data: dayClose });
});

const list = asyncHandler(async (req, res) => {
  const closes = await DayClose.find({ organizationId: req.organizationId, branchId: req.branchId }).sort({ closingDate: -1 });
  return sendSuccess(res, { data: closes });
});

module.exports = { preview, closeDay, list };
