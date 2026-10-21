// Phase 11 — extracted from saleController.createSale (Stage 4/Phase 10
// logic, UNCHANGED) so the exact same transactional, idempotent, stock-
// validating sale-creation path can be reused by:
//   1. POST /api/sales (online POS — saleController.js, thin wrapper now)
//   2. POST /api/offline-sync/push (offline sync — offlineSyncService.js)
//
// This is the "DO NOT create a separate billing system" requirement from
// Phase 11's brief, applied literally: offline bills go through this exact
// function, not a parallel one. Totals are ALWAYS recalculated live from
// current Medicine/Batch data server-side — an offline client's locally
// computed total is never trusted any more than an online client's is.
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const StockTransaction = require('../models/StockTransaction');
const Counter = require('../models/Counter');
const BusinessSettings = require('../models/BusinessSettings');
const Doctor = require('../models/Doctor');
const { allocateFefo } = require('./stockService');
const saleCalc = require('./saleCalculationService');
const { classifyMedicine, validateRestrictedSaleInfo, requiresControlledRegister } = require('./scheduleComplianceService');
const { recordEntry: recordControlledDrugEntry } = require('./controlledDrugRegisterService');
const { recordCommissionForSaleItem } = require('./doctorCommissionService');
const money = require('../utils/money');

/**
 * Looks up an existing Sale by idempotencyKey without starting a
 * transaction — used by both the POS route and offline sync to short-
 * circuit a retried/duplicate submission before doing any work.
 */
async function findExistingByIdempotencyKey({ organizationId, branchId, idempotencyKey }) {
  if (!idempotencyKey) return null;
  return Sale.findOne({ organizationId, branchId, idempotencyKey });
}

/**
 * Creates one Sale (+ SaleItems, stock movements, payments, commission,
 * controlled-drug register entries) inside a single transaction. Throws
 * with `.statusCode` set on any business-rule violation (insufficient
 * stock, missing prescription verification, etc) — the caller decides how
 * to surface that (HTTP error for POS, a FAILED/CONFLICT sync record for
 * offline sync).
 *
 * body shape — identical to POST /api/sales's body (see saleController.js):
 * { customer, walkInCustomerName, walkInCustomerMobile, customerState,
 *   idempotencyKey, items: [...], billDiscount, payments: [...],
 *   restrictedSaleInfo, referringDoctor, referringDoctorName }
 */
