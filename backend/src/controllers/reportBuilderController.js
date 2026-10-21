// Phase 10 — report builder endpoints (requirement 19).
const asyncHandler = require('express-async-handler');
const { runSalesReport } = require('../services/reportBuilderService');
const { toCsv, toXlsxBuffer } = require('../services/tabularExportService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const SALES_TABLE_COLUMNS = [
  { key: 'saleNumber', label: 'Sale No' },
  { key: 'invoiceNumber', label: 'Invoice No' },
  { key: 'saleDate', label: 'Date' },
  { key: 'customerName', label: 'Customer' },
  { key: 'doctorName', label: 'Doctor' },
  { key: 'medicineName', label: 'Medicine' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'quantity', label: 'Qty' },
  { key: 'taxableAmount', label: 'Taxable Amount' },
  { key: 'totalAmount', label: 'Total Amount' },
];
const SALES_SUMMARY_COLUMNS = [
  { key: 'medicineName', label: 'Medicine' },
  { key: 'quantitySold', label: 'Qty Sold' },
  { key: 'taxableValue', label: 'Taxable Value' },
  { key: 'salesValue', label: 'Sales Value' },
];

// GET /api/reports/sales?from=&to=&medicine=&supplier=&manufacturer=&customer=&doctor=&paymentMode=&view=table|summary&format=json|csv|xlsx
const salesReport = asyncHandler(async (req, res) => {
  const { from, to, medicine, supplier, manufacturer, customer, doctor, paymentMode, view, format } = req.query;
  const resolvedView = view === 'summary' ? 'summary' : 'table';

  const result = await runSalesReport({
    organizationId: req.organizationId,
    branchId: req.branchId,
    filters: { from, to, medicine, supplier, manufacturer, customer, doctor, paymentMode },
    view: resolvedView,
  });

  const columns = resolvedView === 'summary' ? SALES_SUMMARY_COLUMNS : SALES_TABLE_COLUMNS;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${resolvedView}.csv"`);
    return res.status(200).send(toCsv(result.rows, columns));
  }
  if (format === 'xlsx') {
    try {
      const buffer = toXlsxBuffer(result.rows, columns, 'Sales Report');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${resolvedView}.xlsx"`);
      return res.status(200).send(buffer);
    } catch (err) {
      return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
    }
  }

  return sendSuccess(res, { data: result });
});

module.exports = { salesReport };
