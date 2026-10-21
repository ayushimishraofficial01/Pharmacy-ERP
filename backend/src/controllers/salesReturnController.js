const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const SalesReturnItem = require('../models/SalesReturnItem');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const StockTransaction = require('../models/StockTransaction');
const Counter = require('../models/Counter');
const money = require('../utils/money');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/sales-returns
// body: { sale, items: [{ saleItem, returnQuantity, disposition }], reason, refunds: [{ method, amount }] }
// Only RESTOCK-disposition returns add stock back; DAMAGED/EXPIRED/
// NON_RESTOCKABLE returns still refund the customer but leave stock as-is
// (with their own StockTransaction row so shrinkage is still visible).
const createSalesReturn = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.sale) return sendError(res, { statusCode: 400, message: 'sale is required' });
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return sendError(res, { statusCode: 400, message: 'At least one item is required' });
  }

  const session = await mongoose.startSession();
  try {
    let responseData;
    {
      const sale = await Sale.findOne({ _id: body.sale, organizationId: req.organizationId, branchId: req.branchId }).session(session);
      if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });
      if (sale.status === 'CANCELLED') throw Object.assign(new Error('Cannot return items from a cancelled sale'), { statusCode: 400 });

      const lineCalcs = [];
      for (const line of body.items) {
        const item = await SaleItem.findOne({ _id: line.saleItem, sale: sale._id }).session(session);
        if (!item) throw Object.assign(new Error(`Sale item ${line.saleItem} not found on this sale`), { statusCode: 404 });

        const returnQty = Number(line.returnQuantity);
        if (!returnQty || returnQty <= 0) throw Object.assign(new Error('returnQuantity must be greater than zero'), { statusCode: 400 });
        const remaining = item.quantity - item.returnedQuantity;
        if (returnQty > remaining) throw Object.assign(new Error(`Only ${remaining} units of "${item.medicineNameSnapshot}" remain eligible for return`), { statusCode: 400 });

        const disposition = line.disposition || 'RESTOCK';
        if (!['RESTOCK', 'DAMAGED', 'EXPIRED', 'NON_RESTOCKABLE'].includes(disposition)) {
          throw Object.assign(new Error(`Invalid disposition: ${disposition}`), { statusCode: 400 });
        }

        const proportion = returnQty / item.quantity;
        const taxableAmount = money.multiply(item.taxableAmount, proportion);
        const cgst = money.multiply(item.cgst, proportion);
        const sgst = money.multiply(item.sgst, proportion);
        const igst = money.multiply(item.igst, proportion);
        const totalAmount = money.sum(taxableAmount, cgst, sgst, igst);

        lineCalcs.push({ item, returnQty, disposition, taxableAmount, cgst, sgst, igst, totalAmount });
      }

      const summary = {
        taxableAmount: money.sum(...lineCalcs.map((l) => l.taxableAmount)),
        cgst: money.sum(...lineCalcs.map((l) => l.cgst)),
        sgst: money.sum(...lineCalcs.map((l) => l.sgst)),
        igst: money.sum(...lineCalcs.map((l) => l.igst)),
      };
      const totalRefundAmount = money.sum(summary.taxableAmount, summary.cgst, summary.sgst, summary.igst);

      const refunds = Array.isArray(body.refunds) ? body.refunds : [];
      const refundTotal = money.sum(...refunds.map((r) => r.amount));
      if (refundTotal > totalRefundAmount) throw Object.assign(new Error('Refund total cannot exceed the calculated return value'), { statusCode: 400 });

      const seq = await Counter.nextSequence(req.organizationId, 'SALES_RETURN');
      const returnNumber = `SRET-${String(seq).padStart(6, '0')}`;

      const [salesReturn] = await SalesReturn.create(
        [
          {
            organizationId: req.organizationId,
            branchId: req.branchId,
            returnNumber,
            originalSale: sale._id,
            originalInvoiceNumber: sale.invoiceNumber,
            customer: sale.customer,
            taxableAmount: summary.taxableAmount,
            cgst: summary.cgst,
            sgst: summary.sgst,
            igst: summary.igst,
            totalRefundAmount,
            refunds: refunds.map((r) => ({ method: r.method, amount: money.clean(r.amount), referenceNumber: r.referenceNumber || null })),
            reason: body.reason || null,
            createdBy: req.user._id,
          },
        ],
        { session }
      );

      for (const l of lineCalcs) {
        l.item.returnedQuantity += l.returnQty;
        await l.item.save({ session });

        const batch = await Batch.findById(l.item.batch).session(session);
        let stockTxnId = null;
        if (batch) {
          const previousQuantity = batch.quantity;
          if (l.disposition === 'RESTOCK') {
            batch.quantity += l.returnQty;
            await batch.save({ session });
          }
          const [txn] = await StockTransaction.create(
            [
              {
                organizationId: req.organizationId,
                branchId: req.branchId,
                medicine: l.item.medicine,
                batch: batch._id,
                transactionType: 'SALES_RETURN',
                quantity: l.disposition === 'RESTOCK' ? l.returnQty : 0,
                previousQuantity,
                newQuantity: l.disposition === 'RESTOCK' ? previousQuantity + l.returnQty : previousQuantity,
                referenceType: 'SalesReturn',
                referenceId: salesReturn._id,
                reason: `Sales return ${returnNumber} (${l.disposition})`,
                user: req.user._id,
              },
            ],
            { session }
          );
          stockTxnId = txn._id;
        }

        await SalesReturnItem.create(
          [
            {
              organizationId: req.organizationId,
              salesReturn: salesReturn._id,
              originalSaleItem: l.item._id,
              medicine: l.item.medicine,
              batch: l.item.batch,
              medicineNameSnapshot: l.item.medicineNameSnapshot,
              batchNumberSnapshot: l.item.batchNumberSnapshot,
              quantity: l.returnQty,
              rate: l.item.sellingRate,
              gstRate: l.item.gstRate,
              taxableAmount: l.taxableAmount,
              cgst: l.cgst,
              sgst: l.sgst,
              igst: l.igst,
              totalAmount: l.totalAmount,
              disposition: l.disposition,
              stockTransaction: stockTxnId,
            },
          ],
          { session }
        );
      }

      for (const r of refunds) {
        const paySeq = await Counter.nextSequence(req.organizationId, 'PAYMENT');
        await Payment.create(
          [
            {
              organizationId: req.organizationId,
              branchId: req.branchId,
              paymentNumber: `PAY-${String(paySeq).padStart(6, '0')}`,
              direction: 'OUT',
              method: r.method,
              amount: money.clean(r.amount),
              referenceNumber: r.referenceNumber || null,
              referenceType: 'SalesReturn',
              referenceId: salesReturn._id,
              customer: sale.customer,
              createdBy: req.user._id,
            },
          ],
          { session }
        );
      }

      const nonCashAdjustment = refunds.filter((r) => r.method === 'CUSTOMER_BALANCE_ADJUSTMENT').reduce((sum, r) => sum + money.clean(r.amount), 0);
      if (sale.customer && nonCashAdjustment > 0) {
        const customer = await Customer.findById(sale.customer).session(session);
        if (customer) {
          customer.outstandingBalance = Math.max(0, money.subtract(customer.outstandingBalance, nonCashAdjustment));
          await customer.save({ session });
        }
      }

      // Whether this makes the sale fully or partially returned is a
      // sum-of-all-returns-vs-original-quantities question — left as
      // PARTIALLY_RETURNED here; Stage 9 analytics computes the precise
      // fully-returned check across all SalesReturnItems for the sale.
      sale.status = 'PARTIALLY_RETURNED';
      await sale.save({ session });

      responseData = { salesReturn };
    }

    await logAction({ req, action: 'SALES_RETURN_CREATED', entityType: 'SalesReturn', entityId: responseData.salesReturn._id, description: `Sales return ${responseData.salesReturn.returnNumber} created` });

    return sendSuccess(res, { statusCode: 201, message: 'Sales return recorded', data: responseData });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  } finally {
    session.endSession();
  }
});

const list = asyncHandler(async (req, res) => {
  const returns = await SalesReturn.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('customer', 'name mobile').sort({ createdAt: -1 });
  return sendSuccess(res, { data: returns });
});

module.exports = { createSalesReturn, list };
