// Phase 10 — shared purchase-creation transactional core.
// Extracted verbatim (same behavior, same validation, same error shapes)
// from purchaseController.createPurchase (Phase 1-9) so the new bulk
// Excel/CSV import (requirement 12) can create purchases through the exact
// same atomic workflow — supplier validation, GST calc, batch upsert, stock
// increase, controlled-drug register, supplier ledger, distributor
// fulfillment — instead of a second, drift-prone copy of all of that.
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const Supplier = require('../models/Supplier');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Counter = require('../models/Counter');
const BusinessSettings = require('../models/BusinessSettings');
const StockTransaction = require('../models/StockTransaction');
const gstCalc = require('./gstCalculationService');
const { appendLedgerEntry } = require('./supplierLedgerService');
const { recordEntry: recordControlledDrugEntry } = require('./controlledDrugRegisterService');
const { requiresControlledRegister } = require('./scheduleComplianceService');
const { recordFulfillment: recordDistributorFulfillment } = require('./distributorOrderService');
const money = require('../utils/money');

/**
 * body shape matches exactly what POST /api/purchases expects:
 * { supplier, invoiceNumber, invoiceDate, dueDate?, purchaseType, paidAmount?, notes?, distributorOrder?,
 *   items: [{ medicine, batchNumber, expiryDate, manufacturingDate?, quantity, freeQuantity?, purchaseRate, mrp, sellingRate, discountType?, discountValue?, gstRate? }] }
 * Throws errors with .statusCode set, same as the controller did — caller
 * (Express controller OR the import service) maps those to a response.
 */
