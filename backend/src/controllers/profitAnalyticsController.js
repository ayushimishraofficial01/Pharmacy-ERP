const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Expense = require('../models/Expense');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// GET /api/profit-analytics?from=&to=
// Phase 8 section 8: Net Sales, COGS, Gross Profit, Gross Margin, Expenses,
// Net Profit. Uses SaleItem.purchaseRateSnapshot (captured at sale time in
// Stage 4) for COGS — never re-reads Batch.purchaseRate now, since that
// would silently rewrite historical margins if purchase costs changed
// since. GST is excluded from both revenue and COGS since Sale.taxableAmount
// already strips it out — this is the "do not double-count GST" rule.
const summary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return sendError(res, { statusCode: 400, message: 'from and to query params are required (YYYY-MM-DD)' });

  const dateFilter = { $gte: new Date(from), $lte: new Date(to) };
  const sales = await Sale.find({ organizationId: req.organizationId, branchId: req.branchId, status: { $ne: 'CANCELLED' }, saleDate: dateFilter });
  const saleIds = sales.map((s) => s._id);
  const saleItems = await SaleItem.find({ organizationId: req.organizationId, sale: { $in: saleIds } });

  const netSales = sales.reduce((s, sale) => s + sale.taxableAmount, 0);

  const cogs = saleItems.reduce((s, item) => {
    const rate = item.purchaseRateSnapshot ?? 0;
    return s + rate * item.quantity;
  }, 0);

  const grossProfit = netSales - cogs;
  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  const expenses = await Expense.find({ organizationId: req.organizationId, branchId: req.branchId, status: 'RECORDED', date: dateFilter });
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const netProfit = grossProfit - totalExpenses;

  return sendSuccess(res, {
    data: {
      period: { from, to },
      netSales: Number(netSales.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossMargin: Number(grossMargin.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      salesCount: sales.length,
      itemsMissingCostData: saleItems.filter((i) => i.purchaseRateSnapshot == null).length,
    },
  });
});

module.exports = { summary };
