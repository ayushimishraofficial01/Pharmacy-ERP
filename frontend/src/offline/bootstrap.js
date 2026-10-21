// Phase 11 — Feature 2, requirement 1/2: called once after login (and
// whenever the user asks to refresh) to pull the current branch's
// medicine/batch/customer/tax master into IndexedDB, so billing keeps
// working the moment the network drops.
import { offlineSync as offlineSyncApi } from '../api/endpoints';
import { offlineDb } from './db';
import { initSyncEngine } from './syncEngine';

export async function refreshOfflineCache() {
  const data = await offlineSyncApi.bootstrap();
  await offlineDb.saveBootstrap(data);
  return data;
}

let started = false;
/** Call once from AppShell after auth is confirmed. Safe to call more than once. */
export async function startOfflineSupport() {
  if (started) return;
  started = true;
  initSyncEngine();
  if (navigator.onLine) {
    try {
      await refreshOfflineCache();
    } catch (err) {
      // Non-fatal — the app still works online without a cache; offline
      // billing simply won't have fresh data until this succeeds once.
      console.warn('[offline] initial cache bootstrap failed:', err.message);
    }
  }
}