async function createPurchase({ organizationId, branchId, userId, body }) {
  if (!body.supplier) throw Object.assign(new Error('supplier is required'), { statusCode: 400 });
  if (!body.invoiceNumber) throw Object.assign(new Error('invoiceNumber is required'), { statusCode: 400 });
  if (!body.invoiceDate) throw Object.assign(new Error('invoiceDate is required'), { statusCode: 400 });
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw Object.assign(new Error('Purchase must contain at least one item'), { statusCode: 400 });
  }
  if (!['CASH', 'CREDIT'].includes(body.purchaseType)) {
    throw Object.assign(new Error('purchaseType must be CASH or CREDIT'), { statusCode: 400 });
  }

  let responseData;

  const supplier = await Supplier.findOne({ _id: body.supplier, organizationId });
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });
  if (!supplier.isActive) throw Object.assign(new Error('Cannot purchase from an inactive supplier'), { statusCode: 400 });

  const dup = await Purchase.findOne({ organizationId, supplier: supplier._id, invoiceNumber: body.invoiceNumber, status: 'ACTIVE' });
  if (dup) throw Object.assign(new Error(`Invoice number '${body.invoiceNumber}' already recorded for this supplier`), { statusCode: 409 });

  const settings = await BusinessSettings.findOne({ organizationId, branchId });
  const storeStateCode = settings?.stateCode || '09';
  const interState = gstCalc.isInterState(storeStateCode, supplier.stateCode);

  const calculatedItems = [];
  for (const raw of body.items) {
    if (!raw.medicine) throw Object.assign(new Error('Each item requires a medicine'), { statusCode: 400 });
    if (!raw.batchNumber) throw Object.assign(new Error('Each item requires a batchNumber'), { statusCode: 400 });
    if (!raw.expiryDate) throw Object.assign(new Error('Each item requires an expiryDate'), { statusCode: 400 });
    const medicine = await Medicine.findOne({ _id: raw.medicine, organizationId });
    if (!medicine) throw Object.assign(new Error(`Medicine ${raw.medicine} not found`), { statusCode: 404 });
    const calc = gstCalc.calculateItem(raw, interState);
    calculatedItems.push({ raw, calc, medicine });
  }

  const summary = gstCalc.calculatePurchaseSummary(calculatedItems.map((c) => c.calc));

  let paidAmount;
  if (body.purchaseType === 'CASH') {
    paidAmount = body.paidAmount !== undefined ? money.clean(body.paidAmount) : summary.grandTotal;
  } else {
    paidAmount = money.clean(body.paidAmount || 0);
  }
  if (paidAmount < 0) throw Object.assign(new Error('paidAmount cannot be negative'), { statusCode: 400 });
  if (paidAmount > summary.grandTotal) throw Object.assign(new Error('paidAmount cannot exceed grand total'), { statusCode: 400 });

  const outstandingAmount = money.subtract(summary.grandTotal, paidAmount);
  let paymentStatus = 'UNPAID';
  if (outstandingAmount <= 0) paymentStatus = 'PAID';
  else if (paidAmount > 0) paymentStatus = 'PARTIAL';

  const seq = await Counter.nextSequence(organizationId, 'PURCHASE');
  const purchaseNumber = `PUR-${String(seq).padStart(6, '0')}`;

  const [purchase] = await Purchase.create([
    {
      organizationId,
      branchId,
      purchaseNumber,
      supplier: supplier._id,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate,
      purchaseType: body.purchaseType,
      paymentStatus,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxableAmount: summary.taxableAmount,
      cgst: summary.cgst,
      sgst: summary.sgst,
      igst: summary.igst,
      roundOff: summary.roundOff,
      grandTotal: summary.grandTotal,
      paidAmount,
      outstandingAmount,
      taxType: interState ? 'INTER_STATE' : 'INTRA_STATE',
      notes: body.notes,
      distributorOrder: body.distributorOrder || null,
      createdBy: userId,
    },
  ]);

  for (const { raw, calc, medicine } of calculatedItems) {
    let batch = await Batch.findOne({ organizationId, branchId, medicine: medicine._id, batchNumber: raw.batchNumber });
    const previousQuantity = batch ? batch.quantity : 0;
    if (batch) {
      batch.quantity += calc.totalStockQty;
      batch.purchaseRate = calc.purchaseRate;
      batch.mrp = raw.mrp;
      batch.sellingRate = raw.sellingRate;
      batch.gstRate = calc.gstRate;
      batch.supplier = supplier._id;
    } else {
      [batch] = await Batch.create([
        {
          organizationId,
          branchId,
          medicine: medicine._id,
          batchNumber: raw.batchNumber,
          barcode: raw.batchNumber, // auto-generate barcode from batchNumber to avoid sparse index conflicts
          manufacturingDate: raw.manufacturingDate,
          expiryDate: raw.expiryDate,
          quantity: calc.totalStockQty,
          purchaseRate: calc.purchaseRate,
          mrp: raw.mrp,
          sellingRate: raw.sellingRate,
          gstRate: calc.gstRate,
          supplier: supplier._id,
        },
      ]);
    }
    batch.lastPurchase = purchase._id;
    await batch.save();

    if (requiresControlledRegister(medicine.scheduleType)) {
      await recordControlledDrugEntry({
        organizationId,
        branchId,
        medicineId: medicine._id,
        batchId: batch._id,
        transactionType: 'PURCHASE',
        purchaseQuantity: calc.totalStockQty,
        supplierId: supplier._id,
        referenceType: 'Purchase',
        referenceId: purchase._id,
        referenceNumber: purchaseNumber,
        userId,
        date: body.invoiceDate,
        notes: `Purchase ${purchaseNumber} (invoice ${body.invoiceNumber})`,
      });
    }

    await StockTransaction.create([
      {
        organizationId,
        branchId,
        medicine: medicine._id,
        batch: batch._id,
        transactionType: 'PURCHASE',
        quantity: calc.totalStockQty,
        previousQuantity,
        newQuantity: previousQuantity + calc.totalStockQty,
        referenceType: 'Purchase',
        referenceId: purchase._id,
        reason: `Purchase ${purchaseNumber}`,
        user: userId,
      },
    ]);

    await PurchaseItem.create([
      {
        organizationId,
        purchase: purchase._id,
        medicine: medicine._id,
        medicineName: medicine.name,
        batch: batch._id,
        batchNumber: raw.batchNumber,
        manufacturingDate: raw.manufacturingDate,
        expiryDate: raw.expiryDate,
        quantity: calc.quantity,
        freeQuantity: calc.freeQuantity,
        purchaseRate: calc.purchaseRate,
        mrp: raw.mrp,
        sellingRate: raw.sellingRate,
        discountType: calc.discountType,
        discountValue: calc.discountValue,
        discountAmount: calc.discountAmount,
        gstRate: calc.gstRate,
        taxableAmount: calc.taxableAmount,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        totalAmount: calc.totalAmount,
      },
    ]);
  }

  await appendLedgerEntry({
    organizationId,
    branchId,
    supplierId: supplier._id,
    date: body.invoiceDate,
    referenceType: 'Purchase',
    referenceId: purchase._id,
    referenceNumber: purchaseNumber,
    transactionType: 'PURCHASE',
    debit: summary.grandTotal,
    credit: 0,
    notes: `Purchase ${purchaseNumber} (invoice ${body.invoiceNumber})`,
    userId,
  });
  if (paidAmount > 0) {
    await appendLedgerEntry({
      organizationId,
      branchId,
      supplierId: supplier._id,
      date: body.invoiceDate,
      referenceType: 'Purchase',
      referenceId: purchase._id,
      referenceNumber: purchaseNumber,
      transactionType: 'PAYMENT',
      debit: 0,
      credit: paidAmount,
      notes: `Payment at time of purchase ${purchaseNumber}`,
      userId,
    });
  }

  if (body.distributorOrder) {
    await recordDistributorFulfillment({
      orderId: body.distributorOrder,
      organizationId,
      purchasedItems: calculatedItems.map(({ raw, calc }) => ({ medicineId: raw.medicine, quantity: calc.totalStockQty })),
    });
  }

  responseData = { purchase };
  return responseData.purchase;
}

module.exports = { createPurchase };
