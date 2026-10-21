const asyncHandler = require('express-async-handler');
const JournalEntry = require('../models/JournalEntry');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const entries = await JournalEntry.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('lines.account', 'code name').sort({ date: -1 });
  return sendSuccess(res, { data: entries });
});

const create = asyncHandler(async (req, res) => {
  // The model's own validator rejects an unbalanced entry (debit != credit);
  // catching that here just gives a cleaner error message than the raw
  // Mongoose validation error would.
  const totalDebit = (req.body.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = (req.body.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    return sendError(res, { statusCode: 400, message: `Journal entry is not balanced: debit ${totalDebit} vs credit ${totalCredit}` });
  }

  const entry = await JournalEntry.create({ ...req.body, organizationId: req.organizationId, branchId: req.branchId, createdBy: req.user._id });
  await logAction({ req, action: 'JOURNAL_ENTRY_CREATED', entityType: 'JournalEntry', entityId: entry._id, description: `Journal entry recorded: ${entry.narration || entry.reference || ''}` });
  return sendSuccess(res, { statusCode: 201, data: entry });
});

module.exports = { list, create };
