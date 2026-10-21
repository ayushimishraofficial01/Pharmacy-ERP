// Phase 11 — Feature 2 (Offline Billing + Auto Sync). Server-side ledger of
// every offline transaction a POS client has ever tried to sync, keyed by
// the SAME idempotencyKey the offline client stamped on the bill before it
// ever reached the server. This is what powers the Sync Center's
// pending/synced/failed/conflict view and is what makes a retried/duplicate
// sync request safe to receive twice.
//
// IMPORTANT: this does not replace Sale.idempotencyKey (already in Sale.js,
// used by saleController/saleCreationService to make Sale creation itself
// idempotent). OfflineSyncRecord is the sync-attempt audit trail; Sale is
// still the single source of truth for the actual bill.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const SYNC_STATUSES = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'];

const offlineSyncRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    // Client-generated identifiers — set before the bill ever leaves the
    // device, so retries/refresh/app-restart all resolve to this same row.
    localTransactionId: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, required: true, trim: true },
    deviceId: { type: String, required: true, trim: true },

    transactionType: { type: String, enum: ['SALE'], default: 'SALE' },
    createdOffline: { type: Date, required: true }, // client-side timestamp of bill creation

    status: { type: String, enum: SYNC_STATUSES, required: true, default: 'PENDING', index: true },

    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null }, // set once SYNCED

    // Populated on CONFLICT (see offlineSyncService.detectStockConflict) —
    // never silently overwritten; an admin resolves it explicitly via
    // resolveConflict().
    conflict: {
      medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', default: null },
      batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
      offlineStockAssumed: { type: Number, default: null },
      serverStockAtSync: { type: Number, default: null },
      offlineSaleQuantity: { type: Number, default: null },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      resolution: { type: String, enum: ['ALLOCATE_PARTIAL', 'REJECT_ITEM', 'FORCE_APPLY', null], default: null },
      notes: { type: String, default: null },
    },

    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: null },

    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Same idempotencyKey from the same device/branch must resolve to exactly
// one sync record — this IS the duplicate-prevention guarantee at the sync
// layer (Feature 2, requirement 5).
offlineSyncRecordSchema.index({ organizationId: 1, branchId: 1, idempotencyKey: 1 }, { unique: true });
offlineSyncRecordSchema.index({ organizationId: 1, branchId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.OfflineSyncRecord || mongoose.model('OfflineSyncRecord', offlineSyncRecordSchema);
module.exports.SYNC_STATUSES = SYNC_STATUSES;
