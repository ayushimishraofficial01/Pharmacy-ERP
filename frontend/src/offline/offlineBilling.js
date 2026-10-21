// Phase 11 — Feature 2, requirement 1 (Offline POS): medicine/barcode
// search, customer selection, GST calc, discounts, and payment all work
// against the IndexedDB cache saveBootstrap() wrote, so billing keeps
// working with no backend reachable.
//
// IMPORTANT: the GST math here is a client-side PREVIEW for the printed
// offline receipt only — money.js/saleCalculationService.js/
// gstCalculationService.js remain the single source of truth. When the
// bill syncs, saleCreationService.createSaleTransaction() recalculates
// everything from server-side Medicine/Batch data and that recalculated
// value is what's actually recorded — this mirrors it closely (same
// paise-rounding approach) but is not authoritative, exactly like an
// online client's cart total was never trusted either (see
// saleCreationService.js header comment).
import { offlineDb } from './db';

function toPaise(rupees) {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
function toRupees(paise) {
  return Math.round(paise) / 100;
}
function sum(...amounts) {
  return toRupees(amounts.reduce((acc, v) => acc + toPaise(v || 0), 0));
}
function subtract(a, b) {
  return toRupees(toPaise(a) - toPaise(b));
}
function percent(amount, pct) {
  return toRupees(Math.round((toPaise(amount) * pct) / 100));
}
function roundToWhole(amount) {
  const rounded = Math.round(amount);
  return { rounded, roundOff: subtract(rounded, amount) };
}

export async function searchCachedMedicines(query) {
  const all = await offlineDb.getAll(offlineDb.STORES.medicines);
  if (!query) return all.slice(0, 50);
  const q = query.toLowerCase();
  return all.filter((m) => m.name?.toLowerCase().includes(q) || m.genericName?.toLowerCase().includes(q) || m.barcode === query || m.medicineCode?.toLowerCase() === q).slice(0, 50);
}

export async function findMedicineByBarcode(barcode) {
  const all = await offlineDb.getAll(offlineDb.STORES.medicines);
  return all.find((m) => m.barcode === barcode) || null;
}

export async function getCachedBatchesForMedicine(medicineId) {
  const batches = await offlineDb.getAllByIndex(offlineDb.STORES.batches, 'by_medicine', medicineId);
  // FEFO — same ordering principle as stockService.allocateFefo server-side.
  // Exclude batches with zero quantity or zero/missing selling rate (pricing not configured).
  return batches.filter((b) => (b.quantity - (b.reservedQuantity || 0) > 0) && (b.sellingRate || 0) > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
}

export async function searchCachedCustomers(query) {
  const all = await offlineDb.getAll(offlineDb.STORES.customers);
  if (!query) return all.slice(0, 50);
  const q = query.toLowerCase();
  return all.filter((c) => c.name?.toLowerCase().includes(q) || c.mobile?.includes(query)).slice(0, 50);
}

/**
 * cart: [{ medicine, batch, quantity, discountType, discountValue }]
 * Returns a locally-computed preview matching saleCalculationService's
 * shape closely enough to print a receipt offline.
 */
export async function computeLocalInvoicePreview(cart, { customerState, taxConfig, billDiscount }) {
  const taxType = taxConfig?.state && customerState && taxConfig.state !== customerState ? 'INTER_STATE' : 'INTRA_STATE';
  const pricesIncludeGST = !!taxConfig?.pricesIncludeGST;

  const lines = cart.map((line) => {
    const unitPrice = Number(line.medicine.defaultMrp) > 0 ? line.medicine.defaultMrp : (Number(line.medicine.defaultRate) > 0 ? line.medicine.defaultRate : line.batch.mrp || line.batch.sellingRate);
    const baseAmount = toRupees(Math.round(toPaise(unitPrice) * line.quantity));
    const discountAmount = line.discountType === 'PERCENTAGE' ? percent(baseAmount, Number(line.discountValue) || 0) : line.discountType === 'FIXED_AMOUNT' ? Math.min(Number(line.discountValue) || 0, baseAmount) : 0;
    return { ...line, baseAmount, discountAmount };
  });

  const subtotal = sum(...lines.map((l) => l.baseAmount));
  const itemDiscount = sum(...lines.map((l) => l.discountAmount));

  let billDiscountAmount = 0;
  if (billDiscount?.type) {
    const postItemDiscount = subtract(subtotal, itemDiscount);
    billDiscountAmount = billDiscount.type === 'PERCENTAGE' ? percent(postItemDiscount, Number(billDiscount.value) || 0) : Math.min(Number(billDiscount.value) || 0, postItemDiscount);
  }
  const postDiscountTotal = subtract(subtract(subtotal, itemDiscount), billDiscountAmount);
  // Allocate bill discount proportionally across lines (mirrors saleCalculationService.allocateBillDiscount).
  const preTotal = subtract(subtotal, itemDiscount);

  let taxableAmount = 0,
    cgst = 0,
    sgst = 0,
    igst = 0,
    total = 0;

  for (const l of lines) {
    const lineNet = subtract(l.baseAmount, l.discountAmount);
    const billShare = preTotal > 0 ? toRupees(Math.round((toPaise(lineNet) * toPaise(billDiscountAmount)) / toPaise(preTotal))) : 0;
    const grossAfterAllDiscount = subtract(lineNet, billShare);
    const rate = line_gst_rate(l);
    const gstAmount = pricesIncludeGST ? subtract(grossAfterAllDiscount, toRupees(Math.round((toPaise(grossAfterAllDiscount) * 10000) / (10000 + rate * 100)))) : percent(grossAfterAllDiscount, rate);
    const taxable = pricesIncludeGST ? subtract(grossAfterAllDiscount, gstAmount) : grossAfterAllDiscount;
    const lineTotal = pricesIncludeGST ? grossAfterAllDiscount : sum(taxable, gstAmount);

    taxableAmount = sum(taxableAmount, taxable);
    total = sum(total, lineTotal);
    if (taxType === 'INTER_STATE') {
      igst = sum(igst, gstAmount);
    } else {
      cgst = sum(cgst, toRupees(toPaise(gstAmount) / 2));
      sgst = sum(sgst, toRupees(toPaise(gstAmount) / 2));
    }
  }

  const { rounded: grandTotal, roundOff } = roundToWhole(total);

  return { subtotal, itemDiscount, billDiscount: billDiscountAmount, totalDiscount: sum(itemDiscount, billDiscountAmount), taxableAmount, cgst, sgst, igst, roundOff, grandTotal, taxType };

  function line_gst_rate(l) {
    return l.batch.gstRate ?? l.medicine?.gstRate ?? taxConfig?.defaultGstPercent ?? 12;
  }
}

/**
 * Queues one bill in the outbox (requirement 1/3): generates the
 * idempotencyKey + localTransactionId here, before anything leaves the
 * device, so a retry/refresh/app-restart can never double-submit it
 * (requirement 5).
 */
export async function queueOfflineSale({ saleBody, customerState, billDiscount }) {
  const deviceId = await offlineDb.getOrCreateDeviceId();
  const localTransactionId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = `offline-${deviceId}-${localTransactionId}`;
  const createdOffline = new Date().toISOString();

  const entry = {
    localTransactionId,
    idempotencyKey,
    deviceId,
    createdOffline,
    status: 'PENDING',
    saleBody: { ...saleBody, idempotencyKey, customerState },
    lastError: null,
  };
  await offlineDb.enqueueOutbox(entry);
  return entry;
}
