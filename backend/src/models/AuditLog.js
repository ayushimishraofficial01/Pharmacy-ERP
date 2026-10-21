// Merged from Phase 1's AuditLog (base shape) + org/branch scoping. Action
// list expanded to cover everything Phase 8 section 16 requires tracked;
// more actions can be logged without a schema change since `action` is a
// free-form indexed string, not a hard enum.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, trim: true, default: null },
    entityId: { type: Schema.Types.ObjectId, default: null },
    description: { type: String, trim: true, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ organizationId: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