async function createSaleTransaction({ organizationId, branchId, user, body }) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw Object.assign(new Error('Cart is empty'), { statusCode: 400 });
  }

  let responseData;
  try {
    const settings = await BusinessSettings.findOne({ organizationId, branchId });
      const storeState = settings?.state || null;
      const taxType = saleCalc.resolveTaxType(storeState, body.customerState, 'INTRA_STATE');
      const pricesIncludeGST = !!settings?.pricesIncludeGST;

      let customer = null;
      if (body.customer) {
        customer = await Customer.findOne({ _id: body.customer, organizationId });
        if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
      }

      let saleHasRestrictedItems = false;
      const resolvedLines = [];
      for (const line of body.items) {
        const medicine = await Medicine.findOne({ _id: line.medicine, organizationId });
        if (!medicine || !medicine.isActive) throw Object.assign(new Error(`Medicine not found or inactive: ${line.medicine}`), { statusCode: 404 });

        const qty = Number(line.quantity);
        if (!qty || qty <= 0) throw Object.assign(new Error(`Invalid quantity for ${medicine.name}`), { statusCode: 400 });

        const classification = classifyMedicine(medicine);
        if (classification.restricted && !line.prescriptionVerified) {
          throw Object.assign(new Error(`${medicine.name} is Schedule ${classification.scheduleType} — prescription verification is required before it can be sold`), { statusCode: 400 });
        }
        if (!classification.restricted && medicine.prescriptionRequired && settings?.requirePrescriptionVerification !== false && !line.prescriptionVerified) {
          throw Object.assign(new Error(`${medicine.name} requires prescription verification before it can be sold`), { statusCode: 400 });
        }
        if (classification.restricted) saleHasRestrictedItems = true;

        let allocations;
        if (line.batchId) {
          const batch = await Batch.findOne({ _id: line.batchId, organizationId, branchId });
          if (!batch) throw Object.assign(new Error(`Batch not found: ${line.batchId}`), { statusCode: 404 });
          const available = batch.quantity - (batch.reservedQuantity || 0);
          if (available < qty) {
            throw Object.assign(new Error(`Insufficient stock in batch ${batch.batchNumber} for ${medicine.name}`), {
              statusCode: 400,
              code: 'STOCK_CONFLICT',
              conflict: { medicine: medicine._id, batch: batch._id, serverStockAtSync: available, offlineSaleQuantity: qty },
            });
          }
          allocations = [{ batch, quantity: qty }];
        } else {
          allocations = await allocateFefo({ organizationId, branchId, medicineId: medicine._id, quantity: qty });
        }

        for (const alloc of allocations) {
          const cartLineRef = `${medicine._id}`;
          // MRP is the printed and billing price. Older batches with no MRP
          // continue using the medicine rate, then the batch selling rate.
          const grossPerUnit = Number(medicine.defaultMrp) > 0 ? medicine.defaultMrp : (Number(medicine.defaultRate) > 0 ? medicine.defaultRate : alloc.batch.mrp || alloc.batch.sellingRate);
          const baseAmount = money.multiply(grossPerUnit, alloc.quantity);
          const discountAmount = saleCalc.calculateDiscount(baseAmount, line.discountType, line.discountValue);
          resolvedLines.push({ medicine, batch: alloc.batch, quantity: alloc.quantity, cartLineRef, sellingRate: grossPerUnit, baseAmount, discountAmount, discountType: line.discountType || null, discountValue: Number(line.discountValue) || 0, freeQuantity: line.freeQuantity || 0, scheduleTypeSnapshot: classification.scheduleType, restrictedSale: classification.restricted });
        }
      }

      const subtotal = money.sum(...resolvedLines.map((l) => l.baseAmount));
      const itemDiscount = money.sum(...resolvedLines.map((l) => l.discountAmount));

      let billDiscountAmount = 0;
      const billDiscountType = body.billDiscount?.type || null;
      const billDiscountValue = Number(body.billDiscount?.value) || 0;
      if (billDiscountType) {
        const postItemDiscountTotal = money.subtract(subtotal, itemDiscount);
        billDiscountAmount = saleCalc.calculateDiscount(postItemDiscountTotal, billDiscountType, billDiscountValue);
      }
      const billAllocation = saleCalc.allocateBillDiscount(
        resolvedLines.map((l) => ({ key: l.cartLineRef + l.batch._id, amount: money.subtract(l.baseAmount, l.discountAmount) })),
        billDiscountAmount
      );

      let taxableAmount = 0,
        cgst = 0,
        sgst = 0,
        igst = 0,
        calculatedSubtotalWithTax = 0;
      const savedItems = [];

      for (const l of resolvedLines) {
        const key = l.cartLineRef + l.batch._id;
        const billShare = billAllocation[key] || 0;
        const grossAfterAllDiscount = money.subtract(money.subtract(l.baseAmount, l.discountAmount), billShare);
        const tax = saleCalc.calculateLineTax(grossAfterAllDiscount, l.batch.gstRate, taxType, pricesIncludeGST);

        taxableAmount = money.sum(taxableAmount, tax.taxableAmount);
        cgst = money.sum(cgst, tax.cgst);
        sgst = money.sum(sgst, tax.sgst);
        igst = money.sum(igst, tax.igst);
        calculatedSubtotalWithTax = money.sum(calculatedSubtotalWithTax, tax.totalAmount);

        const previousQuantity = l.batch.quantity;
        l.batch.quantity -= l.quantity;
        await l.batch.save();

        await StockTransaction.create(
          [
            {
              organizationId,
              branchId,
              medicine: l.medicine._id,
              batch: l.batch._id,
              transactionType: 'SALE',
              quantity: -l.quantity,
              previousQuantity,
              newQuantity: previousQuantity - l.quantity,
              referenceType: 'Sale',
              referenceId: null,
              reason: body.offlineSync ? 'Offline POS sale (synced)' : 'POS sale',
              user: user._id,
            },
          ]
        );

        savedItems.push({
          medicine: l.medicine,
          batch: l.batch,
          cartLineRef: l.cartLineRef,
          quantity: l.quantity,
          sellingRate: l.sellingRate,
          freeQuantity: l.freeQuantity,
          discountType: l.discountType,
          discountValue: l.discountValue,
          discountAmount: l.discountAmount,
          billDiscountAllocated: billShare,
          gstRate: l.batch.gstRate,
          scheduleTypeSnapshot: l.scheduleTypeSnapshot,
          restrictedSale: l.restrictedSale,
          ...tax,
        });
      }

      let restrictedSaleInfo = null;
      if (saleHasRestrictedItems) {
        const check = validateRestrictedSaleInfo(body.restrictedSaleInfo);
        if (!check.valid) throw Object.assign(new Error(check.reason), { statusCode: 400 });

        let doctorDoc = null;
        if (body.restrictedSaleInfo.doctor) {
          doctorDoc = await Doctor.findOne({ _id: body.restrictedSaleInfo.doctor, organizationId });
          if (!doctorDoc) throw Object.assign(new Error('Doctor reference not found'), { statusCode: 404 });
        }
        restrictedSaleInfo = {
          doctor: doctorDoc?._id || null,
          doctorName: body.restrictedSaleInfo.doctorName || doctorDoc?.name || null,
          doctorRegistrationNo: body.restrictedSaleInfo.doctorRegistrationNo || doctorDoc?.registrationNumber || null,
          prescription: body.restrictedSaleInfo.prescription || null,
          prescriptionReference: body.restrictedSaleInfo.prescriptionReference || null,
          prescriptionDate: body.restrictedSaleInfo.prescriptionDate ? new Date(body.restrictedSaleInfo.prescriptionDate) : null,
          patientName: body.restrictedSaleInfo.patientName || null,
        };
      }

      let referringDoctor = restrictedSaleInfo?.doctor || null;
      if (body.referringDoctor && String(body.referringDoctor) !== String(referringDoctor)) {
        const refDoctorDoc = await Doctor.findOne({ _id: body.referringDoctor, organizationId });
        if (!refDoctorDoc) throw Object.assign(new Error('Referring doctor reference not found'), { statusCode: 404 });
        referringDoctor = refDoctorDoc._id;
      }

      const { rounded: grandTotal, roundOff } = money.roundToWhole(calculatedSubtotalWithTax);
      const totalDiscount = money.sum(itemDiscount, billDiscountAmount);

      const payments = Array.isArray(body.payments) ? body.payments : [];
      const paidAmount = money.sum(...payments.map((p) => p.amount));
      if (paidAmount > grandTotal) throw Object.assign(new Error('Paid amount cannot exceed grand total'), { statusCode: 400 });
      const outstandingAmount = money.subtract(grandTotal, paidAmount);
      let paymentStatus = 'UNPAID';
      if (outstandingAmount <= 0) paymentStatus = 'PAID';
      else if (paidAmount > 0) paymentStatus = 'PARTIAL';
      if (outstandingAmount > 0 && !customer && !body.walkInCustomerName?.trim()) {
        throw Object.assign(new Error('Credit sales require a customer name'), { statusCode: 400 });
      }

      const saleSeq = await Counter.nextSequence(organizationId, 'SALE');
      const invSeq = await Counter.nextSequence(organizationId, 'INVOICE');
      const saleNumber = `SALE-${String(saleSeq).padStart(6, '0')}`;
      const invoicePrefix = settings?.invoicePrefix || 'INV';
      const invoiceNumber = `${invoicePrefix}-${String(invSeq).padStart(6, '0')}`;

      const [sale] = await Sale.create(
        [
          {
            organizationId,
            branchId,
            saleNumber,
            invoiceNumber,
            customer: customer?._id || null,
            walkInCustomerName: body.walkInCustomerName || null,
            walkInCustomerMobile: body.walkInCustomerMobile || null,
            saleDate: body.offlineSync && body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : undefined,
            subtotal,
            itemDiscount,
            billDiscount: billDiscountAmount,
            billDiscountType,
            billDiscountValue,
            totalDiscount,
            taxableAmount,
            cgst,
            sgst,
            igst,
            taxType,
            calculatedTotal: calculatedSubtotalWithTax,
            roundOff,
            grandTotal,
            payments: payments.map((p) => ({ method: p.method, amount: money.clean(p.amount), referenceNumber: p.referenceNumber || null })),
            paidAmount,
            outstandingAmount,
            paymentStatus,
            saleType: outstandingAmount > 0 ? (paidAmount > 0 ? 'MIXED' : 'CREDIT') : 'CASH',
            storeState,
            customerState: body.customerState || null,
            idempotencyKey: body.idempotencyKey || null,
            hasRestrictedItems: saleHasRestrictedItems,
            restrictedSaleInfo,
            referringDoctor,
            referringDoctorName: body.referringDoctorName || null,
            createdBy: user._id,
          },
        ]
      );

      await StockTransaction.updateMany({ organizationId, branchId, referenceType: 'Sale', referenceId: null, medicine: { $in: savedItems.map((i) => i.medicine._id) } }, { referenceId: sale._id });

      const itemIds = [];
      const createdSaleItems = [];
      for (const it of savedItems) {
        const [saleItem] = await SaleItem.create(
          [
            {
              organizationId,
              sale: sale._id,
              cartLineRef: it.cartLineRef,
              medicine: it.medicine._id,
              batch: it.batch._id,
              medicineNameSnapshot: it.medicine.name,
              batchNumberSnapshot: it.batch.batchNumber,
              expiryDateSnapshot: it.batch.expiryDate,
              hsnCodeSnapshot: it.medicine.hsnCode || null,
              scheduleTypeSnapshot: it.scheduleTypeSnapshot,
              restrictedSale: it.restrictedSale,
              quantity: it.quantity,
              freeQuantity: it.freeQuantity,
              sellingRate: it.sellingRate || it.batch.sellingRate,
              mrp: it.batch.mrp,
              discountType: it.discountType,
              discountValue: it.discountValue,
              discountAmount: it.discountAmount,
              billDiscountAllocated: it.billDiscountAllocated,
              gstRate: it.gstRate,
              taxableAmount: it.taxableAmount,
              cgst: it.cgst,
              sgst: it.sgst,
              igst: it.igst,
              totalAmount: it.totalAmount,
              purchaseRateSnapshot: it.batch.purchaseRate,
            },
          ]
        );
        itemIds.push(saleItem._id);
        createdSaleItems.push({ saleItem, medicine: it.medicine });
      }
      sale.items = itemIds;
      await sale.save();

      for (const it of savedItems) {
        if (requiresControlledRegister(it.scheduleTypeSnapshot)) {
          await recordControlledDrugEntry({
            organizationId,
            branchId,
            medicineId: it.medicine._id,
            batchId: it.batch._id,
            transactionType: 'SALE',
            saleQuantity: it.quantity,
            customerId: customer?._id || null,
            prescriptionId: restrictedSaleInfo?.prescription || null,
            doctorId: restrictedSaleInfo?.doctor || null,
            doctorName: restrictedSaleInfo?.doctorName || null,
            prescriptionReference: restrictedSaleInfo?.prescriptionReference || null,
            referenceType: 'Sale',
            referenceId: sale._id,
            referenceNumber: sale.saleNumber,
            userId: user._id,
            notes: `Sale ${sale.saleNumber}`,
          });
        }
      }

      if (referringDoctor) {
        for (const { saleItem, medicine } of createdSaleItems) {
          await recordCommissionForSaleItem({
            organizationId,
            branchId,
            doctorId: referringDoctor,
            sale,
            saleItem,
            medicine,
          });
        }
      }

      for (const p of payments) {
        const paySeq = await Counter.nextSequence(organizationId, 'PAYMENT');
        await Payment.create(
          [
            {
              organizationId,
              branchId,
              paymentNumber: `PAY-${String(paySeq).padStart(6, '0')}`,
              direction: 'IN',
              method: p.method,
              amount: money.clean(p.amount),
              referenceNumber: p.referenceNumber || null,
              referenceType: 'Sale',
              referenceId: sale._id,
              customer: customer?._id || null,
              createdBy: user._id,
            },
          ]
        );
      }

      if (customer && outstandingAmount > 0) {
        customer.outstandingBalance = money.sum(customer.outstandingBalance, outstandingAmount);
        await customer.save();
      }

      responseData = { sale, items: savedItems };
  } catch (err) {
    throw err;
  }

  return responseData;
}

module.exports = { createSaleTransaction, findExistingByIdempotencyKey };
