// Phase 11 — Feature 3, requirement 11 (Bill Template Settings). No prior
// phase exposed BusinessSettings over the API at all (only read internally
// by saleController/stockAnalysisController) — this is a new, small CRUD
// controller for the SAME EXISTING MODEL, not a new settings system.
const asyncHandler = require('express-async-handler');
const BusinessSettings = require('../models/BusinessSettings');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// GET /api/business-settings — current branch's settings, or the schema
// defaults (as a plain object, not saved) if none exist yet.
const getSettings = asyncHandler(async (req, res) => {
  let settings = await BusinessSettings.findOne({ organizationId: req.organizationId, branchId: req.branchId });
  if (!settings) {
    // Return schema defaults without persisting — avoids creating a
    // half-configured row just because someone opened the settings page.
    settings = new BusinessSettings({ organizationId: req.organizationId, branchId: req.branchId });
  }
  return sendSuccess(res, { data: settings });
});

// PUT /api/business-settings — full upsert. Deliberately whitelist-free
// beyond what the schema itself allows (Mongoose strict mode drops unknown
// fields), so this endpoint can be extended by later phases' settings too
// without duplicating a settings controller per module.
const updateSettings = asyncHandler(async (req, res) => {
  const settings = await BusinessSettings.findOneAndUpdate(
    { organizationId: req.organizationId, branchId: req.branchId },
    { $set: req.body },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  await logAction({ req, action: 'BUSINESS_SETTINGS_UPDATED', entityType: 'BusinessSettings', entityId: settings._id, description: 'Business settings updated' });
  return sendSuccess(res, { message: 'Settings saved', data: settings });
});

module.exports = { getSettings, updateSettings };
