const asyncHandler = require('express-async-handler');
const Batch = require('../models/Batch');
const { getReturnableBatches, createExpiryReturn } = require('../services/expiryReturnService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const BUCKETS = [
  { key: 'EXPIRED', label: 'Expired', min: -Infinity, max: 0 },
  { key: 'D0_30', label: '0-30 Days', min: 0, max: 30 },
  { key: 'D31_60', label: '31-60 Days', min: 31, max: 60 },
  { key: 'D61_90', label: '61-90 Days', min: 61, max: 90 },
  { key: 'D91_180', label: '91-180 Days', min: 91, max: 180 },
];

function bucketFor(daysToExpiry) {
  if (daysToExpiry < 0) return 'EXPIRED';
  if (daysToExpiry <= 30) return 'D0_30';
  if (daysToExpiry <= 60) return 'D31_60';
  if (daysToExpiry <= 90) return 'D61_90';
  if (daysToExpiry <= 180) return 'D91_180';
  return null; // beyond 180 days, not shown on the expiry dashboard
}

// GET /api/expiry/dashboard — Phase 8 section 4.
const dashboard = asyncHandler(async (req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 180);

  const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, isActive: true, quantity: { $gt: 0 }, expiryDate: { $lte: cutoff } })
    .populate('medicine', 'name medicineCode')
    .sort({ expiryDate: 1 });

  const grouped = { EXPIRED: [], D0_30: [], D31_60: [], D61_90: [], D91_180: [] };
  const now = Date.now();

  for (const batch of batches) {
    const daysToExpiry = Math.floor((batch.expiryDate.getTime() - now) / (24 * 60 * 60 * 1000));
    const key = bucketFor(daysToExpiry);
    if (!key) continue;
    grouped[key].push({
      medicine: batch.medicine,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: batch.quantity,
      costValue: Number((batch.quantity * batch.purchaseRate).toFixed(2)),
      mrpValue: Number((batch.quantity * batch.mrp).toFixed(2)),
      branchId: batch.branchId,
    });
  }

  const summary = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: grouped[b.key].length,
    totalQuantity: grouped[b.key].reduce((s, i) => s + i.quantity, 0),
    totalCostValue: Number(grouped[b.key].reduce((s, i) => s + i.costValue, 0).toFixed(2)),
    totalMrpValue: Number(grouped[b.key].reduce((s, i) => s + i.mrpValue, 0).toFixed(2)),
  }));

  return sendSuccess(res, { data: { summary, buckets: grouped } });
});

// GET /api/expiry/near-expiry-report?days=90
const nearExpiryReport = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, isActive: true, quantity: { $gt: 0 }, expiryDate: { $gt: new Date(), $lte: cutoff } })
    .populate('medicine', 'name medicineCode')
    .sort({ expiryDate: 1 });

  return sendSuccess(res, { data: batches });
});

// GET /api/expiry/stock-valuation — expired + near-expiry stock tied up in value.
const stockValuation = asyncHandler(async (req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 180);
  const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, isActive: true, quantity: { $gt: 0 }, expiryDate: { $lte: cutoff } });

  const totalCostValue = batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0);
  const totalMrpValue = batches.reduce((s, b) => s + b.quantity * b.mrp, 0);
  const expiredCostValue = batches.filter((b) => b.expiryDate < new Date()).reduce((s, b) => s + b.quantity * b.purchaseRate, 0);

  return sendSuccess(res, {
    data: {
      totalBatchesAtRisk: batches.length,
      totalCostValue: Number(totalCostValue.toFixed(2)),
      totalMrpValue: Number(totalMrpValue.toFixed(2)),
      expiredCostValue: Number(expiredCostValue.toFixed(2)),
    },
  });
});

// GET /api/expiry/returnable-batches?days=90 — requirement 16: near-expiry
// detection feeding directly into "select batch" for a supplier return.
const returnableBatches = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 90;
  const batches = await getReturnableBatches({ organizationId: req.organizationId, branchId: req.branchId, days });
  return sendSuccess(res, { data: batches });
});

// POST /api/expiry/returns  { batch, quantity, reason, settlementType? }
const createReturn = asyncHandler(async (req, res) => {
  const { batch, quantity, reason, settlementType } = req.body;
  if (!batch || !quantity) return sendError(res, { statusCode: 400, message: 'batch and quantity are required' });
  if (!reason || !reason.trim()) return sendError(res, { statusCode: 400, message: 'A reason is required for an expiry return' });

  try {
    const purchaseReturns = await createExpiryReturn({ organizationId: req.organizationId, branchId: req.branchId, batchId: batch, quantity, reason, settlementType, userId: req.user._id });
    for (const pr of purchaseReturns) {
      await logAction({ req, action: 'EXPIRY_RETURN_CREATED', entityType: 'PurchaseReturn', entityId: pr._id, description: `Expiry return ${pr.returnNumber} created (${reason})` });
    }
    return sendSuccess(res, { statusCode: 201, data: purchaseReturns, message: `${purchaseReturns.length} return document(s) created` });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { dashboard, nearExpiryReport, stockValuation, returnableBatches, createReturn };
