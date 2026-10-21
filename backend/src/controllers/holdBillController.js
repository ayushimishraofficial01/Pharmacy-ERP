const asyncHandler = require('express-async-handler');
const HoldBill = require('../models/HoldBill');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const list = asyncHandler(async (req, res) => {
  const bills = await HoldBill.find({ organizationId: req.organizationId, branchId: req.branchId }).sort({ createdAt: -1 });
  return sendSuccess(res, { data: bills });
});

const create = asyncHandler(async (req, res) => {
  const bill = await HoldBill.create({ ...req.body, organizationId: req.organizationId, branchId: req.branchId, createdBy: req.user._id });
  return sendSuccess(res, { statusCode: 201, data: bill });
});

// Resuming a held bill just returns its data for the frontend to load into
// the cart — it never touches stock (holding was never a reservation).
const resume = asyncHandler(async (req, res) => {
  const bill = await HoldBill.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!bill) return sendError(res, { statusCode: 404, message: 'Held bill not found' });
  return sendSuccess(res, { data: bill });
});

const remove = asyncHandler(async (req, res) => {
  const bill = await HoldBill.findOneAndDelete({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!bill) return sendError(res, { statusCode: 404, message: 'Held bill not found' });
  return sendSuccess(res, { message: 'Held bill removed' });
});

module.exports = { list, create, resume, remove };
