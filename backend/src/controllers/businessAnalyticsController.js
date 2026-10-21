const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Expense = require('../models/Expense');
const Batch = require('../models/Batch');
const Branch = require('../models/Branch');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function computeKpis({ organizationId, branchId, from, to }) {
  const dateFilter = { $gte: new Date(from), $lte: new Date(to) };
  const sales = await Sale.find({ organizationId, branchId, status: { $ne: 'CANCELLED' }, saleDate: dateFilter });
  const saleIds = sales.map((s) => s._id);
  const saleItems = await SaleItem.find({ organizationId, sale: { $in: saleIds } });
  const expenses = await Expense.find({ organizationId, branchId, status: 'RECORDED', date: dateFilter });
  const batches = await Batch.find({ organizationId, branchId, isActive: true });

  const revenue = sales.reduce((s, sale) => s + sale.grandTotal, 0);
  const netSales = sales.reduce((s, sale) => s + sale.taxableAmount, 0);
  const cogs = saleItems.reduce((s, item) => s + (item.purchaseRateSnapshot ?? 0) * item.quantity, 0);
  const grossProfit = netSales - cogs;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
  const numberOfBills = sales.length;
  const averageBillValue = numberOfBills > 0 ? revenue / numberOfBills : 0;
  const inventoryValue = batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0);
  const outstanding = sales.reduce((s, sale) => s + sale.outstandingAmount, 0);

  // Inventory turnover = COGS / period-end inventory value — a simplification;
  // a true average-inventory turnover needs a period-start snapshot, which
  // this app doesn't retain yet (noted as an open item in MERGE_NOTES.md).
  const inventoryTurnover = inventoryValue > 0 ? cogs / inventoryValue : 0;

  return {
    revenue: Number(revenue.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    grossMargin: Number(grossMargin.toFixed(2)),
    averageBillValue: Number(averageBillValue.toFixed(2)),
    numberOfBills,
    inventoryValue: Number(inventoryValue.toFixed(2)),
    inventoryTurnover: Number(inventoryTurnover.toFixed(2)),
    outstanding: Number(outstanding.toFixed(2)),
    expenses: Number(totalExpenses.toFixed(2)),
  };
}

const dashboard = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return sendError(res, { statusCode: 400, message: 'from and to query params are required (YYYY-MM-DD)' });
  const kpis = await computeKpis({ organizationId: req.organizationId, branchId: req.branchId, from, to });
  return sendSuccess(res, { data: { period: { from, to }, ...kpis } });
});

// GET /api/business-analytics/branch-comparison?from=&to=
const branchComparison = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return sendError(res, { statusCode: 400, message: 'from and to query params are required (YYYY-MM-DD)' });
  if (req.user.role !== 'SUPER_ADMIN') return sendError(res, { statusCode: 403, message: 'Branch comparison requires org-wide (SUPER_ADMIN) access' });

  const branches = await Branch.find({ organizationId: req.organizationId, status: 'ACTIVE' });
  const results = [];
  for (const branch of branches) {
    const kpis = await computeKpis({ organizationId: req.organizationId, branchId: branch._id, from, to });
    results.push({ branch: { _id: branch._id, branchName: branch.branchName, branchCode: branch.branchCode }, ...kpis });
  }

  return sendSuccess(res, { data: { period: { from, to }, branches: results } });
});

module.exports = { dashboard, branchComparison, computeKpis };
