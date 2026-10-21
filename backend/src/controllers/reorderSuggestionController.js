const asyncHandler = require('express-async-handler');
const ReorderSuggestion = require('../models/ReorderSuggestion');
const { generateSuggestions, approveSuggestion, rejectSuggestion } = require('../services/reorderSuggestionService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/reorder-suggestions/generate
const generate = asyncHandler(async (req, res) => {
  const suggestions = await generateSuggestions({ organizationId: req.organizationId, branchId: req.branchId });
  return sendSuccess(res, { data: suggestions, message: `${suggestions.length} reorder suggestion(s) generated/refreshed` });
});

// GET /api/reorder-suggestions?status=
const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (status) filter.status = status;
  const suggestions = await ReorderSuggestion.find(filter).populate('medicine', 'name medicineCode').populate('preferredSupplier', 'supplierName').sort({ generatedAt: -1 });
  return sendSuccess(res, { data: suggestions });
});

// PUT /api/reorder-suggestions/:id/approve  { approvedQuantity?, decisionNotes?, createDistributorOrder? }
const approve = asyncHandler(async (req, res) => {
  try {
    const suggestion = await approveSuggestion({
      suggestionId: req.params.id,
      organizationId: req.organizationId,
      approvedQuantity: req.body.approvedQuantity ? Number(req.body.approvedQuantity) : null,
      decisionNotes: req.body.decisionNotes,
      userId: req.user._id,
      createDistributorOrder: !!req.body.createDistributorOrder,
    });
    await logAction({ req, action: 'REORDER_SUGGESTION_APPROVED', entityType: 'ReorderSuggestion', entityId: suggestion._id, description: `Reorder suggestion approved (qty ${suggestion.approvedQuantity})` });
    return sendSuccess(res, { data: suggestion });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

// PUT /api/reorder-suggestions/:id/reject  { decisionNotes? }
const reject = asyncHandler(async (req, res) => {
  try {
    const suggestion = await rejectSuggestion({ suggestionId: req.params.id, organizationId: req.organizationId, decisionNotes: req.body.decisionNotes, userId: req.user._id });
    await logAction({ req, action: 'REORDER_SUGGESTION_REJECTED', entityType: 'ReorderSuggestion', entityId: suggestion._id, description: 'Reorder suggestion rejected' });
    return sendSuccess(res, { data: suggestion });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { generate, list, approve, reject };
