const asyncHandler = require('express-async-handler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

/**
 * Builds a standard CRUD controller for a simple org-scoped master model
 * (Category, Manufacturer). Kept generic to avoid duplicating this same
 * 5-handler pattern across every simple model — call sites just pass the
 * model and a label for audit descriptions.
 */
function buildMasterController(Model, label) {
  const list = asyncHandler(async (req, res) => {
    const { search, isActive } = req.query;
    const filter = { organizationId: req.organizationId };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };
    const items = await Model.find(filter).sort({ name: 1 });
    return sendSuccess(res, { data: items });
  });

  const create = asyncHandler(async (req, res) => {
    const item = await Model.create({ ...req.body, organizationId: req.organizationId });
    await logAction({ req, action: `${label.toUpperCase()}_CREATED`, entityType: label, entityId: item._id, description: `${label} "${item.name}" created` });
    return sendSuccess(res, { statusCode: 201, data: item });
  });

  const update = asyncHandler(async (req, res) => {
    const item = await Model.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, req.body, { new: true, runValidators: true });
    if (!item) return sendError(res, { statusCode: 404, message: `${label} not found` });
    await logAction({ req, action: `${label.toUpperCase()}_UPDATED`, entityType: label, entityId: item._id, description: `${label} "${item.name}" updated` });
    return sendSuccess(res, { data: item });
  });

  const remove = asyncHandler(async (req, res) => {
    // Soft delete — masters are referenced by historical records and must never disappear.
    const item = await Model.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { isActive: false }, { new: true });
    if (!item) return sendError(res, { statusCode: 404, message: `${label} not found` });
    await logAction({ req, action: `${label.toUpperCase()}_DEACTIVATED`, entityType: label, entityId: item._id, description: `${label} "${item.name}" deactivated` });
    return sendSuccess(res, { message: `${label} deactivated`, data: item });
  });

  return { list, create, update, remove };
}

module.exports = buildMasterController;
