// Phase 11 — Feature 2. HTTP surface for offline billing:
//   GET  /api/offline-sync/bootstrap   -> data the POS caches into IndexedDB
//                                          before it ever goes offline
//   POST /api/offline-sync/push        -> upload the offline queue when back online
//   GET  /api/offline-sync/status      -> Sync Center: pending/synced/failed/conflicts
//   POST /api/offline-sync/:id/retry   -> re-attempt one FAILED record
//   POST /api/offline-sync/:id/resolve-conflict
const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const HsnMaster = require('../models/HsnMaster');
const BusinessSettings = require('../models/BusinessSettings');
const OfflineSyncRecord = require('../models/OfflineSyncRecord');
const { processSyncBatch, resolveConflict } = require('../services/offlineSyncService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// GET /api/offline-sync/bootstrap
// Everything the offline POS needs cached locally to keep billing (Feature
// 2, requirement 1): product/batch master, GST config, customers, HSN
// rates. Deliberately excludes anything not needed for billing (full
// purchase history, other branches' data, etc) — requirement 2 says "do not
// unnecessarily store sensitive information".
const bootstrap = asyncHandler(async (req, res) => {
  const [medicines, batches, customers, hsnMaster, settings] = await Promise.all([
    Medicine.find({ organizationId: req.organizationId, isActive: true })
      .select('_id medicineCode name genericName hsnCode gstRate prescriptionRequired scheduleType barcode unit')
      .lean(),
    Batch.find({ organizationId: req.organizationId, branchId: req.branchId, isActive: true })
      .select('_id medicine batchNumber expiryDate quantity reservedQuantity purchaseRate mrp sellingRate gstRate barcode')
      .lean(),
    Customer.find({ organizationId: req.organizationId, isActive: true })
      .select('_id name mobile gstin state creditLimit outstandingBalance isWalkIn')
      .lean(),
    HsnMaster.find({ organizationId: req.organizationId, isActive: true }).select('_id hsnCode gstRate').lean(),
    BusinessSettings.findOne({ organizationId: req.organizationId, branchId: req.branchId }).lean(),
  ]);

  return sendSuccess(res, {
    data: {
      medicines,
      batches,
      customers,
      hsnMaster,
      taxConfig: {
        state: settings?.state || null,
        stateCode: settings?.stateCode || null,
        pricesIncludeGST: !!settings?.pricesIncludeGST,
        defaultGstPercent: settings?.defaultGstPercent ?? 12,
        invoicePrefix: settings?.invoicePrefix || 'INV',
        maxDiscountPercent: settings?.maxDiscountPercent ?? 20,
        requirePrescriptionVerification: settings?.requirePrescriptionVerification !== false,
      },
      generatedAt: new Date(),
    },
  });
});

// POST /api/offline-sync/push
// body: { deviceId, items: [{ localTransactionId, idempotencyKey, deviceId, createdOffline, saleBody }] }
const push = asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, { statusCode: 400, message: 'items[] is required — nothing to sync.' });
  }
  if (items.length > 200) {
    return sendError(res, { statusCode: 400, message: 'Too many items in one sync batch (max 200). Split into smaller batches.' });
  }

  const results = await processSyncBatch({ organizationId: req.organizationId, branchId: req.branchId, user: req.user, items, req });

  const summary = {
    synced: results.filter((r) => r.status === 'SYNCED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    conflicts: results.filter((r) => r.status === 'CONFLICT').length,
  };

  return sendSuccess(res, { statusCode: 200, message: `Synced ${summary.synced}/${results.length} offline transaction(s)`, data: { results, summary } });
});

// GET /api/offline-sync/status
const status = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  const [pending, syncing, synced, failed, conflicts, lastSynced] = await Promise.all([
    OfflineSyncRecord.countDocuments({ ...filter, status: 'PENDING' }),
    OfflineSyncRecord.countDocuments({ ...filter, status: 'SYNCING' }),
    OfflineSyncRecord.countDocuments({ ...filter, status: 'SYNCED' }),
    OfflineSyncRecord.countDocuments({ ...filter, status: 'FAILED' }),
    OfflineSyncRecord.find({ ...filter, status: 'CONFLICT' }).populate('conflict.medicine', 'name').populate('conflict.batch', 'batchNumber').sort({ createdAt: -1 }).lean(),
    OfflineSyncRecord.findOne({ ...filter, status: 'SYNCED' }).sort({ syncedAt: -1 }).select('syncedAt').lean(),
  ]);

  const recent = await OfflineSyncRecord.find(filter).sort({ updatedAt: -1 }).limit(50).populate('user', 'name').lean();

  return sendSuccess(res, {
    data: {
      counts: { pending, syncing, synced, failed, conflicts: conflicts.length },
      conflicts,
      recent,
      lastSuccessfulSync: lastSynced?.syncedAt || null,
    },
  });
});

// POST /api/offline-sync/:id/retry — re-queues one FAILED record for the next push.
const retry = asyncHandler(async (req, res) => {
  const record = await OfflineSyncRecord.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!record) return sendError(res, { statusCode: 404, message: 'Offline sync record not found' });
  if (record.status !== 'FAILED') return sendError(res, { statusCode: 400, message: 'Only a FAILED record can be retried directly. Use resolve-conflict for CONFLICT records.' });
  record.status = 'PENDING';
  await record.save();
  await logAction({ req, action: 'OFFLINE_SYNC_RETRY_QUEUED', entityType: 'OfflineSyncRecord', entityId: record._id, description: `Offline sync record ${record.localTransactionId} re-queued for retry` });
  return sendSuccess(res, { message: 'Queued for retry on next sync', data: { record } });
});

// POST /api/offline-sync/:id/resolve-conflict
// body: { resolution: 'ALLOCATE_PARTIAL' | 'REJECT_ITEM' | 'FORCE_APPLY', notes }
const resolveConflictHandler = asyncHandler(async (req, res) => {
  try {
    const record = await resolveConflict({
      organizationId: req.organizationId,
      branchId: req.branchId,
      recordId: req.params.id,
      resolvedBy: req.user._id,
      resolution: req.body.resolution,
      notes: req.body.notes,
    });
    await logAction({ req, action: 'OFFLINE_SYNC_CONFLICT_RESOLVED', entityType: 'OfflineSyncRecord', entityId: record._id, description: `Conflict resolved (${req.body.resolution}) for offline sync record ${record.localTransactionId}` });
    return sendSuccess(res, { message: 'Conflict resolved', data: { record } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { bootstrap, push, status, retry, resolveConflict: resolveConflictHandler };
