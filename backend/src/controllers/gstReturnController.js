// Phase 11 — Feature 1: HTTP surface for the GST Return Dashboard, return
// generation/validation/export, portal submission, and filing history.
const asyncHandler = require('express-async-handler');
const XLSX = require('xlsx');
const GstFiling = require('../models/GstFiling');
const gstReturnService = require('../services/gstReturnService');
const { validateInvoiceBatch } = require('../services/gstValidationService');
const gstPortal = require('../services/gstPortalService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

function currentFinancialYear(date = new Date()) {
  // India FY: April–March. Organization.financialYearStartMonth exists for
  // this but return periods are calendar-month based regardless, so this is
  // only used to label "2026-27" on the dashboard.
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  return month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
}

// GET /api/gst-returns/dashboard?period=2026-08
const dashboard = asyncHandler(async (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const data = await gstReturnService.generateReturnData({ organizationId: req.organizationId, branchId: req.branchId, period });

  const existingFilings = await GstFiling.find({ organizationId: req.organizationId, branchId: req.branchId, period }).select('returnType status arn filedAt').lean();

  const { _invoices, _creditNotes, ...publicData } = data;
  return sendSuccess(res, {
    data: {
      ...publicData,
      financialYear: currentFinancialYear(new Date(`${period}-01`)),
      filingStatus: existingFilings,
    },
  });
});

// GET /api/gst-returns/generate?period=2026-08&returnType=GSTR-1
// Generates + validates in one call (requirements 2 and 3) — never
// silently drops an invalid invoice, always shows validation errors.
const generate = asyncHandler(async (req, res) => {
  const { period, returnType } = req.query;
  if (!period) return sendError(res, { statusCode: 400, message: 'period (YYYY-MM) is required.' });
  if (returnType && !['GSTR-1', 'GSTR-3B'].includes(returnType)) {
    return sendError(res, { statusCode: 400, message: 'returnType must be GSTR-1 or GSTR-3B.' });
  }

  const data = await gstReturnService.generateReturnData({ organizationId: req.organizationId, branchId: req.branchId, period, returnType });
  const validation = validateInvoiceBatch(data._invoices);

  return sendSuccess(res, {
    data: {
      gstin: data.gstin,
      period: data.period,
      gstr1: data.gstr1,
      gstr3b: data.gstr3b,
      validation,
    },
  });
});

// POST /api/gst-returns  { returnType, period }
// Creates/updates a DRAFT GstFiling record from currently-generated data —
// this is what the Filing History / Sync Center-style status list reads.
const createOrUpdateFiling = asyncHandler(async (req, res) => {
  const { returnType, period } = req.body;
  if (!returnType || !period) return sendError(res, { statusCode: 400, message: 'returnType and period are required.' });

  const data = await gstReturnService.generateReturnData({ organizationId: req.organizationId, branchId: req.branchId, period, returnType });
  const validation = validateInvoiceBatch(data._invoices);

  const summary = returnType === 'GSTR-1' ? data.gstr1 : data.gstr3b;

  const filing = await GstFiling.findOneAndUpdate(
    { organizationId: req.organizationId, branchId: req.branchId, returnType, period },
    {
      $set: {
        gstin: data.gstin,
        financialYear: currentFinancialYear(new Date(`${period}-01`)),
        summary,
        validationErrors: validation.errors,
        status: validation.valid ? 'VALIDATED' : 'DRAFT',
        generatedBy: req.user._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await logAction({ req, action: 'GST_RETURN_GENERATED', entityType: 'GstFiling', entityId: filing._id, description: `${returnType} for ${period} generated (${validation.valid ? 'validated' : `${validation.errors.length} validation error(s)`})` });

  return sendSuccess(res, { statusCode: 201, message: validation.valid ? 'Return generated and validated' : 'Return generated with validation errors — review before export/submission', data: { filing, validation } });
});

// GET /api/gst-returns/:id/export?format=JSON|EXCEL|CSV
const exportFiling = asyncHandler(async (req, res) => {
  const filing = await GstFiling.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!filing) return sendError(res, { statusCode: 404, message: 'Filing not found' });

  const format = (req.query.format || 'JSON').toUpperCase();
  if (!['JSON', 'EXCEL', 'CSV'].includes(format)) return sendError(res, { statusCode: 400, message: 'format must be JSON, EXCEL, or CSV.' });

  filing.exportHistory.push({ format, exportedAt: new Date(), exportedBy: req.user._id });
  if (filing.status === 'VALIDATED') filing.status = 'EXPORTED';
  await filing.save();

  await logAction({ req, action: 'GST_RETURN_EXPORTED', entityType: 'GstFiling', entityId: filing._id, description: `${filing.returnType} for ${filing.period} exported as ${format}` });

  if (format === 'JSON') {
    return sendSuccess(res, { data: { filing } });
  }

  // EXCEL / CSV — flatten whichever summary shape this filing holds into rows.
  const rows =
    filing.returnType === 'GSTR-1'
      ? (filing.summary?.b2b || []).map((inv) => ({ InvoiceNumber: inv.invoiceNumber, InvoiceDate: inv.invoiceDate, BuyerGSTIN: inv.buyerGstin, PlaceOfSupply: inv.placeOfSupply, TaxableAmount: inv.taxableAmount, CGST: inv.cgst, SGST: inv.sgst, IGST: inv.igst }))
      : [
          { Field: 'Outward Taxable Amount', Value: filing.summary?.outwardSupplies?.taxableAmount },
          { Field: 'Output CGST', Value: filing.summary?.outwardSupplies?.cgst },
          { Field: 'Output SGST', Value: filing.summary?.outwardSupplies?.sgst },
          { Field: 'Output IGST', Value: filing.summary?.outwardSupplies?.igst },
          { Field: 'Input Tax Credit (Total)', Value: filing.summary?.inputTaxCredit?.total },
          { Field: 'Net GST Payable', Value: filing.summary?.netGstPayable },
        ];

  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, filing.returnType);

  const fileName = `${filing.returnType}-${filing.period}.${format === 'EXCEL' ? 'xlsx' : 'csv'}`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  if (format === 'CSV') {
    res.setHeader('Content-Type', 'text/csv');
    return res.send(XLSX.utils.sheet_to_csv(worksheet));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return res.send(buffer);
});

// POST /api/gst-returns/:id/submit — portal submission. Never fabricates
// success (see gstPortalService.js header comment).
const submitFiling = asyncHandler(async (req, res) => {
  const filing = await GstFiling.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!filing) return sendError(res, { statusCode: 404, message: 'Filing not found' });

  try {
    await gstPortal.submitReturn(filing);
    // Unreachable until a real GSP is wired in (submitReturn always throws
    // first) — kept so the success path is correct once it is implemented.
    filing.status = 'SUBMITTED';
    filing.submittedAt = new Date();
    await filing.save();
    return sendSuccess(res, { message: 'Submitted to GST portal', data: { filing } });
  } catch (err) {
    filing.status = 'FAILED';
    filing.errorMessage = err.message;
    filing.retryCount += 1;
    await filing.save();
    await logAction({ req, action: 'GST_RETURN_SUBMIT_FAILED', entityType: 'GstFiling', entityId: filing._id, description: err.message });
    return sendError(res, { statusCode: err.statusCode || 502, message: err.message, errors: gstPortal.configStatus() });
  }
});

// GET /api/gst-returns/portal-status
const portalStatus = asyncHandler(async (req, res) => sendSuccess(res, { data: gstPortal.configStatus() }));

// GET /api/gst-returns  (Filing History — requirement 6)
const list = asyncHandler(async (req, res) => {
  const { returnType, period, status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (returnType) filter.returnType = returnType;
  if (period) filter.period = period;
  if (status) filter.status = status;
  const filings = await GstFiling.find(filter).populate('generatedBy', 'name').populate('filedBy', 'name').sort({ period: -1, createdAt: -1 });
  return sendSuccess(res, { data: filings });
});

const getOne = asyncHandler(async (req, res) => {
  const filing = await GstFiling.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId }).populate('generatedBy', 'name').populate('filedBy', 'name');
  if (!filing) return sendError(res, { statusCode: 404, message: 'Filing not found' });
  return sendSuccess(res, { data: filing });
});

module.exports = { dashboard, generate, createOrUpdateFiling, exportFiling, submitFiling, portalStatus, list, getOne };
