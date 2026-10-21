// Phase 10 — scheduled backup configuration (requirement 11).
// IMPORTANT: this record stores DESIRED cadence only. There is no
// in-process job scheduler in this codebase (no cron library is installed,
// and adding an untested one would risk exactly the kind of "claims it
// works but wasn't verified" the project rules warn against). Actually
// triggering a backup on this cadence requires an EXTERNAL scheduler — OS
// cron, systemd timer, a cloud scheduler (e.g. a serverless cron job) — set
// up to call `POST /api/backups/run` at the configured time. This document
// is what that external caller should read to know when/how to run.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const backupScheduleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    isActive: { type: Boolean, default: false },
    cadence: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'DAILY' },
    hourOfDay: { type: Number, min: 0, max: 23, default: 2 }, // 2 AM local, low-traffic default
    dayOfWeek: { type: Number, min: 0, max: 6, default: 0 }, // used when cadence = WEEKLY (0 = Sunday)
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 }, // used when cadence = MONTHLY (capped at 28 to always be valid)
    provider: { type: String, enum: ['LOCAL', 'GOOGLE_DRIVE', 'ONEDRIVE'], default: 'LOCAL' },
    lastRunAt: { type: Date, default: null },
    lastRunStatus: { type: String, enum: ['SUCCESS', 'FAILED', null], default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const BackupSchedule = mongoose.models.BackupSchedule || mongoose.model('BackupSchedule', backupScheduleSchema);
module.exports = BackupSchedule;
