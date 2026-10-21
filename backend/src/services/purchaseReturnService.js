// Phase 10 — shared purchase-return transactional core (requirement 16
// reuses this instead of duplicating it for expiry-driven returns).
// Extracted from purchaseReturnController.js (Phase 1-9) verbatim in
// behavior — same validation, same negative-stock guard, same ledger entry
// — so both the manual "create a purchase return" flow and the new
// "return this near-expiry batch" flow produce identical, correct
// PurchaseReturn documents.
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const PurchaseReturn = require('../models/PurchaseReturn');
const Batch = require('../models/Batch');
const StockTransaction = require('../models/StockTransaction');
const Counter = require('../models/Counter');
const { appendLedgerEntry } = require('./supplierLedgerService');
const money = require('../utils/money');

/**
 * lines: [{ purchaseItem: ObjectId, returnQuantity: Number }] — all lines
 * must belong to the SAME purchase (one supplier invoice per return
 * document, matching how a credit note actually works).
 */
async function createReturnForPurchase({ organizationId, branchId, purchaseId, lines, reason, settlementType, userId }) {
  // Note: MongoDB standalone mode doesn't support transactions.
  // In production with replica sets, wrap this in session.withTransaction()
  // For now, execute sequentially without transaction protection.
  const session = null;
  try {
    let purchaseReturn;
    // Note: Transactions disabled for standalone MongoDB compatibility
    {
      const purchase = await Purchase.findOne({ _id: purchaseId, organizationId, branchId }).session(session);
      if (!purchase) throw Object.assign(new Error('Purchase not found'), { statusCode: 404 });
      if (purchase.status !== 'ACTIVE') throw Object.assign(new Error('Cannot return against a cancelled purchase'), { statusCode: 400 });

      const lineCalcs = [];
      for (const line of lines) {
        const item = await PurchaseItem.findOne({ _id: line.purchaseItem, purchase: purchase._id }).session(session);
        if (!item) throw Object.assign(new Error(`Purchase item ${line.purchaseItem} not found on this purchase`), { statusCode: 404 });

        const returnQty = Number(line.returnQuantity);
        if (!returnQty || returnQty <= 0) throw Object.assign(new Error('returnQuantity must be greater than zero'), { statusCode: 400 });
        const remaining = item.quantity - item.returnedQuantity;
        if (returnQty > remaining) {
          throw Object.assign(new Error(`Only ${remaining} units of "${item.medicineName}" remain eligible for return`), { statusCode: 400 });
        }

        const proportion = returnQty / item.quantity;
        const taxableAmount = money.multiply(item.taxableAmount, proportion);
        const cgst = money.multiply(item.cgst, proportion);
        const sgst = money.multiply(item.sgst, proportion);
        const igst = money.multiply(item.igst, proportion);
        const discountAmount = money.multiply(item.discountAmount, proportion);
        const baseAmount = money.sum(taxableAmount, discountAmount);
        const totalAmount = money.sum(taxableAmount, cgst, sgst, igst);

        lineCalcs.push({ item, returnQty, baseAmount, discountAmount, taxableAmount, cgst, sgst, igst, totalAmount });
      }

      const summary = {
        subtotal: money.sum(...lineCalcs.map((l) => l.baseAmount)),
        discount: money.sum(...lineCalcs.map((l) => l.discountAmount)),
        taxableAmount: money.sum(...lineCalcs.map((l) => l.taxableAmount)),
        cgst: money.sum(...lineCalcs.map((l) => l.cgst)),
        sgst: money.sum(...lineCalcs.map((l) => l.sgst)),
        igst: money.sum(...lineCalcs.map((l) => l.igst)),
      };
      const calculatedTotal = money.sum(summary.taxableAmount, summary.cgst, summary.sgst, summary.igst);
      const { rounded: grandTotal, roundOff } = money.roundToWhole(calculatedTotal);

      const seq = await Counter.nextSequence(organizationId, 'PURCHASE_RETURN');
      const returnNumber = `PRET-${String(seq).padStart(6, '0')}`;

      [purchaseReturn] = await PurchaseReturn.create(
        [
          {
            organizationId,
            branchId,
            returnNumber,
            purchase: purchase._id,
            supplier: purchase.supplier,
            reason,
            subtotal: summary.subtotal,
            discount: summary.discount,
            taxableAmount: summary.taxableAmount,
            cgst: summary.cgst,
            sgst: summary.sgst,
            igst: summary.igst,
            roundOff,
            grandTotal,
            settlementType: settlementType || 'ADJUSTMENT',
            refundAmount: settlementType === 'REFUND' ? grandTotal : 0,
            adjustmentAmount: settlementType !== 'REFUND' ? grandTotal : 0,
            createdBy: userId,
          },
        ],
        { session }
      );

      for (const l of lineCalcs) {
        l.item.returnedQuantity += l.returnQty;
        await l.item.save({ session });

        const batch = await Batch.findById(l.item.batch).session(session);
        if (!batch) throw Object.assign(new Error('Batch for this purchase item no longer exists'), { statusCode: 404 });
        // Never allow stock to go negative (requirement 16).
        if (batch.quantity < l.returnQty) {
          throw Object.assign(new Error(`Cannot return ${l.returnQty} units of "${l.item.medicineName}" — only ${batch.quantity} left in stock (some may already be sold)`), { statusCode: 400 });
        }
        const previousQuantity = batch.quantity;
        batch.quantity -= l.returnQty;
        await batch.save({ session });

        await StockTransaction.create(
          [
            {
              organizationId,
              branchId,
              medicine: l.item.medicine,
              batch: batch._id,
              transactionType: 'PURCHASE_RETURN',
              quantity: -l.returnQty,
              previousQuantity,
              newQuantity: previousQuantity - l.returnQty,
              referenceType: 'PurchaseReturn',
              referenceId: purchaseReturn._id,
              reason: `Purchase return ${returnNumber}`,
              user: userId,
            },
          ],
          { session }
        );
      }

      await appendLedgerEntry({
        organizationId,
        branchId,
        supplierId: purchase.supplier,
        referenceType: 'PurchaseReturn',
        referenceId: purchaseReturn._id,
        referenceNumber: returnNumber,
        transactionType: 'PURCHASE_RETURN',
        debit: 0,
        credit: grandTotal,
        notes: `Purchase return ${returnNumber} against ${purchase.purchaseNumber}`,
        userId,
        session,
      });
    }

    return purchaseReturn;
  } finally {
    if (session) session.endSession();
  }
}

module.exports = { createReturnForPurchase };
