// Phase 10 — HSN/GST master lookup (requirement 9).
// resolveRateForDate is a pure function (no DB, no Mongoose import) so it
// can be unit tested with zero DB/network setup, same as
// gstCalculationService/saleCalculationService already are. The DB-backed
// getEffectiveGstRate below requires the model lazily (inside the function)
// so simply requiring this file for the pure function doesn't pull Mongoose in.

/**
 * Given an HSN master doc (or plain object with the same shape) and a target
 * date, return the GST rate that was actually in effect on that date —
 * walking rateHistory rather than trusting the current `gstRate` field,
 * because that field only reflects "now".
 */
function resolveRateForDate(hsnDoc, date = new Date()) {
  if (!hsnDoc) return null;
  const targetTime = new Date(date).getTime();

  const entries = [
    { gstRate: hsnDoc.gstRate, effectiveFrom: hsnDoc.effectiveDate },
    ...(hsnDoc.rateHistory || []),
  ]
    .filter((e) => e.effectiveFrom && new Date(e.effectiveFrom).getTime() <= targetTime)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

  return entries.length ? entries[0].gstRate : null;
}

/** DB-backed lookup used by controllers/services that need "the rate for this HSN, right now (or on some date)". */
async function getEffectiveGstRate({ organizationId, hsnCode, date = new Date() }) {
  if (!hsnCode) return null;
  const HsnMaster = require('../models/HsnMaster');
  const hsn = await HsnMaster.findOne({ organizationId, hsnCode: String(hsnCode).trim().toUpperCase(), isActive: true });
  if (!hsn) return null;
  return resolveRateForDate(hsn, date);
}

module.exports = { resolveRateForDate, getEffectiveGstRate };
