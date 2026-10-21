// Phase 10 — salt/composition-based substitute lookup (requirement 2).
// Never used to auto-swap a medicine in a sale — this only ever returns
// information for a human (pharmacist/cashier) to decide on.
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const { normalizeSaltComposition } = require('./saltCompositionService');

/**
 * Find active medicines in the same organization that share the exact same
 * normalized salt/ingredient set as the given medicine (excluding itself),
 * with live stock + the price of its soonest-to-expire in-stock batch
 * (FEFO — the same batch POS would actually sell from).
 */
async function findSubstitutes({ organizationId, branchId, medicine }) {
  const normalized = medicine.saltCompositionNormalized?.length ? medicine.saltCompositionNormalized : normalizeSaltComposition(medicine.saltComposition);
  if (!normalized.length) return [];

  const candidates = await Medicine.find({
    organizationId,
    _id: { $ne: medicine._id },
    isActive: true,
    saltCompositionNormalized: normalized,
  })
    .populate('manufacturer', 'name')
    .populate('category', 'name')
    .sort({ name: 1 });

  if (candidates.length === 0) return [];

  const batchesByMedicine = branchId
    ? await Batch.find({
        organizationId,
        branchId,
        medicine: { $in: candidates.map((c) => c._id) },
        isActive: true,
        quantity: { $gt: 0 },
      }).sort({ expiryDate: 1 })
    : [];

  const firstBatchFor = (medicineId) => batchesByMedicine.find((b) => String(b.medicine) === String(medicineId));

  return candidates.map((c) => {
    const batch = firstBatchFor(c._id);
    const currentStock = batchesByMedicine.filter((b) => String(b.medicine) === String(c._id)).reduce((sum, b) => sum + (b.quantity - (b.reservedQuantity || 0)), 0);
    return {
      medicineId: c._id,
      name: c.name,
      medicineCode: c.medicineCode,
      brandName: c.brandName,
      manufacturer: c.manufacturer?.name || null,
      category: c.category?.name || null,
      dosageForm: c.dosageForm,
      strength: c.strength,
      packSize: c.packSize,
      scheduleType: c.scheduleType,
      prescriptionRequired: c.prescriptionRequired,
      availableStock: branchId ? currentStock : null,
      mrp: batch?.mrp ?? null,
      sellingRate: batch?.sellingRate ?? null,
      inStock: !!batch,
    };
  });
}

module.exports = { findSubstitutes };
