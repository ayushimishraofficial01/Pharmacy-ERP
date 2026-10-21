const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { search, isActive } = req.query;
  const filter = { organizationId: req.organizationId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { mobile: { $regex: search, $options: 'i' } }];
  const customers = await Customer.find(filter).sort({ name: 1 });
  return sendSuccess(res, { data: customers });
});

const getOne = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!customer) return sendError(res, { statusCode: 404, message: 'Customer not found' });
  return sendSuccess(res, { data: customer });
});

const create = asyncHandler(async (req, res) => {
  const customer = await Customer.create({ ...req.body, organizationId: req.organizationId, createdBy: req.user._id });
  await logAction({ req, action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: customer._id, description: `Customer "${customer.name}" created` });
  return sendSuccess(res, { statusCode: 201, data: customer });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.outstandingBalance; // only Sale/Payment flows may change this
  const customer = await Customer.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!customer) return sendError(res, { statusCode: 404, message: 'Customer not found' });
  await logAction({ req, action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: customer._id, description: `Customer "${customer.name}" updated` });
  return sendSuccess(res, { data: customer });
});

module.exports = { list, getOne, create, update };
