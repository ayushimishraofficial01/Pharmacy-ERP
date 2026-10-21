// Phase 10 — real barcode scanner workflow (requirement 8).
// A USB barcode scanner behaves like a keyboard: it types the barcode
// digits followed by an Enter keystroke. There is nothing special for the
// backend to support about the SCANNING itself (that's a frontend input
// listener on an <input>/keydown stream) — what the backend provides is a
// single fast lookup endpoint the POS calls on every scan, resolving
// exactly the same way a keyboard-typed barcode would.
//
// Workflow this endpoint drives (POS-side):
//   scan -> GET here -> identify medicine (+ batch if resolvable)
//        -> check stock -> POS adds/increments the line in its cart
//        -> POS computes price/GST via the existing sale pricing path
//        -> checkout calls the existing POST /api/sales unchanged.
// Multiple scans of the same code and quantity-increment-on-rescan are cart
// concerns, not scan-lookup concerns, and are handled client-side against
// the medicine+batch ids this endpoint returns (same ids the cart/HoldBill
// and createSale already key off).
const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const { classifyMedicine } = require('../services/scheduleComplianceService');
const { findSubstitutes } = require('../services/substituteService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// GET /api/barcode/scan?code=...
const scan = asyncHandler(async (req, res) => {
  const { code } = req.query;
  if (!code || !String(code).trim()) return sendError(res, { statusCode: 400, message: 'code is required' });
  const barcode = String(code).trim();

  // 1) Batch-level barcode — most specific match, resolves medicine AND batch in one scan.
  const batchMatch = await Batch.findOne({ organizationId: req.organizationId, branchId: req.branchId, barcode, isActive: true }).populate('medicine');
  if (batchMatch) {
    const compliance = classifyMedicine(batchMatch.medicine);
    return sendSuccess(res, {
      data: {
        found: true,
        matchType: 'BATCH',
        medicine: batchMatch.medicine,
        batch: batchMatch,
        availableQuantity: Math.max(0, batchMatch.quantity - (batchMatch.reservedQuantity || 0)),
        sellingRate: batchMatch.sellingRate,
        mrp: batchMatch.mrp,
        gstRate: batchMatch.gstRate,
        compliance,
      },
    });
  }

  // 2) Medicine-level barcode — resolve medicine, then pick the batch POS
  // would actually sell from (FEFO: soonest expiry, in stock).
  const medicine = await Medicine.findOne({ organizationId: req.organizationId, barcode, isActive: true });
  if (medicine) {
    const fefoBatch = await Batch.findOne({ organizationId: req.organizationId, branchId: req.branchId, medicine: medicine._id, isActive: true, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
    const compliance = classifyMedicine(medicine);

    if (!fefoBatch) {
      // Known medicine, no sellable stock right now — surface substitutes
      // inline (requirement 2's "show substitute availability during
      // billing") instead of making the cashier run a second lookup.
      const subs = await findSubstitutes({ organizationId: req.organizationId, branchId: req.branchId, medicine });
      return sendSuccess(res, {
        data: { found: true, matchType: 'MEDICINE', medicine, batch: null, availableQuantity: 0, compliance, outOfStock: true, substitutes: subs.filter((s) => s.inStock).slice(0, 5) },
        message: `${medicine.name} is out of stock in this branch`,
      });
    }

    return sendSuccess(res, {
      data: {
        found: true,
        matchType: 'MEDICINE',
        medicine,
        batch: fefoBatch,
        availableQuantity: Math.max(0, fefoBatch.quantity - (fefoBatch.reservedQuantity || 0)),
        sellingRate: fefoBatch.sellingRate,
        mrp: fefoBatch.mrp,
        gstRate: fefoBatch.gstRate,
        compliance,
      },
    });
  }

  // 3) Unknown barcode — not an error; the POS shows a warning and, for
  // authorized staff, an inline "assign this barcode" action.
  return sendSuccess(res, { data: { found: false, matchType: 'UNKNOWN', scannedCode: barcode }, message: 'Unknown barcode — not linked to any medicine or batch' });
});

// POST /api/barcode/assign  { target: 'MEDICINE'|'BATCH', id, barcode }
const assignBarcode = asyncHandler(async (req, res) => {
  const { target, id, barcode } = req.body;
  if (!target || !id || !barcode) return sendError(res, { statusCode: 400, message: 'target, id and barcode are required' });
  const code = String(barcode).trim();

  if (target === 'MEDICINE') {
    const existing = await Medicine.findOne({ organizationId: req.organizationId, barcode: code, _id: { $ne: id } });
    if (existing) return sendError(res, { statusCode: 409, message: `Barcode already assigned to medicine "${existing.name}"` });
    const medicine = await Medicine.findOneAndUpdate({ _id: id, organizationId: req.organizationId }, { barcode: code, updatedBy: req.user._id }, { new: true, runValidators: true });
    if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
    await logAction({ req, action: 'BARCODE_ASSIGNED', entityType: 'Medicine', entityId: medicine._id, description: `Barcode ${code} assigned to medicine "${medicine.name}"` });
    return sendSuccess(res, { data: medicine });
  }

  if (target === 'BATCH') {
    const existing = await Batch.findOne({ branchId: req.branchId, barcode: code, _id: { $ne: id } });
    if (existing) return sendError(res, { statusCode: 409, message: `Barcode already assigned to batch "${existing.batchNumber}"` });
    const batch = await Batch.findOneAndUpdate({ _id: id, organizationId: req.organizationId, branchId: req.branchId }, { barcode: code }, { new: true, runValidators: true });
    if (!batch) return sendError(res, { statusCode: 404, message: 'Batch not found' });
    await logAction({ req, action: 'BARCODE_ASSIGNED', entityType: 'Batch', entityId: batch._id, description: `Barcode ${code} assigned to batch "${batch.batchNumber}"` });
    return sendSuccess(res, { data: batch });
  }

  return sendError(res, { statusCode: 400, message: "target must be 'MEDICINE' or 'BATCH'" });
});

module.exports = { scan, assignBarcode };
