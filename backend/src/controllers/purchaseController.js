const asyncHandler = require('express-async-handler');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const { createPurchase: createPurchaseCore } = require('../services/purchaseCreationService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/purchases
// Full atomic workflow lives in services/purchaseCreationService.js (shared
// with the Excel/CSV bulk import) -> supplier validation -> line calc ->
// batch upsert -> stock increase -> purchase totals -> supplier ledger ->
// audit. This handler is just the HTTP boundary around it.
const createPurchase = asyncHandler(async (req, res) => {
  try {
    const purchase = await createPurchaseCore({ organizationId: req.organizationId, branchId: req.branchId, userId: req.user._id, body: req.body });
    await logAction({ req, action: 'PURCHASE_CREATED', entityType: 'Purchase', entityId: purchase._id, description: `Purchase ${purchase.purchaseNumber} created, grand total ${purchase.grandTotal}` });
    return sendSuccess(res, { statusCode: 201, message: 'Purchase recorded', data: { purchase } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

const list = asyncHandler(async (req, res) => {
  const { supplier, paymentStatus, status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (supplier) filter.supplier = supplier;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (status) filter.status = status;
  const purchases = await Purchase.find(filter).populate('supplier', 'supplierName supplierCode').sort({ createdAt: -1 });
  return sendSuccess(res, { data: purchases });
});

const getOne = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('supplier');
  if (!purchase) return sendError(res, { statusCode: 404, message: 'Purchase not found' });
  const items = await PurchaseItem.find({ purchase: purchase._id });
  return sendSuccess(res, { data: { purchase, items } });
});

module.exports = { createPurchase, list, getOne };
