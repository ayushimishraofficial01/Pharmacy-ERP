// Phase 10 — doctor commission calculation (requirement 6).
// computeCommissionAmount is pure (no DB, no top-level Mongoose import) so
// it's unit-testable the same way gstCalculationService/saleCalculationService
// are. Everything that needs the DB requires the models lazily inside the
// function that uses them.

/**
 * PERCENTAGE: commissionValue% of saleAmount (the line's taxable amount).
 * FIXED_AMOUNT: commissionValue per unit sold.
 */
function computeCommissionAmount(rule, { saleAmount, quantity }) {
  if (!rule) return 0;
  if (rule.commissionType === 'PERCENTAGE') return Math.round(((saleAmount * rule.commissionValue) / 100) * 100) / 100;
  if (rule.commissionType === 'FIXED_AMOUNT') return Math.round(rule.commissionValue * quantity * 100) / 100;
  return 0;
}

/**
 * Find the single most-specific active rule for a doctor+medicine on a
 * given date, in this priority order (most specific first):
 *   1. doctor + medicine
 *   2. doctor + category
 *   3. doctor + manufacturer
 *   4. doctor (no product scope — doctor's flat default)
 *   5. org-wide (doctor: null) + medicine
 *   6. org-wide + category
 *   7. org-wide + manufacturer
 *   8. org-wide flat default
 * Only rules active and within [effectiveFrom, effectiveTo] on `date` are considered.
 */
async function resolveCommissionRule({ organizationId, branchId, doctorId, medicine, date = new Date() }) {
  const DoctorCommissionRule = require('../models/DoctorCommissionRule');
  const dateFilter = { effectiveFrom: { $lte: date }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }] };
  const branchFilter = { $or: [{ branchId: null }, { branchId }] };

  const candidateSpecs = [
    { doctor: doctorId, medicine: medicine._id },
    { doctor: doctorId, category: medicine.category || null, medicine: null },
    { doctor: doctorId, manufacturer: medicine.manufacturer || null, medicine: null, category: null },
    { doctor: doctorId, medicine: null, category: null, manufacturer: null },
    { doctor: null, medicine: medicine._id },
    { doctor: null, category: medicine.category || null, medicine: null },
    { doctor: null, manufacturer: medicine.manufacturer || null, medicine: null, category: null },
    { doctor: null, medicine: null, category: null, manufacturer: null },
  ];

  for (const spec of candidateSpecs) {
    // Skip specs that need a category/manufacturer the medicine doesn't have
    // — no point querying a rule keyed on a field that's null for this item.
    if (spec.category !== undefined && spec.category === null && (spec === candidateSpecs[1] || spec === candidateSpecs[5]) && !medicine.category) continue;
    if (spec.manufacturer !== undefined && spec.manufacturer === null && (spec === candidateSpecs[2] || spec === candidateSpecs[6]) && !medicine.manufacturer) continue;

    const rule = await DoctorCommissionRule.findOne({ organizationId, isActive: true, ...branchFilter, ...dateFilter, ...spec });
    if (rule) return rule;
  }
  return null;
}

/**
 * Record one commission ledger entry for a sale line item, if an applicable
 * rule exists. Returns null (no-op) when no rule matches — commission is
 * opt-in per configuration, never assumed.
 */
async function recordCommissionForSaleItem({ organizationId, branchId, doctorId, sale, saleItem, medicine, session }) {
  const DoctorCommissionLedger = require('../models/DoctorCommissionLedger');
  const rule = await resolveCommissionRule({ organizationId, branchId, doctorId, medicine, date: sale.saleDate });
  if (!rule) return null;

  const saleAmount = saleItem.taxableAmount;
  const commissionAmount = computeCommissionAmount(rule, { saleAmount, quantity: saleItem.quantity });
  if (commissionAmount <= 0) return null;

  const [entry] = await DoctorCommissionLedger.create(
    [
      {
        organizationId,
        branchId,
        doctor: doctorId,
        sale: sale._id,
        saleItem: saleItem._id,
        medicine: medicine._id,
        manufacturer: medicine.manufacturer || null,
        saleDate: sale.saleDate,
        quantity: saleItem.quantity,
        saleAmount,
        commissionRule: rule._id,
        commissionType: rule.commissionType,
        commissionValue: rule.commissionValue,
        commissionAmount,
      },
    ],
    { session }
  );
  return entry;
}

module.exports = { computeCommissionAmount, resolveCommissionRule, recordCommissionForSaleItem };
