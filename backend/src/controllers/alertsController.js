const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const { runAllChecks } = require('../services/alertService');
const { sendSuccess } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/alerts/run — triggers a check cycle on demand. In production
// this would also be called by a scheduled job (cron/queue worker); the
// route is exposed for manual/testing use since this sandbox has no
// scheduler infrastructure to wire a cron job into.
const run = asyncHandler(async (req, res) => {
  const result = await runAllChecks({ organizationId: req.organizationId, branchId: req.branchId });
  await logAction({ req, action: 'ALERT_CHECK_RUN', entityType: null, entityId: null, description: `Alert check run: ${result.total} notification(s) generated` });
  return sendSuccess(res, { data: result });
});

// GET /api/alerts — the current user's own notifications.
const list = asyncHandler(async (req, res) => {
  const { unreadOnly } = req.query;
  const filter = { user: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;
  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  return sendSuccess(res, { data: notifications });
});

const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { isRead: true });
  return sendSuccess(res, { message: 'Marked as read' });
});

module.exports = { run, list, markRead };
