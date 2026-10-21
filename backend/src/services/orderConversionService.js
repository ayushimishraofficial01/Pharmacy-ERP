// Ported/adapted from Phase 9's orderConversionService + saleAdapter,
// rewired to use our real Batch/StockTransaction/Sale/SaleItem/Payment
// models and Counter directly instead of an adapter/tryRequire layer.
//
// Per Phase 9's spec (kept, it's correct): this must NOT create a second
// billing system — it goes through the exact same stock-decrement pattern
// saleController.createSale uses (Batch.quantity mutation + StockTransaction
// row in the same session), so a WhatsApp-originated sale is
// indistinguishable from a POS sale in every downstream report.
const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const StockTransaction = require('../models/StockTransaction');
const Counter = require('../models/Counter');
const BusinessSettings = require('../models/BusinessSettings');
const saleCalc = require('./saleCalculationService');
const money = require('../utils/money');

/**
 * Converts a CONFIRMED WhatsAppOrder into a Sale. Order items must already
 * carry a chosen `batch` (set when the order was confirmed/checked for
 * availability) — this re-validates live stock at conversion time since
 * stock can move between order-confirm and conversion.
 */
async function convertOrderToSale(order, { userId }) {
  if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') {
    throw Object.assign(new Error(`Cannot convert an order with status ${order.orderStatus}`), { statusCode: 400 });
  }
  if (order.sale) {
    throw Object.assign(new Error('Order has already been converted to a sale'), { statusCode: 409 });
  }

  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      const settings = await BusinessSettings.findOne({ organizationId: order.organizationId, branchId: order.branchId }).session(session);
      const taxType = saleCalc.resolveTaxType(settings?.state, null, 'INTRA_STATE');

      let taxableAmount = 0,
        cgst = 0,
        sgst = 0,
        igst = 0,
        calculatedTotal = 0;
      const itemIds = [];

      for (const item of order.items.filter((it) => it.itemStatus !== 'REMOVED')) {
        if (!item.batch) throw Object.assign(new Error(`Order item "${item.medicineName}" has no batch assigned — confirm the order with batch selection first`), { statusCode: 400 });

        const batch = await Batch.findOne({ _id: item.batch, organizationId: order.organizationId, branchId: order.branchId }).session(session);
        if (!batch) throw Object.assign(new Error(`Batch for "${item.medicineName}" no longer exists`), { statusCode: 404 });
        const available = batch.quantity - (batch.reservedQuantity || 0);
        if (available < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for "${item.medicineName}": only ${available} left (order needs ${item.quantity})`), { statusCode: 400 });
        }

        const tax = saleCalc.calculateLineTax(item.finalPrice, item.gst, taxType, false);
        taxableAmount = money.sum(taxableAmount, tax.taxableAmount);
        cgst = money.sum(cgst, tax.cgst);
        sgst = money.sum(sgst, tax.sgst);
        igst = money.sum(igst, tax.igst);
        calculatedTotal = money.sum(calculatedTotal, tax.totalAmount);

        const previousQuantity = batch.quantity;
        batch.quantity -= item.quantity;
        await batch.save({ session });

        await StockTransaction.create(
          [
            {
              organizationId: order.organizationId,
              branchId: order.branchId,
              medicine: item.medicine,
              batch: batch._id,
              transactionType: 'SALE',
              quantity: -item.quantity,
              previousQuantity,
              newQuantity: previousQuantity - item.quantity,
              referenceType: 'WhatsAppOrder',
              referenceId: order._id,
              reason: `WhatsApp order ${order.orderNumber}`,
              user: userId,
            },
          ],
          { session }
        );

        itemIds.push({ item, batch, tax });
      }

      const { rounded: grandTotal, roundOff } = money.roundToWhole(calculatedTotal);
      const paidAmount = money.clean(order.amountPaid || 0);
      const outstandingAmount = money.subtract(grandTotal, paidAmount);
      const paymentStatus = outstandingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

      const saleSeq = await Counter.nextSequence(order.organizationId, 'SALE');
      const invSeq = await Counter.nextSequence(order.organizationId, 'INVOICE');
      const invoicePrefix = settings?.invoicePrefix || 'INV';

      const [createdSale] = await Sale.create(
        [
          {
            organizationId: order.organizationId,
            branchId: order.branchId,
            saleNumber: `SALE-${String(saleSeq).padStart(6, '0')}`,
            invoiceNumber: `${invoicePrefix}-${String(invSeq).padStart(6, '0')}`,
            customer: order.customer,
            subtotal: order.subtotal,
            itemDiscount: order.discount,
            billDiscount: 0,
            totalDiscount: order.discount,
            taxableAmount,
            cgst,
            sgst,
            igst,
            taxType,
            calculatedTotal,
            roundOff,
            grandTotal,
            payments: order.paymentMethod ? [{ method: order.paymentMethod, amount: paidAmount }] : [],
            paidAmount,
            outstandingAmount,
            paymentStatus,
            saleType: outstandingAmount > 0 ? (paidAmount > 0 ? 'MIXED' : 'CREDIT') : 'CASH',
            storeState: settings?.state || null,
            sourceChannel: 'WHATSAPP',
            sourceRef: order._id,
            createdBy: userId,
          },
        ],
        { session }
      );

      const saleItemIds = [];
      for (const { item, batch, tax } of itemIds) {
        const [saleItem] = await SaleItem.create(
          [
            {
              organizationId: order.organizationId,
              sale: createdSale._id,
              cartLineRef: `${item.medicine}`,
              medicine: item.medicine,
              batch: batch._id,
              medicineNameSnapshot: item.medicineName,
              batchNumberSnapshot: batch.batchNumber,
              expiryDateSnapshot: batch.expiryDate,
              quantity: item.quantity,
              sellingRate: item.sellingPrice,
              mrp: item.mrp,
              discountAmount: item.discount,
              gstRate: item.gst,
              taxableAmount: tax.taxableAmount,
              cgst: tax.cgst,
              sgst: tax.sgst,
              igst: tax.igst,
              totalAmount: tax.totalAmount,
              purchaseRateSnapshot: batch.purchaseRate,
            },
          ],
          { session }
        );
        saleItemIds.push(saleItem._id);
      }
      createdSale.items = saleItemIds;
      await createdSale.save({ session });

      if (paidAmount > 0) {
        const paySeq = await Counter.nextSequence(order.organizationId, 'PAYMENT');
        await Payment.create(
          [
            {
              organizationId: order.organizationId,
              branchId: order.branchId,
              paymentNumber: `PAY-${String(paySeq).padStart(6, '0')}`,
              direction: 'IN',
              method: order.paymentMethod || 'CASH',
              amount: paidAmount,
              referenceType: 'Sale',
              referenceId: createdSale._id,
              customer: order.customer,
              createdBy: userId,
            },
          ],
          { session }
        );
      }

      if (outstandingAmount > 0) {
        const customer = await Customer.findById(order.customer).session(session);
        if (customer) {
          customer.outstandingBalance = money.sum(customer.outstandingBalance, outstandingAmount);
          await customer.save({ session });
        }
      }

      order.sale = createdSale._id;
      order.convertedAt = new Date();
      order.pushTimeline('CONVERTED_TO_SALE', userId, `Converted to sale ${createdSale.saleNumber}`);
      await order.save({ session });

      sale = createdSale;
    });
    return sale;
  } finally {
    session.endSession();
  }
}

module.exports = { convertOrderToSale };
