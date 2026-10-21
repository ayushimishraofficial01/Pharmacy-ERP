// Phase 10 — expiry return-to-supplier workflow (requirement 16).
// Full loop: near-expiry detection -> select batch -> create supplier
// return -> select quantity -> reason -> return document -> stock
// adjustment -> supplier credit/adjustment record -> return history.
// Reuses purchaseReturnService (stock adjustment + ledger credit + return
// document + negative-stock guard) rather than reimplementing any of that.
const Batch = require('../models/Batch');
const PurchaseItem = require('../models/PurchaseItem');
const { createReturnForPurchase } = require('./purchaseReturnService');

/**
 * Near-expiry/expired batches with remaining stock, each annotated with how
 * many units are actually still eligible to be returned (based on the
 * originating PurchaseItem(s)' remaining un-returned quantity — a batch can
 * have less returnable quantity than its current stock if some was already
 * returned, or none at all if it was never purchased through this system,
 * e.g. an opening-stock batch).
 */
async function getReturnableBatches({ organizationId, branchId, days = 90 }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const batches = await Batch.find({ organizationId, branchId, isActive: true, quantity: { $gt: 0 }, expiryDate: { $lte: cutoff } })
    .populate('medicine', 'name medicineCode')
    .sort({ expiryDate: 1 });

  const results = [];
  for (const batch of batches) {
    const items = await PurchaseItem.find({ batch: batch._id }).populate('purchase', 'purchaseNumber supplier status');
    const eligibleItems = items.filter((i) => i.purchase?.status === 'ACTIVE' && i.quantity - i.returnedQuantity > 0);
    const maxReturnableQuantity = eligibleItems.reduce((s, i) => s + (i.quantity - i.returnedQuantity), 0);

    results.push({
      batch: { _id: batch._id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantity: batch.quantity, purchaseRate: batch.purchaseRate, mrp: batch.mrp },
      medicine: batch.medicine,
      isExpired: batch.expiryDate < new Date(),
      maxReturnableQuantity: Math.min(maxReturnableQuantity, batch.quantity),
      eligiblePurchaseItems: eligibleItems.map((i) => ({ purchaseItem: i._id, purchase: i.purchase._id, purchaseNumber: i.purchase.purchaseNumber, remaining: i.quantity - i.returnedQuantity })),
    });
  }

  return results;
}

/**
 * Return `quantity` units of a batch, FIFO across whichever purchase(s)
 * originally supplied it (oldest un-returned purchase item first). If the
 * batch's remaining-returnable quantity spans more than one Purchase
 * (restocked across multiple supplier invoices), this creates one
 * PurchaseReturn per originating purchase — a credit note can only ever
 * apply against one invoice.
 */
async function createExpiryReturn({ organizationId, branchId, batchId, quantity, reason, settlementType, userId }) {
  const batch = await Batch.findOne({ _id: batchId, organizationId, branchId });
  if (!batch) throw Object.assign(new Error('Batch not found'), { statusCode: 404 });

  let remainingToReturn = Number(quantity);
  if (!remainingToReturn || remainingToReturn <= 0) throw Object.assign(new Error('quantity must be greater than zero'), { statusCode: 400 });
  if (remainingToReturn > batch.quantity) throw Object.assign(new Error(`Only ${batch.quantity} units of this batch are in stock`), { statusCode: 400 });

  const items = await PurchaseItem.find({ batch: batch._id }).populate('purchase', 'status').sort({ createdAt: 1 });
  const eligibleItems = items.filter((i) => i.purchase?.status === 'ACTIVE' && i.quantity - i.returnedQuantity > 0);

  const byPurchase = new Map(); // purchaseId -> [{purchaseItem, returnQuantity}]
  for (const item of eligibleItems) {
    if (remainingToReturn <= 0) break;
    const remaining = item.quantity - item.returnedQuantity;
    const take = Math.min(remaining, remainingToReturn);
    if (take <= 0) continue;
    const purchaseId = String(item.purchase._id);
    if (!byPurchase.has(purchaseId)) byPurchase.set(purchaseId, []);
    byPurchase.get(purchaseId).push({ purchaseItem: item._id, returnQuantity: take });
    remainingToReturn -= take;
  }

  if (remainingToReturn > 0) {
    throw Object.assign(new Error(`Only ${quantity - remainingToReturn} of the ${quantity} requested units have a traceable purchase to return against (the rest may be opening stock never purchased through this system)`), { statusCode: 400 });
  }

  const purchaseReturns = [];
  for (const [purchaseId, lines] of byPurchase.entries()) {
    const purchaseReturn = await createReturnForPurchase({ organizationId, branchId, purchaseId, lines, reason, settlementType, userId });
    purchaseReturns.push(purchaseReturn);
  }

  return purchaseReturns;
}

module.exports = { getReturnableBatches, createExpiryReturn };
