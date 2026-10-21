// Phase 10 — advanced report builder (requirement 19). A flexible,
// filterable report engine rather than a fixed catalog of canned reports.
// This pass wires up the SALES report in full (the most commonly needed,
// and it exercises every listed filter: date range, branch, product,
// supplier, manufacturer, customer, doctor, payment mode) — table view AND
// summary view. It's built to extend to other entities the same way, not
// claimed to already cover all of them.
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');

async function buildSaleIdFilter({ organizationId, branchId, filters }) {
  const saleMatch = { organizationId, branchId, status: { $ne: 'CANCELLED' } };
  if (filters.from || filters.to) {
    saleMatch.saleDate = { ...(filters.from && { $gte: new Date(filters.from) }), ...(filters.to && { $lte: new Date(filters.to) }) };
  }
  if (filters.customer) saleMatch.customer = filters.customer;
  if (filters.doctor) saleMatch.referringDoctor = filters.doctor;
  if (filters.paymentMode) saleMatch['payments.method'] = filters.paymentMode;

  return Sale.find(saleMatch).select('_id saleNumber invoiceNumber saleDate customer referringDoctor grandTotal').populate('customer', 'name').populate('referringDoctor', 'name');
}

/**
 * view: 'table' (one row per sale line item) or 'summary' (aggregated
 * totals by medicine). filters.supplier is matched via the medicine's
 * defaultSupplier (a sale line doesn't carry the supplier it was
 * originally purchased from — the medicine's configured default supplier
 * is the closest available proxy). filters.manufacturer/medicine filter
 * directly on the sale item's medicine.
 */
async function runSalesReport({ organizationId, branchId, filters = {}, view = 'table' }) {
  const sales = await buildSaleIdFilter({ organizationId, branchId, filters });
  const saleById = new Map(sales.map((s) => [String(s._id), s]));
  if (sales.length === 0) return { view, rows: [] };

  const itemFilter = { organizationId, sale: { $in: sales.map((s) => s._id) } };
  if (filters.medicine) itemFilter.medicine = filters.medicine;

  let items = await SaleItem.find(itemFilter).populate({ path: 'medicine', select: 'name medicineCode manufacturer defaultSupplier', populate: [{ path: 'manufacturer', select: 'name' }, { path: 'defaultSupplier', select: 'supplierName' }] });

  if (filters.manufacturer) items = items.filter((i) => String(i.medicine?.manufacturer?._id) === String(filters.manufacturer));
  if (filters.supplier) items = items.filter((i) => String(i.medicine?.defaultSupplier?._id) === String(filters.supplier));

  if (view === 'summary') {
    const byMedicine = new Map();
    for (const item of items) {
      const key = String(item.medicine?._id);
      const existing = byMedicine.get(key) || { medicineId: item.medicine?._id, medicineName: item.medicine?.name, quantitySold: 0, salesValue: 0, taxableValue: 0 };
      existing.quantitySold += item.quantity;
      existing.salesValue += item.totalAmount;
      existing.taxableValue += item.taxableAmount;
      byMedicine.set(key, existing);
    }
    return { view, rows: Array.from(byMedicine.values()).sort((a, b) => b.salesValue - a.salesValue) };
  }

  const rows = items.map((item) => {
    const sale = saleById.get(String(item.sale));
    return {
      saleNumber: sale?.saleNumber,
      invoiceNumber: sale?.invoiceNumber,
      saleDate: sale?.saleDate,
      customerName: sale?.customer?.name || null,
      doctorName: sale?.referringDoctor?.name || null,
      medicineName: item.medicine?.name,
      medicineCode: item.medicine?.medicineCode,
      manufacturer: item.medicine?.manufacturer?.name || null,
      quantity: item.quantity,
      taxableAmount: item.taxableAmount,
      totalAmount: item.totalAmount,
    };
  });

  return { view, rows };
}

module.exports = { runSalesReport };
