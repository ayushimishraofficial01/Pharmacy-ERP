// Phase 11 — Feature 1 (GST Return Management), requirement 6: GST Filing
// History. This is a NEW model — nothing in Phases 1-10 tracked GST return
// filings — but it deliberately reuses AuditLog (via auditLogService) for
// the generic "who did what when" trail, and only stores here what AuditLog
// isn't shaped for: the filing lifecycle itself (ARN, retries, per-period
// uniqueness) that GST Return Dashboard / Filing History need to query and
// list efficiently.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const RETURN_TYPES = ['GSTR-1', 'GSTR-3B'];
const FILING_STATUSES = [
  'DRAFT', // generated locally, not yet validated
  'VALIDATED', // passed gstValidationService, ready to export/submit
  'EXPORTED', // JSON/Excel/CSV exported, not submitted to the portal
  'SUBMITTED', // sent to gstPortalService
  'FILED', // portal acknowledged with an ARN
  'FAILED', // portal submission failed
];

const exportHistoryEntrySchema = new Schema(
  {
    format: { type: String, enum: ['JSON', 'EXCEL', 'CSV', 'PDF_SUMMARY'], required: true },
    exportedAt: { type: Date, default: Date.now },
    exportedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const gstFilingSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    returnType: { type: String, enum: RETURN_TYPES, required: true },
    gstin: { type: String, trim: true, required: true },
    financialYear: { type: String, required: true }, // "2026-27"
    period: { type: String, required: true }, // "2026-08" (month the return covers)

    // Snapshot of the generated return payload (see gstReturnService) at
    // the moment this filing record was created/last regenerated — kept so
    // Filing History shows exactly what was filed, even if the underlying
    // sales are edited/returned afterwards.
    summary: { type: Schema.Types.Mixed, default: {} },
    validationErrors: [{ invoiceNumber: String, field: String, message: String }],

    status: { type: String, enum: FILING_STATUSES, required: true, default: 'DRAFT' },

    exportHistory: { type: [exportHistoryEntrySchema], default: [] },

    // Portal submission fields — never fabricated (see gstPortalService.js).
    // All null/empty until a real portal integration actually responds.
    submittedAt: { type: Date, default: null },
    arn: { type: String, trim: true, default: null }, // Acknowledgement Reference Number
    filedAt: { type: Date, default: null },
    filedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    errorMessage: { type: String, default: null },
    retryCount: { type: Number, default: 0 },

    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

gstFilingSchema.index({ organizationId: 1, branchId: 1, returnType: 1, period: 1 }, { unique: true });
gstFilingSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.models.GstFiling || mongoose.model('GstFiling', gstFilingSchema);
module.exports.RETURN_TYPES = RETURN_TYPES;
module.exports.FILING_STATUSES = FILING_STATUSES;
