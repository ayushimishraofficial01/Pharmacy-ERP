// Phase 8 section 21: "Do not claim that automated backup works unless it
// is actually implemented and tested." This is a FOUNDATION only — a place
// to record backup status/history/metadata and gate restores behind
// authorization. It does NOT itself run mongodump or any backup process;
// no scheduler/cron infrastructure exists in this sandbox to run one, and
// wiring a fake "success" status would violate the rule above directly.
// >>> INTEGRATION POINT: an ops script (or a scheduled job in your real
// infra) should call POST /api/backups after running mongodump, passing
// the real file location/size/checksum.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const backupLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    sizeBytes: { type: Number, default: null },
    location: { type: String, default: '' }, // where the ops process put the file — never assume/fabricate this
    checksum: { type: String, default: '' },
    triggeredBy: { type: String, enum: ['MANUAL', 'SCHEDULED'], default: 'MANUAL' },
    errorMessage: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Phase 10 (requirement 11): populated when POST /api/backups/run
    // actually executed mongodump + an optional cloud upload itself,
    // instead of an ops script calling POST /api/backups after the fact.
    // Both paths write to the same BackupLog collection/history.
    filePath: { type: String, default: null }, // local path mongodump wrote to
    provider: { type: String, enum: ['LOCAL', 'GOOGLE_DRIVE', 'ONEDRIVE'], default: 'LOCAL' },
    uploadStatus: { type: String, enum: ['NOT_ATTEMPTED', 'UPLOADED', 'FAILED'], default: 'NOT_ATTEMPTED' },
    remoteFileId: { type: String, default: null },
    remoteUrl: { type: String, default: null },


    // Restore is a separate, more sensitive action — never automatic, and
    // requires explicit authorization recorded here (section 21: "Restore
    // Authorization").
    restoredAt: { type: Date, default: null },
    restoreAuthorizedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    restoreNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

backupLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.models.BackupLog || mongoose.model('BackupLog', backupLogSchema);
