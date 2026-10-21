// Phase 10 — Schedule H/H1 compliance endpoints (requirement 3).
const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const SaleItem = require('../models/SaleItem');
const Sale = require('../models/Sale');
const { classifyMedicine, RESTRICTED_SCHEDULES } = require('../services/scheduleComplianceService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// GET /api/compliance/check?medicineId=...
// Used by the POS screen BEFORE a restricted item is added to the cart, so
// the cashier gets the warning up front instead of discovering it on
// checkout failure. Never auto-blocks anything by itself — enforcement
// happens server-side in saleController regardless of what this returns.
const check = asyncHandler(async (req, res) => {
  const { medicineId } = req.query;
  if (!medicineId) return sendError(res, { statusCode: 400, message: 'medicineId is required' });
  const medicine = await Medicine.findOne({ _id: medicineId, organizationId: req.organizationId });
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
  return sendSuccess(res, { data: classifyMedicine(medicine) });
});

// GET /api/compliance/restricted-medicines
const restrictedMedicines = asyncHandler(async (req, res) => {
  const medicines = await Medicine.find({ organizationId: req.organizationId, scheduleType: { $in: RESTRICTED_SCHEDULES }, isActive: true })
    .select('name medicineCode scheduleType prescriptionRequired hsnCode')
    .sort({ scheduleType: 1, name: 1 });
  return sendSuccess(res, { data: medicines });
});

// GET /api/compliance/sales-report?from=&to=&scheduleType=&medicine=&format=csv
// Dedicated compliance report: every restricted-schedule line sold, with the
// bill's doctor/prescription reference and the staff member who made the
// sale — the requirement 3/4 "sale history" + "dedicated compliance
// reports" ask.
const salesReport = asyncHandler(async (req, res) => {
  const { from, to, scheduleType, medicine, format } = req.query;

  const saleFilter = { organizationId: req.organizationId, branchId: req.branchId, status: { $ne: 'CANCELLED' } };
  if (from || to) saleFilter.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const sales = await Sale.find(saleFilter).select('saleNumber invoiceNumber saleDate customer walkInCustomerName restrictedSaleInfo createdBy').populate('customer', 'name mobile').populate('createdBy', 'name role');
  const saleById = new Map(sales.map((s) => [String(s._id), s]));
  if (sales.length === 0) return sendSuccess(res, { data: [] });

  const itemFilter = { organizationId: req.organizationId, restrictedSale: true, sale: { $in: sales.map((s) => s._id) } };
  if (scheduleType) itemFilter.scheduleTypeSnapshot = scheduleType;
  if (medicine) itemFilter.medicine = medicine;

  const items = await SaleItem.find(itemFilter).populate('medicine', 'name medicineCode');

  const rows = items
    .map((item) => {
      const sale = saleById.get(String(item.sale));
      if (!sale) return null;
      return {
        saleNumber: sale.saleNumber,
        invoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate,
        medicineName: item.medicineNameSnapshot,
        medicineCode: item.medicine?.medicineCode || null,
        scheduleType: item.scheduleTypeSnapshot,
        quantity: item.quantity,
        batchNumber: item.batchNumberSnapshot,
        customerName: sale.customer?.name || sale.walkInCustomerName || null,
        customerMobile: sale.customer?.mobile || null,
        doctorName: sale.restrictedSaleInfo?.doctorName || null,
        doctorRegistrationNo: sale.restrictedSaleInfo?.doctorRegistrationNo || null,
        prescriptionReference: sale.restrictedSaleInfo?.prescriptionReference || null,
        soldBy: sale.createdBy?.name || null,
        soldByRole: sale.createdBy?.role || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));

  if (format === 'csv') {
    const header = ['Sale No', 'Invoice No', 'Date', 'Medicine', 'Schedule', 'Qty', 'Batch', 'Customer', 'Mobile', 'Doctor', 'Doctor Reg No', 'Prescription Ref', 'Sold By', 'Role'];
    const csvRows = rows.map((r) =>
      [r.saleNumber, r.invoiceNumber, new Date(r.saleDate).toISOString(), r.medicineName, r.scheduleType, r.quantity, r.batchNumber, r.customerName, r.customerMobile, r.doctorName, r.doctorRegistrationNo, r.prescriptionReference, r.soldBy, r.soldByRole]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="schedule-compliance-report.csv"');
    return res.status(200).send(csv);
  }

  return sendSuccess(res, { data: rows });
});

module.exports = { check, restrictedMedicines, salesReport };
