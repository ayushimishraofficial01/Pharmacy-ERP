const AuditLog = require('../models/AuditLog');

/**
 * Single audit-logging entry point for the whole app (Phase 8 spec section
 * 16 explicitly forbids a second audit-log system — every module, current
 * and future, must call this instead of writing its own).
 */
async function logAction({ req, action, entityType = null, entityId = null, description = '', metadata = {} }) {
  try {
    await AuditLog.create({
      organizationId: req.organizationId,
      branchId: req.branchId || null,
      user: req.user?._id || null,
      action,
      entityType,
      entityId,
      description,
      metadata,
      ipAddress: req.ip,
    });
  } catch (err) {
    // Audit logging must never break the primary request.
    console.error('[auditLogService] failed to write audit log:', err.message);
  }
}

module.exports = { logAction };
