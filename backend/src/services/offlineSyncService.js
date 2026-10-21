// Phase 11 — Feature 2 (True Offline Billing + Auto Sync). Server-side half
// of sync: receives a batch of bills the POS created while offline and
// applies them through the EXACT SAME saleCreationService.createSaleTransaction
// used by the online POS (no separate/duplicate billing system — see that
// file's header comment). This module adds what offline sync specifically
// needs on top: per-item idempotent dedupe, stock-conflict detection, and a
// queryable OfflineSyncRecord trail for the Sync Center UI.
const OfflineSyncRecord = require('../models/OfflineSyncRecord');
const Batch = require('../models/Batch');
const { createSaleTransaction, findExistingByIdempotencyKey } = require('./saleCreationService');
const { logAction } = require('./auditLogService');

/**
 * Processes ONE queued offline sale. Never throws for a business-rule
 * failure — every outcome (synced / conflict / failed) is returned so the
 * caller can process the rest of the batch even if this item fails.
 *
 * item shape (from the offline client's IndexedDB queue):
 * { localTransactionId, idempotencyKey, deviceId, createdOffline, saleBody }
 */
async function processQueuedSale({ organizationId, branchId, user, item, req }) {
  const { localTransactionId, idempotencyKey, deviceId, createdOffline, saleBody } = item;

  if (!idempotencyKey || !localTransactionId || !deviceId) {
    return { localTransactionId, status: 'FAILED', error: 'Offline transaction is missing localTransactionId, idempotencyKey, or deviceId — cannot sync safely.' };
  }

  // Duplicate-prevention (requirement 5): a sync record for this exact
  // idempotencyKey already exists — this is a retry/refresh/app-restart
  // replay, not a new sale. Return its current state instead of doing
  // anything again.
  let record = await OfflineSyncRecord.findOne({ organizationId, branchId, idempotencyKey });
  if (record && record.status === 'SYNCED') {
    return { localTransactionId, status: 'SYNCED', saleId: record.sale, replay: true };
  }
  if (record && record.status === 'CONFLICT') {
    return { localTransactionId, status: 'CONFLICT', conflict: record.conflict, replay: true };
  }

  if (!record) {
    record = await OfflineSyncRecord.create({
      organizationId,
      branchId,
      localTransactionId,
      idempotencyKey,
      deviceId,
      createdOffline: createdOffline ? new Date(createdOffline) : new Date(),
      status: 'SYNCING',
      user: user._id,
    });
  } else {
    record.status = 'SYNCING';
  }
  record.attempts += 1;
  record.lastAttemptAt = new Date();
  await record.save();

  // Also short-circuit against Sale itself — belt-and-braces alongside the
  // OfflineSyncRecord check above, since Sale.idempotencyKey already
  // enforces this at the DB level (unique sparse index) for the online path
  // too.
  const existingSale = await findExistingByIdempotencyKey({ organizationId, branchId, idempotencyKey });
  if (existingSale) {
    record.status = 'SYNCED';
    record.sale = existingSale._id;
    record.syncedAt = new Date();
    await record.save();
    return { localTransactionId, status: 'SYNCED', saleId: existingSale._id, replay: true };
  }

  try {
    const result = await createSaleTransaction({
      organizationId,
      branchId,
      user,
      body: { ...saleBody, idempotencyKey, offlineSync: true, offlineCreatedAt: createdOffline },
    });

    record.status = 'SYNCED';
    record.sale = result.sale._id;
    record.syncedAt = new Date();
    record.lastError = null;
    await record.save();

    if (req) {
      await logAction({ req, action: 'OFFLINE_SALE_SYNCED', entityType: 'Sale', entityId: result.sale._id, description: `Offline sale ${localTransactionId} from device ${deviceId} synced as ${result.sale.saleNumber}`, metadata: { deviceId, localTransactionId } });
    }

    return { localTransactionId, status: 'SYNCED', saleId: result.sale._id };
  } catch (err) {
    if (err.code === 'STOCK_CONFLICT') {
      // Requirement 6: never silently overwrite stock. Record the conflict
      // for admin resolution instead of failing silently or forcing it through.
      record.status = 'CONFLICT';
      record.conflict = {
        medicine: err.conflict.medicine,
        batch: err.conflict.batch,
        offlineStockAssumed: saleBody.assumedStockAtSale ?? null,
        serverStockAtSync: err.conflict.serverStockAtSync,
        offlineSaleQuantity: err.conflict.offlineSaleQuantity,
      };
      record.lastError = err.message;
      await record.save();

      if (req) {
        await logAction({ req, action: 'OFFLINE_SYNC_CONFLICT', entityType: 'OfflineSyncRecord', entityId: record._id, description: `Stock conflict syncing offline sale ${localTransactionId}: ${err.message}`, metadata: { deviceId, localTransactionId } });
      }

      return { localTransactionId, status: 'CONFLICT', conflict: record.conflict, error: err.message };
    }

    // Any other failure: keep the record, mark FAILED, never delete it —
    // requirement 8 ("never lose an offline invoice"). It's retried on the
    // next sync pass (either "Sync Now" or automatic reconnect retry).
    record.status = 'FAILED';
    record.lastError = err.message;
    await record.save();

    if (req) {
      await logAction({ req, action: 'OFFLINE_SYNC_FAILED', entityType: 'OfflineSyncRecord', entityId: record._id, description: `Sync failed for offline sale ${localTransactionId}: ${err.message}`, metadata: { deviceId, localTransactionId } });
    }

    return { localTransactionId, status: 'FAILED', error: err.message };
  }
}

