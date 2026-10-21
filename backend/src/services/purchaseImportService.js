// Phase 10 — Excel/CSV purchase import orchestration (requirement 12).
// Full workflow: upload -> validate -> map columns -> map medicines -> map
// supplier -> validate batch -> validate GST/HSN -> preview -> detect
// duplicates -> confirm import -> create purchase -> update inventory.
// The last two steps reuse purchaseCreationService (the exact same atomic
// workflow the manual "create purchase" endpoint uses) rather than
// duplicating stock/ledger logic.
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const { getEffectiveGstRate } = require('./hsnLookupService');
const { escapeRegex, mapRow, validateMappedRow } = require('./importValidationHelpers');
const { createPurchase } = require('./purchaseCreationService');

/**
 * Validates every row and resolves each to a real Medicine document.
 * DB-touching (medicine lookup, HSN rate lookup) — the row-shape validation
 * itself is delegated to the pure validateMappedRow.
 */
async function validateAndResolveRows({ organizationId, rows, columnMapping, createMissingMedicines }) {
  const validRows = [];
  const errorRows = [];
  const warnings = [];
  const seenKeys = new Set(); // medicineName|batchNumber, for in-file duplicate detection

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2; // header is row 1
    const mapped = mapRow(rows[i], columnMapping);
    const { errors, parsed } = validateMappedRow(mapped);

    if (errors.length > 0) {
      errorRows.push({ rowNumber, errors, raw: rows[i] });
      continue;
    }

    // Duplicate detection within the file (requirement 12's "detect duplicates").
    const dupKey = `${parsed.medicineName.toLowerCase()}|${parsed.batchNumber.toLowerCase()}`;
    if (seenKeys.has(dupKey)) {
      errorRows.push({ rowNumber, errors: [`Duplicate row: "${parsed.medicineName}" batch "${parsed.batchNumber}" already appears earlier in this file`], raw: rows[i] });
      continue;
    }
    seenKeys.add(dupKey);

    // Map medicine: by code first if given, else exact case-insensitive name match.
    let medicine = null;
    if (parsed.medicineCode) {
      medicine = await Medicine.findOne({ organizationId, medicineCode: parsed.medicineCode, isActive: true });
    }
    if (!medicine) {
      medicine = await Medicine.findOne({ organizationId, name: new RegExp(`^${escapeRegex(parsed.medicineName)}$`, 'i'), isActive: true });
    }
    if (!medicine) {
      if (!createMissingMedicines) {
        errorRows.push({ rowNumber, errors: [`Medicine not found in master data: "${parsed.medicineName}"${parsed.medicineCode ? ` (code ${parsed.medicineCode})` : ''} — add it first, or re-run with createMissingMedicines`], raw: rows[i] });
        continue;
      }
      // Explicit opt-in only — never silently invents master data otherwise.
      const seq = await Counter.nextSequence(organizationId, 'MEDICINE');
      medicine = await Medicine.create({
        organizationId,
        medicineCode: `MED-${String(seq).padStart(6, '0')}`,
        name: parsed.medicineName,
        hsnCode: parsed.hsnCode || '',
        gstRate: parsed.gstRate ?? 12,
      });
      warnings.push({ rowNumber, warnings: [`Created new medicine master entry for "${parsed.medicineName}" — review its details (category, schedule type, etc.)`] });
    }

    // Validate/derive GST rate against the HSN master (requirement 12's "validate GST/HSN").
    let gstRate = parsed.gstRate;
    const hsnCode = parsed.hsnCode || medicine.hsnCode;
    if (hsnCode) {
      const masterRate = await getEffectiveGstRate({ organizationId, hsnCode });
      if (masterRate !== null) {
        if (gstRate !== undefined && gstRate !== masterRate) {
          warnings.push({ rowNumber, warnings: [`GST rate in file (${gstRate}%) differs from HSN master rate for ${hsnCode} (${masterRate}%) — using the HSN master rate`] });
        }
        gstRate = masterRate;
      }
    }
    if (gstRate === undefined) gstRate = medicine.gstRate;

    validRows.push({
      rowNumber,
      medicine: medicine._id,
      medicineName: medicine.name,
      batchNumber: parsed.batchNumber,
      expiryDate: parsed.expiryDate,
      manufacturingDate: parsed.manufacturingDate,
      quantity: parsed.quantity,
      freeQuantity: parsed.freeQuantity,
      purchaseRate: parsed.purchaseRate,
      mrp: parsed.mrp,
      sellingRate: parsed.sellingRate,
      gstRate,
    });
  }

  return {
    validRows,
    errorRows,
    warnings,
    summary: { totalRows: rows.length, validCount: validRows.length, errorCount: errorRows.length, warningCount: warnings.length },
  };
}

/** Preview only — no DB writes beyond medicine lookups (and optional medicine auto-creation, which is itself an explicit opt-in). */
async function previewImport({ organizationId, rows, columnMapping, createMissingMedicines }) {
  return validateAndResolveRows({ organizationId, rows, columnMapping, createMissingMedicines });
}

/**
 * Re-validates (never trusts a client-echoed "already validated" claim) and,
 * if any rows are valid, creates ONE purchase containing all valid rows via
 * the shared purchaseCreationService — same stock update, same GST calc,
 * same controlled-drug register / supplier ledger hooks a manual purchase
 * gets. Invalid rows are reported but do not block the valid ones.
 */
async function confirmImport({ organizationId, branchId, userId, rows, columnMapping, createMissingMedicines, supplier, invoiceNumber, invoiceDate, purchaseType, paidAmount, distributorOrder }) {
  const { validRows, errorRows, warnings, summary } = await validateAndResolveRows({ organizationId, rows, columnMapping, createMissingMedicines });

  if (validRows.length === 0) {
    throw Object.assign(new Error('No valid rows to import — see errorRows for details'), { statusCode: 400 });
  }

  const items = validRows.map((r) => ({
    medicine: r.medicine,
    batchNumber: r.batchNumber,
    expiryDate: r.expiryDate,
    manufacturingDate: r.manufacturingDate,
    quantity: r.quantity,
    freeQuantity: r.freeQuantity,
    purchaseRate: r.purchaseRate,
    mrp: r.mrp,
    sellingRate: r.sellingRate,
    gstRate: r.gstRate,
  }));

  const purchase = await createPurchase({
    organizationId,
    branchId,
    userId,
    body: { supplier, invoiceNumber, invoiceDate, purchaseType, paidAmount, distributorOrder, notes: `Imported from Excel/CSV (${summary.validCount}/${summary.totalRows} rows)`, items },
  });

  return { purchase, importedRowCount: validRows.length, errorRows, warnings, summary };
}

module.exports = { validateAndResolveRows, previewImport, confirmImport };
