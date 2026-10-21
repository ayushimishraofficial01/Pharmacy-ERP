// Phase 10 — Schedule H / H1 / narcotic sale compliance (requirement 3).
// Pure classification logic lives here (no DB, no req/res) so it's testable
// the same way gstCalculationService/saleCalculationService are, and so
// saleController and complianceController share exactly one definition of
// "what counts as a restricted sale" instead of two drifting copies.
const { SCHEDULE_TYPES } = require('../constants/medicineSchedules');

// Schedules that trigger extra compliance requirements at the point of sale.
// NONE/OTC/G are freely sellable; H/H1/X require prescription + reference
// info. X (narcotic/controlled) additionally feeds the dedicated
// controlled-drug register — that register itself is a separate Phase 10
// item, not built in this pass, but the classification here is what it will
// key off of.
const RESTRICTED_SCHEDULES = ['H', 'H1', 'X'];

// Phase 10 (requirement 4): only 'X' (narcotic/controlled) feeds the
// dedicated controlled-drug register — H/H1 get the lighter compliance
// handling above (prescription + doctor reference) but not a running
// purchase/sale/balance ledger.
function requiresControlledRegister(scheduleType) {
  return scheduleType === 'X';
}

function isRestrictedSchedule(scheduleType) {
  return RESTRICTED_SCHEDULES.includes(scheduleType);
}

/**
 * Classify a single medicine for POS-time warning/enforcement purposes.
 * medicine: a Medicine doc or plain object with { scheduleType, prescriptionRequired, name }.
 */
function classifyMedicine(medicine) {
  const scheduleType = SCHEDULE_TYPES.includes(medicine?.scheduleType) ? medicine.scheduleType : 'NONE';
  const restricted = isRestrictedSchedule(scheduleType);
  let message = null;
  if (scheduleType === 'H1') message = `${medicine?.name || 'This medicine'} is Schedule H1 — a valid prescription reference is mandatory and this sale will be recorded in the compliance register.`;
  else if (scheduleType === 'X') message = `${medicine?.name || 'This medicine'} is a controlled/narcotic drug — a valid prescription reference is mandatory and this sale must be recorded in the controlled-drug register.`;
  else if (scheduleType === 'H') message = `${medicine?.name || 'This medicine'} is Schedule H — a valid prescription reference is required before this sale can be completed.`;
  else if (medicine?.prescriptionRequired) message = `${medicine?.name || 'This medicine'} requires prescription verification.`;

  return {
    scheduleType,
    restricted,
    requiresPrescription: restricted || !!medicine?.prescriptionRequired,
    message,
  };
}

/**
 * Validate that the sale-level restrictedSaleInfo the caller supplied is
 * complete enough to satisfy at least one restricted line item. Returns
 * { valid, reason }. Does not touch the DB — the caller is responsible for
 * validating that a `doctor` id (if given) actually exists.
 */
function validateRestrictedSaleInfo(info) {
  if (!info) return { valid: false, reason: 'Prescription/doctor reference is required for a restricted-schedule sale' };
  const hasDoctorRef = !!(info.doctor || (info.doctorName && info.doctorName.trim()));
  const hasPrescriptionRef = !!(info.prescriptionReference && String(info.prescriptionReference).trim()) || !!info.prescription;
  if (!hasDoctorRef) return { valid: false, reason: 'Doctor name or doctor reference is required for a restricted-schedule sale' };
  if (!hasPrescriptionRef) return { valid: false, reason: 'A prescription reference (number or linked prescription) is required for a restricted-schedule sale' };
  return { valid: true, reason: null };
}

module.exports = { RESTRICTED_SCHEDULES, isRestrictedSchedule, requiresControlledRegister, classifyMedicine, validateRestrictedSaleInfo };
