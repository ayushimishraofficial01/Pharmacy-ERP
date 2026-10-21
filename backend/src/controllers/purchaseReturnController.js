const asyncHandler = require('express-async-handler');
const PurchaseReturn = require('../models/PurchaseReturn');
const { createReturnForPurchase } = require('../services/purchaseReturnService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/purchase-returns
// body: { purchase, items: [{ purchaseItem, returnQuantity }], reason, settlementType }
const createPurchaseReturn = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.purchase) return sendError(res, { statusCode: 400, message: 'purchase is required' });
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return sendError(res, { statusCode: 400, message: 'At least one item is required' });
  }

  try {
    const purchaseReturn = await createReturnForPurchase({
      organizationId: req.organizationId,
      branchId: req.branchId,
      purchaseId: body.purchase,
      lines: body.items.map((i) => ({ purchaseItem: i.purchaseItem, returnQuantity: i.returnQuantity })),
      reason: body.reason,
      settlementType: body.settlementType,
      userId: req.user._id,
    });

    await logAction({ req, action: 'PURCHASE_RETURN_CREATED', entityType: 'PurchaseReturn', entityId: purchaseReturn._id, description: `Purchase return ${purchaseReturn.returnNumber} created` });

    return sendSuccess(res, { statusCode: 201, message: 'Purchase return recorded', data: { purchaseReturn } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

const list = asyncHandler(async (req, res) => {
  const returns = await PurchaseReturn.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('supplier', 'supplierName supplierCode').sort({ createdAt: -1 });
  return sendSuccess(res, { data: returns });
});

module.exports = { createPurchaseReturn, list };
