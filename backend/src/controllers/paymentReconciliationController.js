const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const Payment = require('../models/Payment');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/payment-reconciliation?from=&to=
// Phase 8 section 7: compare sales payment records (what Sale.grandTotal
// says was owed) against actual Payment records received, by method.
// Flags discrepancies for review rather than auto-correcting anything.
const reconcile = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);

  const saleFilter = { organizationId: req.organizationId, branchId: req.branchId, status: { $ne: 'CANCELLED' } };
  if (from || to) saleFilter.saleDate = dateFilter;
  const sales = await Sale.find(saleFilter);

  const paymentFilter = { organizationId: req.organizationId, branchId: req.branchId, direction: 'IN', referenceType: 'Sale' };
  if (from || to) paymentFilter.paymentDate = dateFilter;
  const payments = await Payment.find(paymentFilter);

  const expectedTotal = sales.reduce((s, sale) => s + sale.grandTotal, 0);
  const expectedByMethod = {};
  for (const sale of sales) {
    for (const p of sale.payments) {
      expectedByMethod[p.method] = (expectedByMethod[p.method] || 0) + p.amount;
    }
  }

  const actualTotal = payments.reduce((s, p) => s + p.amount, 0);
  const actualByMethod = {};
  for (const p of payments) {
    actualByMethod[p.method] = (actualByMethod[p.method] || 0) + p.amount;
  }

  const methods = new Set([...Object.keys(expectedByMethod), ...Object.keys(actualByMethod)]);
  const byMethod = Array.from(methods).map((method) => {
    const expected = Number((expectedByMethod[method] || 0).toFixed(2));
    const actual = Number((actualByMethod[method] || 0).toFixed(2));
    const discrepancy = Number((actual - expected).toFixed(2));
    return { method, expected, actual, discrepancy, flagged: Math.abs(discrepancy) >= 1 };
  });

  const totalCollected = sales.reduce((s, sale) => s + sale.paidAmount, 0);
  const totalOutstanding = sales.reduce((s, sale) => s + sale.outstandingAmount, 0);

  return sendSuccess(res, {
    data: {
      period: { from: from || null, to: to || null },
      salesCount: sales.length,
      expectedTotal: Number(expectedTotal.toFixed(2)),
      actualTotal: Number(actualTotal.toFixed(2)),
      totalCollected: Number(totalCollected.toFixed(2)),
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      byMethod,
      hasDiscrepancies: byMethod.some((m) => m.flagged),
    },
  });
});

module.exports = { reconcile };
