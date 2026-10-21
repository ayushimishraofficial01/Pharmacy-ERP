const asyncHandler = require('express-async-handler');
const Batch = require('../models/Batch');
const { applyStockMovement } = require('../services/stockService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// List batches for a medicine in the current branch (used by POS/inventory
// screens to pick which batch to sell from, oldest-expiry-first).
const listForMedicine = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    organizationId: req.organizationId,
    branchId: req.branchId,
    medicine: req.params.medicineId,
    isActive: true,
  }).sort({ expiryDate: 1 });
  return sendSuccess(res, { data: batches });
});

// Manual stock adjustment (damage, correction, opening stock entry).
// Purchases, sales, returns, transfers, and stock counts each get their own
// controller in later stages that also calls applyStockMovement — this one
// is specifically for ad-hoc manual adjustments.
const adjustStock = asyncHandler(async (req, res) => {
  const { batchId, signedQuantity, transactionType, reason, notes } = req.body;
  if (!batchId || !signedQuantity || !transactionType) {
    return sendError(res, { statusCode: 400, message: 'batchId, signedQuantity and transactionType are required.' });
  }
  const allowedManualTypes = ['OPENING_STOCK', 'ADJUSTMENT', 'DAMAGE', 'EXPIRED', 'STOCK_COUNT_CORRECTION'];
  if (!allowedManualTypes.includes(transactionType)) {
    return sendError(res, { statusCode: 400, message: `Manual adjustments must use one of: ${allowedManualTypes.join(', ')}` });
  }

  const result = await applyStockMovement({
    organizationId: req.organizationId,
    branchId: req.branchId,
    batchId,
    signedQuantity: Number(signedQuantity),
    transactionType,
    referenceType: 'Manual',
    reason,
    notes,
    userId: req.user._id,
  });

  await logAction({
    req,
    action: 'STOCK_ADJUSTMENT',
    entityType: 'Batch',
    entityId: batchId,
    description: `Manual ${transactionType} of ${signedQuantity} on batch ${result.batch.batchNumber}: ${reason || 'no reason given'}`,
  });

  return sendSuccess(res, { message: 'Stock adjusted', data: result });
});

module.exports = { listForMedicine, adjustStock };
