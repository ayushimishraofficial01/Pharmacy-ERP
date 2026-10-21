const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { search, isActive } = req.query;
  const filter = { organizationId: req.organizationId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$text = { $search: search };
  const suppliers = await Supplier.find(filter).sort({ supplierName: 1 });
  return sendSuccess(res, { data: suppliers });
});

const getOne = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!supplier) return sendError(res, { statusCode: 404, message: 'Supplier not found' });
  return sendSuccess(res, { data: supplier });
});

const create = asyncHandler(async (req, res) => {
  let { supplierCode } = req.body;
  if (!supplierCode) {
    const seq = await Counter.nextSequence(req.organizationId, 'SUPPLIER');
    supplierCode = `SUP-${String(seq).padStart(6, '0')}`;
  }
  const supplier = await Supplier.create({ ...req.body, supplierCode, organizationId: req.organizationId, currentBalance: req.body.openingBalance || 0, createdBy: req.user._id });
  await logAction({ req, action: 'SUPPLIER_CREATED', entityType: 'Supplier', entityId: supplier._id, description: `Supplier "${supplier.supplierName}" (${supplier.supplierCode}) created` });
  return sendSuccess(res, { statusCode: 201, data: supplier });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };
  delete body.supplierCode;
  delete body.currentBalance; // never editable directly — only via ledger entries
  const supplier = await Supplier.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!supplier) return sendError(res, { statusCode: 404, message: 'Supplier not found' });
  await logAction({ req, action: 'SUPPLIER_UPDATED', entityType: 'Supplier', entityId: supplier._id, description: `Supplier "${supplier.supplierName}" updated` });
  return sendSuccess(res, { data: supplier });
});

const remove = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { isActive: false }, { new: true });
  if (!supplier) return sendError(res, { statusCode: 404, message: 'Supplier not found' });
  await logAction({ req, action: 'SUPPLIER_DEACTIVATED', entityType: 'Supplier', entityId: supplier._id, description: `Supplier "${supplier.supplierName}" deactivated` });
  return sendSuccess(res, { message: 'Supplier deactivated', data: supplier });
});

module.exports = { list, getOne, create, update, remove };
