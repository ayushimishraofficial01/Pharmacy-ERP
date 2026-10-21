// Phase 10 — HSN/GST master CRUD (requirement 9).
const asyncHandler = require('express-async-handler');
const HsnMaster = require('../models/HsnMaster');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');
const { resolveRateForDate } = require('../services/hsnLookupService');

const list = asyncHandler(async (req, res) => {
  const { search, isActive } = req.query;
  const filter = { organizationId: req.organizationId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ hsnCode: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }];
  const rows = await HsnMaster.find(filter).sort({ hsnCode: 1 });
  return sendSuccess(res, { data: rows });
});

const getOne = asyncHandler(async (req, res) => {
  const row = await HsnMaster.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!row) return sendError(res, { statusCode: 404, message: 'HSN code not found' });
  return sendSuccess(res, { data: row });
});

// GET /api/hsn-master/rate?hsnCode=3004&date=2026-04-01 — effective-dated rate lookup.
const getRate = asyncHandler(async (req, res) => {
  const { hsnCode, date } = req.query;
  if (!hsnCode) return sendError(res, { statusCode: 400, message: 'hsnCode is required' });
  const row = await HsnMaster.findOne({ organizationId: req.organizationId, hsnCode: String(hsnCode).trim().toUpperCase(), isActive: true });
  if (!row) return sendError(res, { statusCode: 404, message: `No HSN master entry for ${hsnCode}` });
  const gstRate = resolveRateForDate(row, date ? new Date(date) : new Date());
  return sendSuccess(res, { data: { hsnCode: row.hsnCode, gstRate, asOf: date || new Date().toISOString() } });
});

const create = asyncHandler(async (req, res) => {
  const { hsnCode, description, gstRate, effectiveDate } = req.body;
  if (!hsnCode || gstRate === undefined) return sendError(res, { statusCode: 400, message: 'hsnCode and gstRate are required' });

  const row = await HsnMaster.create({
    organizationId: req.organizationId,
    hsnCode: String(hsnCode).trim().toUpperCase(),
    description: description || '',
    gstRate: Number(gstRate),
    effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'HSN_CREATED', entityType: 'HsnMaster', entityId: row._id, description: `HSN ${row.hsnCode} added at ${row.gstRate}% GST` });
  return sendSuccess(res, { statusCode: 201, data: row });
});

// PUT /api/hsn-master/:id — a GST-rate change is appended to rateHistory
// (with an effectiveFrom date) rather than silently overwriting the old
// rate, so past invoices/reports can still resolve the rate that applied
// when they were created.
const update = asyncHandler(async (req, res) => {
  const row = await HsnMaster.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!row) return sendError(res, { statusCode: 404, message: 'HSN code not found' });

  const { description, gstRate, effectiveDate, isActive } = req.body;
  if (description !== undefined) row.description = description;
  if (isActive !== undefined) row.isActive = isActive;

  if (gstRate !== undefined && Number(gstRate) !== row.gstRate) {
    const newEffectiveFrom = effectiveDate ? new Date(effectiveDate) : new Date();
    // Preserve the rate that was in effect before this change.
    row.rateHistory.push({ gstRate: row.gstRate, effectiveFrom: row.effectiveDate, changedBy: row.updatedBy || row.createdBy, changedAt: new Date() });
    row.gstRate = Number(gstRate);
    row.effectiveDate = newEffectiveFrom;
  }
  row.updatedBy = req.user._id;
  await row.save();

  await logAction({ req, action: 'HSN_UPDATED', entityType: 'HsnMaster', entityId: row._id, description: `HSN ${row.hsnCode} updated (rate now ${row.gstRate}%)` });
  return sendSuccess(res, { data: row });
});

const remove = asyncHandler(async (req, res) => {
  const row = await HsnMaster.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { isActive: false, updatedBy: req.user._id }, { new: true });
  if (!row) return sendError(res, { statusCode: 404, message: 'HSN code not found' });
  await logAction({ req, action: 'HSN_DEACTIVATED', entityType: 'HsnMaster', entityId: row._id, description: `HSN ${row.hsnCode} deactivated` });
  return sendSuccess(res, { message: 'HSN code deactivated', data: row });
});

module.exports = { list, getOne, getRate, create, update, remove };