/** Processes a batch, one item at a time (each in its own transaction) so one bad item never blocks the rest of the queue. */
async function processSyncBatch({ organizationId, branchId, user, items, req }) {
  const results = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const result = await processQueuedSale({ organizationId, branchId, user, item, req });
    results.push(result);
  }
  return results;
}

/** Admin resolution of a CONFLICT record (requirement 6 — "provide admin resolution"). */
async function resolveConflict({ organizationId, branchId, recordId, resolvedBy, resolution, notes }) {
  const record = await OfflineSyncRecord.findOne({ _id: recordId, organizationId, branchId });
  if (!record) throw Object.assign(new Error('Offline sync record not found'), { statusCode: 404 });
  if (record.status !== 'CONFLICT') throw Object.assign(new Error('Only a CONFLICT record can be resolved'), { statusCode: 400 });

  if (!['ALLOCATE_PARTIAL', 'REJECT_ITEM', 'FORCE_APPLY'].includes(resolution)) {
    throw Object.assign(new Error('resolution must be ALLOCATE_PARTIAL, REJECT_ITEM, or FORCE_APPLY'), { statusCode: 400 });
  }

  record.conflict.resolvedAt = new Date();
  record.conflict.resolvedBy = resolvedBy;
  record.conflict.resolution = resolution;
  record.conflict.notes = notes || null;

  if (resolution === 'REJECT_ITEM') {
    record.status = 'FAILED';
    record.lastError = 'Conflict resolved: item rejected by admin, not applied to stock.';
    await record.save();
    return record;
  }

  // ALLOCATE_PARTIAL / FORCE_APPLY both mean "try again" — ALLOCATE_PARTIAL
  // expects the admin adjusted the offline sale's quantity to fit available
  // stock before retrying (done client-side); FORCE_APPLY re-runs it as-is
  // and will allow the batch to go negative only if the admin explicitly
  // adjusted the batch stock first. Either way, this function only flips
  // status back to PENDING so the normal sync path re-attempts it — it does
  // NOT silently mutate Batch.quantity itself.
  record.status = 'PENDING';
  await record.save();
  return record;
}

module.exports = { processQueuedSale, processSyncBatch, resolveConflict };
