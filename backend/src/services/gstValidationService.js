// Phase 11 — Feature 1, requirement 3 (GST Validation). Pure functions —
// takes plain invoice-shaped objects (already fetched from Sale/SaleItem by
// gstReturnService) and returns validation errors, same "no DB, no
// hardcoding" discipline as gstCalculationService.js. Never silently drops
// an invalid record — the caller (gstReturnController) is expected to show
// every error returned here.
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

function isValidGstin(gstin) {
  return typeof gstin === 'string' && GSTIN_REGEX.test(gstin.trim());
}

/**
 * invoice shape (built by gstReturnService.buildOutwardSupplyInvoices):
 * {
 *   invoiceNumber, invoiceDate, sellerGstin, buyerGstin (nullable for B2C),
 *   placeOfSupply (state name/code), taxableAmount, cgst, sgst, igst,
 *   items: [{ hsnCode, taxableAmount, gstRate, cgst, sgst, igst }]
 * }
 */
function validateInvoice(invoice) {
  const errors = [];
  const push = (field, message) => errors.push({ invoiceNumber: invoice.invoiceNumber || '(unknown)', field, message });

  if (!invoice.invoiceNumber) push('invoiceNumber', 'Invoice number is missing.');
  if (!invoice.invoiceDate) push('invoiceDate', `Invoice ${invoice.invoiceNumber} is missing an invoice date.`);
  if (!invoice.sellerGstin || !isValidGstin(invoice.sellerGstin)) {
    push('sellerGstin', `Invoice ${invoice.invoiceNumber} cannot be included because the seller GSTIN is missing or invalid.`);
  }
  if (invoice.buyerGstin && !isValidGstin(invoice.buyerGstin)) {
    push('buyerGstin', `Invoice ${invoice.invoiceNumber} cannot be included because the customer GSTIN "${invoice.buyerGstin}" is invalid.`);
  }
  if (!invoice.placeOfSupply) {
    push('placeOfSupply', `Invoice ${invoice.invoiceNumber} is missing place of supply.`);
  }
  if (invoice.taxableAmount === undefined || invoice.taxableAmount === null || Number.isNaN(Number(invoice.taxableAmount))) {
    push('taxableAmount', `Invoice ${invoice.invoiceNumber} has an invalid taxable amount.`);
  }
  if ([invoice.cgst, invoice.sgst, invoice.igst].some((v) => v === undefined || v === null || Number.isNaN(Number(v)))) {
    push('gst', `Invoice ${invoice.invoiceNumber} is missing CGST/SGST/IGST values.`);
  }
  if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
    push('items', `Invoice ${invoice.invoiceNumber} has no line items.`);
  } else {
    invoice.items.forEach((item, idx) => {
      if (!item.hsnCode) push('hsnCode', `Invoice ${invoice.invoiceNumber}, line ${idx + 1}: HSN code is missing.`);
      if (item.taxableAmount === undefined || item.taxableAmount === null) {
        push('itemTaxableAmount', `Invoice ${invoice.invoiceNumber}, line ${idx + 1}: taxable amount is missing.`);
      }
    });
  }

  return errors;
}

/** Runs validateInvoice across a batch and also flags duplicate invoice numbers within the batch. */
function validateInvoiceBatch(invoices) {
  const errors = [];
  const seen = new Map();

  for (const invoice of invoices) {
    errors.push(...validateInvoice(invoice));
    const key = invoice.invoiceNumber;
    if (key) {
      if (seen.has(key)) {
        errors.push({ invoiceNumber: key, field: 'invoiceNumber', message: `Duplicate invoice number "${key}" found — each GST return invoice number must be unique.` });
      }
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }

  const validInvoiceNumbers = new Set(invoices.map((i) => i.invoiceNumber));
  const invalidInvoiceNumbers = new Set(errors.map((e) => e.invoiceNumber));
  const validCount = [...validInvoiceNumbers].filter((n) => !invalidInvoiceNumbers.has(n)).length;

  return {
    valid: errors.length === 0,
    errors,
    totalInvoices: invoices.length,
    validInvoiceCount: validCount,
    invalidInvoiceCount: invalidInvoiceNumbers.size,
  };
}

module.exports = { isValidGstin, validateInvoice, validateInvoiceBatch };
