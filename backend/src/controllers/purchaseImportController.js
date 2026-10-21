// Phase 10 — Excel/CSV purchase import endpoints (requirement 12).
const asyncHandler = require('express-async-handler');
const { parseTabularFile } = require('../services/fileParsingService');
const { previewImport, confirmImport } = require('../services/purchaseImportService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

function parseColumnMapping(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return null;
  }
}

// POST /api/purchase-import/headers  (multipart: file)
// Step 1: upload -> returns headers + a few sample rows so the caller can
// build a column mapping (requirement 12's "map columns").
const headers = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, { statusCode: 400, message: 'file is required (multipart field "file")' });
  try {
    const { headers: fileHeaders, rows } = parseTabularFile(req.file.buffer, req.file.originalname);
    return sendSuccess(res, { data: { headers: fileHeaders, sampleRows: rows.slice(0, 5), totalRows: rows.length } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

// POST /api/purchase-import/preview  (multipart: file, fields: columnMapping (JSON string), createMissingMedicines?)
// Step 2: validate -> map medicines -> validate batch/GST/HSN -> detect
// duplicates -> preview, WITHOUT writing a purchase.
const preview = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, { statusCode: 400, message: 'file is required (multipart field "file")' });
  const columnMapping = parseColumnMapping(req.body.columnMapping);
  if (!columnMapping) return sendError(res, { statusCode: 400, message: 'columnMapping is required and must be valid JSON, e.g. {"medicineName":"Product Name","batchNumber":"Batch",...}' });

  try {
    const { rows } = parseTabularFile(req.file.buffer, req.file.originalname);
    const result = await previewImport({
      organizationId: req.organizationId,
      rows,
      columnMapping,
      createMissingMedicines: req.body.createMissingMedicines === 'true' || req.body.createMissingMedicines === true,
    });
    return sendSuccess(res, { data: result });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

// POST /api/purchase-import/confirm  (multipart: file, fields: columnMapping, supplier, invoiceNumber, invoiceDate, purchaseType, paidAmount?, createMissingMedicines?, distributorOrder?)
// Step 3: confirm import -> create purchase -> update inventory. Re-validates
// server-side rather than trusting a prior preview response.
const confirm = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, { statusCode: 400, message: 'file is required (multipart field "file")' });
  const columnMapping = parseColumnMapping(req.body.columnMapping);
  if (!columnMapping) return sendError(res, { statusCode: 400, message: 'columnMapping is required and must be valid JSON' });
  const { supplier, invoiceNumber, invoiceDate, purchaseType, paidAmount, distributorOrder } = req.body;
  if (!supplier || !invoiceNumber || !invoiceDate || !purchaseType) {
    return sendError(res, { statusCode: 400, message: 'supplier, invoiceNumber, invoiceDate and purchaseType are required' });
  }

  try {
    const { rows } = parseTabularFile(req.file.buffer, req.file.originalname);
    const result = await confirmImport({
      organizationId: req.organizationId,
      branchId: req.branchId,
      userId: req.user._id,
      rows,
      columnMapping,
      createMissingMedicines: req.body.createMissingMedicines === 'true' || req.body.createMissingMedicines === true,
      supplier,
      invoiceNumber,
      invoiceDate,
      purchaseType,
      paidAmount: paidAmount !== undefined ? Number(paidAmount) : undefined,
      distributorOrder: distributorOrder || null,
    });

    await logAction({
      req,
      action: 'PURCHASE_IMPORTED',
      entityType: 'Purchase',
      entityId: result.purchase._id,
      description: `Purchase ${result.purchase.purchaseNumber} imported from "${req.file.originalname}" (${result.importedRowCount}/${result.summary.totalRows} rows, ${result.errorRows.length} error row(s))`,
    });

    return sendSuccess(res, { statusCode: 201, data: result, message: `Imported ${result.importedRowCount} of ${result.summary.totalRows} rows` });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { headers, preview, confirm };
