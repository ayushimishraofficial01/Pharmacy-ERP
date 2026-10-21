const asyncHandler = require('express-async-handler');
const StockCount = require('../models/StockCount');
const Batch = require('../models/Batch');
const Counter = require('../models/Counter');
const { applyStockMovement } = require('../services/stockService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/stock-counts — DRAFT, snapshots current system quantity per line.
const create = asyncHandler(async (req, res) => {
  const { batchIds, scope, notes } = req.body;
  if (!Array.isArray(batchIds) || batchIds.length === 0) return sendError(res, { statusCode: 400, message: 'At least one batch is required' });

  const batches = await Batch.find({ _id: { $in: batchIds }, organizationId: req.organizationId, branchId: req.branchId }).populate('medicine', 'name');
  if (batches.length !== batchIds.length) return sendError(res, { statusCode: 404, message: 'One or more batches not found in this branch' });

  const seq = await Counter.nextSequence(req.organizationId, 'STOCK_COUNT');
  const countNumber = `SC-${String(seq).padStart(6, '0')}`;

  const stockCount = await StockCount.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    countNumber,
    scope: scope || 'SELECTED_MEDICINES',
    notes: notes || '',
    lines: batches.map((b) => ({
      medicine: b.medicine._id,
      batch: b._id,
      medicineNameSnapshot: b.medicine.name,
      batchNumberSnapshot: b.batchNumber,
      systemQuantity: b.quantity,
    })),
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'STOCK_COUNT_CREATED', entityType: 'StockCount', entityId: stockCount._id, description: `Stock count ${countNumber} created with ${batches.length} lines` });
  return sendSuccess(res, { statusCode: 201, data: stockCount });
});

// PATCH /api/stock-counts/:id/lines — record physical counts.
// body: { lines: [{ lineId, physicalQuantity, notes }] }
const recordCounts = asyncHandler(async (req, res) => {
  const stockCount = await StockCount.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!stockCount) return sendError(res, { statusCode: 404, message: 'Stock count not found' });
  if (!['DRAFT', 'COUNTING'].includes(stockCount.status)) return sendError(res, { statusCode: 400, message: `Cannot record counts on a stock count with status ${stockCount.status}` });

  for (const line of req.body.lines || []) {
    const target = stockCount.lines.id(line.lineId);
    if (!target) continue;
    target.physicalQuantity = Number(line.physicalQuantity);
    target.variance = target.physicalQuantity - target.systemQuantity;
    target.notes = line.notes || '';
  }
  stockCount.status = 'COUNTING';
  await stockCount.save();
  return sendSuccess(res, { data: stockCount });
});

// POST /api/stock-counts/:id/submit — moves to PENDING_APPROVAL, computes value impact.
const submit = asyncHandler(async (req, res) => {
  const stockCount = await StockCount.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId }).populate('lines.batch', 'purchaseRate');
  if (!stockCount) return sendError(res, { statusCode: 404, message: 'Stock count not found' });
  if (stockCount.lines.some((l) => l.physicalQuantity === null)) {
    return sendError(res, { statusCode: 400, message: 'Every line must have a physical quantity recorded before submitting' });
  }

  for (const line of stockCount.lines) {
    const rate = line.batch?.purchaseRate || 0;
    line.valueImpact = Number((line.variance * rate).toFixed(2));
  }
  stockCount.status = 'PENDING_APPROVAL';
  stockCount.submittedBy = req.user._id;
  stockCount.submittedAt = new Date();
  await stockCount.save();

  await logAction({ req, action: 'STOCK_COUNT_SUBMITTED', entityType: 'StockCount', entityId: stockCount._id, description: `Stock count ${stockCount.countNumber} submitted for approval` });
  return sendSuccess(res, { data: stockCount });
});

// POST /api/stock-counts/:id/approve-and-adjust — Phase 8 section 5:
// "Require authorization before final adjustment." Restricted to ADMIN+ in
// the route file. Applies every line's variance via stockService so it's
// recorded in the normal StockTransaction ledger as STOCK_COUNT_CORRECTION.
const approveAndAdjust = asyncHandler(async (req, res) => {
  const stockCount = await StockCount.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!stockCount) return sendError(res, { statusCode: 404, message: 'Stock count not found' });
  if (stockCount.status !== 'PENDING_APPROVAL') return sendError(res, { statusCode: 400, message: `Only a PENDING_APPROVAL stock count can be approved (current status: ${stockCount.status})` });

  for (const line of stockCount.lines) {
    if (line.variance === 0) continue;
    await applyStockMovement({
      organizationId: req.organizationId,
      branchId: req.branchId,
      batchId: line.batch,
      signedQuantity: line.variance,
      transactionType: 'STOCK_COUNT_CORRECTION',
      referenceType: 'StockCount',
      referenceId: stockCount._id,
      reason: `Stock count ${stockCount.countNumber} approved by ${req.user.email}`,
      userId: req.user._id,
    });
  }

  stockCount.status = 'ADJUSTED';
  stockCount.approvedBy = req.user._id;
  stockCount.approvedAt = new Date();
  stockCount.adjustedAt = new Date();
  await stockCount.save();

  await logAction({ req, action: 'STOCK_COUNT_APPROVED', entityType: 'StockCount', entityId: stockCount._id, description: `Stock count ${stockCount.countNumber} approved and stock adjusted` });
  return sendSuccess(res, { data: stockCount });
});

const list = asyncHandler(async (req, res) => {
  const counts = await StockCount.find({ organizationId: req.organizationId, branchId: req.branchId }).select('-lines').sort({ createdAt: -1 });
  return sendSuccess(res, { data: counts });
});

const getOne = asyncHandler(async (req, res) => {
  const stockCount = await StockCount.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!stockCount) return sendError(res, { statusCode: 404, message: 'Stock count not found' });
  return sendSuccess(res, { data: stockCount });
});

module.exports = { create, recordCounts, submit, approveAndAdjust, list, getOne };
