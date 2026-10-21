const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const StockTransaction = require('../models/StockTransaction');
const money = require('../utils/money');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');
// Phase 11: the actual transaction body (item resolution, tax calc, stock
// deduction, controlled-drug register, commission, payments) now lives in
// saleCreationService.js so offline-sync (Feature 2) can reuse the exact
// same path instead of a second/duplicate billing system. This controller
// is now a thin HTTP wrapper around it — behavior is unchanged.
const { createSaleTransaction, findExistingByIdempotencyKey } = require('../services/saleCreationService');

// POST /api/sales
// This is the ONLY place a Sale is created — totals are ALWAYS recalculated
// live from current Medicine/Batch data server-side; the frontend's cart
// display is never trusted for pricing (a stale/tampered cart total must
// never be what actually gets charged or what stock gets deducted).
//
// body: {
//   customer, walkInCustomerName, walkInCustomerMobile, customerState,
//   idempotencyKey,
//   items: [{ medicine, quantity, freeQuantity, batchId?, discountType, discountValue, prescriptionVerified }],
//   billDiscount: { type, value },
//   payments: [{ method, amount, referenceNumber }],
// }
const createSale = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return sendError(res, { statusCode: 400, message: 'Cart is empty' });
  }

  if (body.idempotencyKey) {
    const existing = await findExistingByIdempotencyKey({ organizationId: req.organizationId, branchId: req.branchId, idempotencyKey: body.idempotencyKey });
    if (existing) return sendSuccess(res, { statusCode: 200, message: 'Sale already recorded (idempotent replay)', data: { sale: existing } });
  }

  try {
    const responseData = await createSaleTransaction({ organizationId: req.organizationId, branchId: req.branchId, user: req.user, body });

    await logAction({ req, action: 'INVOICE_CREATED', entityType: 'Sale', entityId: responseData.sale._id, description: `Sale ${responseData.sale.saleNumber} (${responseData.sale.invoiceNumber}) created, grand total ${responseData.sale.grandTotal}` });

    return sendSuccess(res, { statusCode: 201, message: 'Sale completed', data: responseData });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});


// POST /api/sales/:id/cancel
const cancelSale = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let sale;
    await session.withTransaction(async () => {
      sale = await Sale.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId }).session(session);
      if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });
      if (sale.status !== 'COMPLETED') throw Object.assign(new Error(`Cannot cancel a sale with status ${sale.status}`), { statusCode: 400 });

      const items = await SaleItem.find({ sale: sale._id }).session(session);
      for (const item of items) {
        const batch = await Batch.findById(item.batch).session(session);
        if (batch) {
          const previousQuantity = batch.quantity;
          batch.quantity += item.quantity;
          await batch.save({ session });
          await StockTransaction.create(
            [
              {
                organizationId: req.organizationId,
                branchId: req.branchId,
                medicine: item.medicine,
                batch: batch._id,
                transactionType: 'SALES_RETURN',
                quantity: item.quantity,
                previousQuantity,
                newQuantity: previousQuantity + item.quantity,
                referenceType: 'Sale',
                referenceId: sale._id,
                reason: `Sale ${sale.saleNumber} cancelled: ${req.body.reason || 'no reason given'}`,
                user: req.user._id,
              },
            ],
            { session }
          );
        }
      }

      sale.status = 'CANCELLED';
      sale.cancelledAt = new Date();
      sale.cancelledBy = req.user._id;
      sale.cancellationReason = req.body.reason || null;
      await sale.save({ session });

      if (sale.customer && sale.outstandingAmount > 0) {
        const customer = await Customer.findById(sale.customer).session(session);
        if (customer) {
          customer.outstandingBalance = Math.max(0, money.subtract(customer.outstandingBalance, sale.outstandingAmount));
          await customer.save({ session });
        }
      }
    });

    await logAction({ req, action: 'INVOICE_CANCELLED', entityType: 'Sale', entityId: sale._id, description: `Sale ${sale.saleNumber} cancelled: ${req.body.reason || 'no reason given'}` });
    return sendSuccess(res, { message: 'Sale cancelled, stock reversed', data: { sale } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  } finally {
    session.endSession();
  }
});

const list = asyncHandler(async (req, res) => {
  const { status, paymentStatus, customer, from, to } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (customer) filter.customer = customer;
  if (from || to) filter.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const sales = await Sale.find(filter).populate('customer', 'name mobile').sort({ saleDate: -1 });
  return sendSuccess(res, { data: sales });
});

const getOne = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('customer').populate('items');
  if (!sale) return sendError(res, { statusCode: 404, message: 'Sale not found' });
  return sendSuccess(res, { data: sale });
});

module.exports = { createSale, cancelSale, list, getOne };
