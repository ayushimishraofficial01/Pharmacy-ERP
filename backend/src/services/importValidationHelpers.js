// Phase 10 — pure parsing/validation helpers for the Excel/CSV purchase
// import (requirement 12). No DB, no file I/O — unit-testable the same way
// gstCalculationService/saleCalculationService are.

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Coerces a spreadsheet cell to a number. Returns null (not NaN/0) when it isn't a usable number, so callers can tell "missing" from "zero". */
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Parses common spreadsheet date formats (Excel serial via cellDates, ISO, DD/MM/YYYY, DD-MM-YYYY, MM/YYYY). Returns null on failure. */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const str = String(value).trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // MM/YYYY — common for medicine expiry printed as month/year only; treat as the last day of that month.
  const my = str.match(/^(\d{1,2})[/-](\d{4})$/);
  if (my) {
    const [, m, y] = my;
    const date = new Date(Date.UTC(Number(y), Number(m), 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Applies a { targetField: sourceHeader } column mapping to one parsed spreadsheet row. */
function mapRow(row, columnMapping) {
  const mapped = {};
  for (const [targetField, sourceHeader] of Object.entries(columnMapping)) {
    if (!sourceHeader) continue;
    mapped[targetField] = row[sourceHeader];
  }
  return mapped;
}

const REQUIRED_FIELDS = ['medicineName', 'batchNumber', 'expiryDate', 'quantity', 'purchaseRate', 'mrp', 'sellingRate'];

/**
 * Validates and type-coerces ONE mapped row. Does not touch the DB (medicine
 * resolution/HSN lookup/duplicate detection happen in purchaseImportService,
 * which does need the DB) — this only checks the row is well-formed.
 */
function validateMappedRow(mapped) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (mapped[field] === undefined || mapped[field] === null || String(mapped[field]).trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const quantity = parseNumber(mapped.quantity);
  if (mapped.quantity !== undefined && (quantity === null || quantity <= 0)) errors.push('quantity must be a positive number');

  const purchaseRate = parseNumber(mapped.purchaseRate);
  if (mapped.purchaseRate !== undefined && (purchaseRate === null || purchaseRate < 0)) errors.push('purchaseRate must be a non-negative number');

  const mrp = parseNumber(mapped.mrp);
  if (mapped.mrp !== undefined && (mrp === null || mrp < 0)) errors.push('mrp must be a non-negative number');

  const sellingRate = parseNumber(mapped.sellingRate);
  if (mapped.sellingRate !== undefined && (sellingRate === null || sellingRate < 0)) errors.push('sellingRate must be a non-negative number');

  const expiryDate = parseDate(mapped.expiryDate);
  if (mapped.expiryDate !== undefined && !expiryDate) errors.push(`Unrecognized expiryDate format: "${mapped.expiryDate}"`);

  const freeQuantity = mapped.freeQuantity !== undefined ? parseNumber(mapped.freeQuantity) : 0;
  const gstRate = mapped.gstRate !== undefined ? parseNumber(mapped.gstRate) : undefined;
  const manufacturingDate = mapped.manufacturingDate !== undefined ? parseDate(mapped.manufacturingDate) : undefined;

  return {
    errors,
    parsed: {
      medicineName: mapped.medicineName ? String(mapped.medicineName).trim() : null,
      medicineCode: mapped.medicineCode ? String(mapped.medicineCode).trim() : null,
      batchNumber: mapped.batchNumber ? String(mapped.batchNumber).trim() : null,
      hsnCode: mapped.hsnCode ? String(mapped.hsnCode).trim() : null,
      expiryDate,
      manufacturingDate: manufacturingDate || undefined,
      quantity,
      freeQuantity: freeQuantity || 0,
      purchaseRate,
      mrp,
      sellingRate,
      gstRate: gstRate === null ? undefined : gstRate,
    },
  };
}

module.exports = { escapeRegex, parseNumber, parseDate, mapRow, validateMappedRow, REQUIRED_FIELDS };
