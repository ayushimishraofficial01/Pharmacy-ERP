const asyncHandler = require('express-async-handler');
const { buildInvoiceData } = require('../services/invoiceService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// GET /api/sales/:saleId/invoice
// Returns the full print-ready invoice view model — the frontend's
// InvoicePrint page renders this directly (thermal/A4/A5 CSS, see
// frontend/src/pages/InvoicePrint.jsx).
const getInvoice = asyncHandler(async (req, res) => {
  try {
    const data = await buildInvoiceData({ organizationId: req.organizationId, saleId: req.params.saleId });
    return sendSuccess(res, { data });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { getInvoice };
