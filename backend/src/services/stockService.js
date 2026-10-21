// The single choke point for stock mutation. Every module that touches
// stock (Purchase, Sale, Sales Return, Purchase Return, Stock Count,
// Stock Transfer — all future stages) MUST call this instead of writing to
// Batch.quantity directly, so StockTransaction stays a complete, trustworthy
// history. This is the rule Phase 3's Batch model comment referenced.
const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const StockTransaction = require('../models/StockTransaction');

/**
 * Apply a signed quantity change to a batch and record the transaction.
 * Runs inside a session/transaction so the Batch update and the
 * StockTransaction row can never diverge.
 *
 * @param {Object} params
 * @param {String} params.organizationId
 * @param {String} params.branchId
 * @param {String} params.batchId
 * @param {Number} params.signedQuantity  +ve to increase stock, -ve to decrease
 * @param {String} params.transactionType one of StockTransaction.STOCK_TRANSACTION_TYPES
 * @param {String} [params.referenceType]
 * @param {String} [params.referenceId]
 * @param {String} [params.reason]
 * @param {String} [params.notes]
 * @param {String} [params.userId]
 */
async function applyStockMovement({
  organizationId,
  branchId,
  batchId,
  signedQuantity,
  transactionType,
  referenceType = '',
  referenceId = null,
  reason = '',
  notes = '',
  userId = null,
}) {
  if (!signedQuantity || signedQuantity === 0) {
    throw Object.assign(new Error('signedQuantity must be non-zero'), { statusCode: 400 });
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const batch = await Batch.findOne({ _id: batchId, organizationId, branchId }).session(session);
      if (!batch) {
        throw Object.assign(new Error('Batch not found for this branch'), { statusCode: 404 });
      }

      const previousQuantity = batch.quantity;
      const newQuantity = previousQuantity + signedQuantity;
      if (newQuantity < 0) {
        throw Object.assign(
          new Error(`Insufficient stock: batch ${batch.batchNumber} has ${previousQuantity}, tried to move ${signedQuantity}`),
          { statusCode: 400 }
        );
      }

      batch.quantity = newQuantity;
      await batch.save({ session });

      const [txn] = await StockTransaction.create(
        [
          {
            organizationId,
            branchId,
            medicine: batch.medicine,
            batch: batch._id,
            transactionType,
            quantity: signedQuantity,
            previousQuantity,
            newQuantity,
            referenceType,
            referenceId,
            reason,
            notes,
            user: userId,
          },
        ],
        { session }
      );

      result = { batch, transaction: txn };
    });
    return result;
  } finally {
    session.endSession();
  }
}

/** Current/reserved/available stock for a medicine across all batches in a branch. */
async function getStockSummary({ organizationId, branchId, medicineId }) {
  const batches = await Batch.find({ organizationId, branchId, medicine: medicineId, isActive: true });
  const currentStock = batches.reduce((sum, b) => sum + b.quantity, 0);
  const reservedStock = batches.reduce((sum, b) => sum + (b.reservedQuantity || 0), 0);
  return {
    currentStock,
    reservedStock,
    availableStock: Math.max(0, currentStock - reservedStock),
    batches,
  };
}

/**
 * FEFO (First-Expiry-First-Out) allocation: given a required quantity, pick
 * batches oldest-expiry-first until the quantity is covered. Used by the
 * sale controller so cashiers don't have to manually pick batches, and so
 * near-expiry stock actually sells before it expires (feeds Stage 9's
 * expiry management too — this is the mechanism that keeps expiry risk
 * from silently building up).
 * 
 * IMPORTANT: Only allocates from batches with:
 * - quantity > 0 (in stock)
 * - sellingRate > 0 (pricing configured)
 * Batches with ₹0 selling rate are treated as pricing-not-configured and skipped.
 */
async function allocateFefo({ organizationId, branchId, medicineId, quantity, session }) {
  const batches = await Batch.find({ organizationId, branchId, medicine: medicineId, isActive: true, quantity: { $gt: 0 }, sellingRate: { $gt: 0 } })
    .sort({ expiryDate: 1 })
    .session(session || null);

  const totalAvailable = batches.reduce((sum, b) => sum + (b.quantity - (b.reservedQuantity || 0)), 0);
  if (totalAvailable < quantity) {
    throw Object.assign(new Error(`Insufficient stock: only ${totalAvailable} available across all batches`), { statusCode: 400 });
  }

  const allocations = [];
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = batch.quantity - (batch.reservedQuantity || 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    allocations.push({ batch, quantity: take });
    remaining -= take;
  }
  return allocations;
}

module.exports = { applyStockMovement, getStockSummary, allocateFefo };
