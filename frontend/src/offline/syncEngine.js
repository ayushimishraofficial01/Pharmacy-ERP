// Phase 11 — Feature 2, requirements 4/7/8 (Automatic Sync + Failed
// Sync/Retry). A tiny pub/sub engine (no external state-management library
// in this project's package.json) that:
//   - listens for the browser's online/offline events,
//   - pushes the IndexedDB outbox to POST /api/offline-sync/push when back
//     online (or on "Sync Now"),
//   - retries automatically on reconnect, and
//   - never deletes a PENDING/FAILED entry — only a SYNCED one is removed
//     from the outbox (the server is now the source of truth for it).
import { offlineSync as offlineSyncApi } from '../api/endpoints';
import { offlineDb } from './db';

const listeners = new Set();
let state = {
  connection: navigator.onLine ? 'ONLINE' : 'OFFLINE', // ONLINE | OFFLINE | SYNCING | SYNC_COMPLETE | SYNC_FAILED | CONFLICTS_FOUND
  pendingCount: 0,
  lastSyncResult: null,
  lastError: null,
};

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

async function refreshPendingCount() {
  const outbox = await offlineDb.getOutbox();
  setState({ pendingCount: outbox.filter((o) => o.status !== 'SYNCED').length });
}

/** Requirement 4: automatic sync when connection returns. Also callable directly as "Sync Now". */
export async function syncNow() {
  if (!navigator.onLine) {
    setState({ connection: 'OFFLINE' });
    return { skipped: true, reason: 'offline' };
  }

  const outbox = (await offlineDb.getOutbox()).filter((o) => o.status === 'PENDING' || o.status === 'FAILED');
  if (outbox.length === 0) {
    await refreshPendingCount();
    setState({ connection: 'ONLINE' });
    return { skipped: true, reason: 'nothing-to-sync' };
  }

  setState({ connection: 'SYNCING' });
  try {
    const items = outbox.map((o) => ({
      localTransactionId: o.localTransactionId,
      idempotencyKey: o.idempotencyKey,
      deviceId: o.deviceId,
      createdOffline: o.createdOffline,
      saleBody: o.saleBody,
    }));

    const { results, summary } = await offlineSyncApi.push({ items });

    for (const r of results) {
      if (r.status === 'SYNCED') {
        // requirement 5/8: only a confirmed SYNCED result clears the
        // outbox entry — never optimistically before the server confirms.
        await offlineDb.removeFromOutbox(r.localTransactionId);
      } else {
        await offlineDb.updateOutboxEntry(r.localTransactionId, { status: r.status, lastError: r.error || null, lastSyncedAttemptAt: new Date().toISOString() });
      }
    }

    await refreshPendingCount();
    const hasConflicts = summary.conflicts > 0;
    const hasFailed = summary.failed > 0;
    setState({
      connection: hasConflicts ? 'CONFLICTS_FOUND' : hasFailed ? 'SYNC_FAILED' : 'SYNC_COMPLETE',
      lastSyncResult: summary,
      lastError: null,
    });
    return { skipped: false, summary, results };
  } catch (err) {
    // requirement 8: network/server failure — keep everything in the
    // outbox exactly as it was, mark the sync attempt failed, and let
    // automatic retry (below) try again on the next reconnect/interval.
    setState({ connection: 'SYNC_FAILED', lastError: err.response?.data?.message || err.message });
    return { skipped: false, error: err.message };
  }
}

let retryTimer = null;
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    if (navigator.onLine) {
      const outbox = await offlineDb.getOutbox();
      if (outbox.some((o) => o.status === 'PENDING' || o.status === 'FAILED')) {
        await syncNow();
      }
    }
  }, 30000); // requirement 8: automatic retry every 30s while anything is pending/failed
}

let initialized = false;
export function initSyncEngine() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('online', async () => {
    setState({ connection: 'ONLINE' });
    await syncNow(); // requirement 4, step 1-2: detect connection, start sync
  });
  window.addEventListener('offline', () => setState({ connection: 'OFFLINE' }));

  refreshPendingCount();
  scheduleRetry();
  if (navigator.onLine) syncNow();
}

export { refreshPendingCount };
