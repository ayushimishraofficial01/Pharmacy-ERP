// Phase 11 — Feature 2, requirement 2 (Local Storage). IndexedDB wrapper —
// deliberately zero dependencies (native browser indexedDB API only), since
// this project's frontend has no IndexedDB library in package.json and
// network access isn't available to add one. Stores exactly what
// offlineSyncController.bootstrap() sends: product/batch master, customers,
// HSN/tax config, plus the outbox (pending offline sales) and sync log.
//
// Requirement 2 also says "do not unnecessarily store sensitive
// information" — this deliberately caches only what POS billing needs
// (medicine/batch/customer/tax master), never full purchase history, other
// branches' data, or anything beyond one branch's current catalog.
const DB_NAME = 'pharmacy_erp_offline';
const DB_VERSION = 1;

const STORES = {
  medicines: 'medicines', // keyPath _id
  batches: 'batches', // keyPath _id, indexed by medicine
  customers: 'customers', // keyPath _id
  hsnMaster: 'hsnMaster', // keyPath _id
  meta: 'meta', // keyPath key — taxConfig, generatedAt, deviceId
  outbox: 'outbox', // keyPath localTransactionId — queued offline sales
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support offline billing (IndexedDB unavailable).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.medicines)) db.createObjectStore(STORES.medicines, { keyPath: '_id' });
      if (!db.objectStoreNames.contains(STORES.batches)) {
        const store = db.createObjectStore(STORES.batches, { keyPath: '_id' });
        store.createIndex('by_medicine', 'medicine');
      }
      if (!db.objectStoreNames.contains(STORES.customers)) db.createObjectStore(STORES.customers, { keyPath: '_id' });
      if (!db.objectStoreNames.contains(STORES.hsnMaster)) db.createObjectStore(STORES.hsnMaster, { keyPath: '_id' });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: 'localTransactionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAll(storeName, records) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite');
    const store = t.objectStore(storeName);
    store.clear();
    for (const record of records || []) store.put(record);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function getAll(storeName) {
  const store = await tx(storeName, 'readonly');
  return promisify(store.getAll());
}

async function getAllByIndex(storeName, indexName, value) {
  const store = await tx(storeName, 'readonly');
  return promisify(store.index(indexName).getAll(value));
}

async function put(storeName, record) {
  const store = await tx(storeName, 'readwrite');
  return promisify(store.put(record));
}

async function get(storeName, key) {
  const store = await tx(storeName, 'readonly');
  return promisify(store.get(key));
}

async function del(storeName, key) {
  const store = await tx(storeName, 'readwrite');
  return promisify(store.delete(key));
}

/** Persists the bootstrap payload from GET /api/offline-sync/bootstrap. */
async function saveBootstrap({ medicines, batches, customers, hsnMaster, taxConfig, generatedAt }) {
  await Promise.all([putAll(STORES.medicines, medicines), putAll(STORES.batches, batches), putAll(STORES.customers, customers), putAll(STORES.hsnMaster, hsnMaster)]);
  await put(STORES.meta, { key: 'taxConfig', value: taxConfig });
  await put(STORES.meta, { key: 'generatedAt', value: generatedAt });
  await put(STORES.meta, { key: 'lastBootstrapAt', value: new Date().toISOString() });
}

async function getTaxConfig() {
  const row = await get(STORES.meta, 'taxConfig');
  return row?.value || null;
}

async function getLastBootstrapAt() {
  const row = await get(STORES.meta, 'lastBootstrapAt');
  return row?.value || null;
}

/** Stable per-device identifier (Feature 2, requirement 3) — generated once, persisted forever. */
async function getOrCreateDeviceId() {
  const existing = await get(STORES.meta, 'deviceId');
  if (existing?.value) return existing.value;
  const id = `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  await put(STORES.meta, { key: 'deviceId', value: id });
  return id;
}

async function enqueueOutbox(entry) {
  await put(STORES.outbox, entry);
}
async function getOutbox() {
  return getAll(STORES.outbox);
}
async function removeFromOutbox(localTransactionId) {
  await del(STORES.outbox, localTransactionId);
}
async function updateOutboxEntry(localTransactionId, patch) {
  const existing = await get(STORES.outbox, localTransactionId);
  if (!existing) return;
  await put(STORES.outbox, { ...existing, ...patch });
}

export const offlineDb = {
  STORES,
  saveBootstrap,
  getTaxConfig,
  getLastBootstrapAt,
  getOrCreateDeviceId,
  getAll,
  getAllByIndex,
  get,
  put,
  enqueueOutbox,
  getOutbox,
  removeFromOutbox,
  updateOutboxEntry,
};
