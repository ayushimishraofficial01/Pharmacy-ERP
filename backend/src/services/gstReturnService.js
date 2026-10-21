// Phase 11 — Feature 1 (Direct GST Return Management / Filing). Fetches
// REAL ERP transactions ONLY — Sale/SaleItem/SalesReturn/Purchase/
// PurchaseReturn (Stage 3/4/9's actual models, never sample/fake data) —
// and hands them to gstReturnCalculationService.js (pure functions) for the
// actual GSTR-1/GSTR-3B math. This file does DB I/O only; see that file for
// the unit-tested calculation logic.
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const calc = require('./gstReturnCalculationService');

/** Resolves the GSTIN to file under: branch GSTIN if set, else the org's. Never hardcoded/fabricated. */
async function resolveGstin({ organizationId, branchId }) {
  const branch = branchId ? await Branch.findOne({ _id: branchId, organizationId }).lean() : null;
  if (branch?.gstin) return branch.gstin;
  const org = await Organization.findById(organizationId).lean();
  return org?.gstin || null;
}

/**
 * Pulls every non-cancelled Sale + its SaleItems in [from, to) and reshapes
 * them into the invoice-level structure gstValidationService.validateInvoice
 * expects. This is the GSTR-1 "outward supplies" source data.
 */
async function buildOutwardSupplyInvoices({ organizationId, branchId, from, to, sellerGstin }) {
  const sales = await Sale.find({
    organizationId,
    branchId,
    saleDate: { $gte: from, $lt: to },
    status: { $ne: 'CANCELLED' },
  })
    .populate('customer', 'name gstin state')
    .sort({ saleDate: 1 })
    .lean();

  const saleIds = sales.map((s) => s._id);
  const items = await SaleItem.find({ sale: { $in: saleIds } }).lean();
  const itemsBySale = new Map();
  for (const item of items) {
    const key = String(item.sale);
    if (!itemsBySale.has(key)) itemsBySale.set(key, []);
    itemsBySale.get(key).push(item);
  }

  return sales.map((sale) => {
    const saleItems = itemsBySale.get(String(sale._id)) || [];
    return {
      saleId: sale._id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.saleDate,
      sellerGstin,
      buyerGstin: sale.customer?.gstin || null,
      buyerName: sale.customer?.name || sale.walkInCustomerName || 'Walk-in customer',
      placeOfSupply: sale.customerState || sale.storeState || null,
      supplyType: sale.taxType === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE',
      invoiceCategory: sale.customer?.gstin ? 'B2B' : 'B2C',
      taxableAmount: sale.taxableAmount,
      cgst: sale.cgst,
      sgst: sale.sgst,
      igst: sale.igst,
      grandTotal: sale.grandTotal,
      items: saleItems.map((it) => ({
        hsnCode: it.hsnCodeSnapshot,
        medicineName: it.medicineNameSnapshot,
        quantity: it.quantity,
        gstRate: it.gstRate,
        taxableAmount: it.taxableAmount,
        cgst: it.cgst,
        sgst: it.sgst,
        igst: it.igst,
      })),
    };
  });
}

/** Sales returns in the period, reshaped as GSTR-1 Credit Notes (CDNR/CDNUR). */
async function buildCreditNotes({ organizationId, branchId, from, to, sellerGstin }) {
  const returns = await SalesReturn.find({
    organizationId,
    branchId,
    returnDate: { $gte: from, $lt: to },
    status: { $ne: 'CANCELLED' },
  })
    .populate('customer', 'name gstin')
    .sort({ returnDate: 1 })
    .lean();

  return returns.map((r) => ({
    noteNumber: r.returnNumber,
    noteDate: r.returnDate,
    originalInvoiceNumber: r.originalInvoiceNumber,
    sellerGstin,
    buyerGstin: r.customer?.gstin || null,
    noteType: r.customer?.gstin ? 'CDNR' : 'CDNUR',
    taxableAmount: r.taxableAmount,
    cgst: r.cgst,
    sgst: r.sgst,
    igst: r.igst,
    totalAmount: r.totalRefundAmount,
  }));
}

/** Purchases in the period — the ITC (Input Tax Credit) side of GSTR-3B. */
async function buildInwardSupplies({ organizationId, branchId, from, to }) {
  const purchases = await Purchase.find({
    organizationId,
    branchId,
    invoiceDate: { $gte: from, $lt: to },
    status: { $ne: 'CANCELLED' },
  })
    .populate('supplier', 'supplierName gstin')
    .lean();

  const purchaseReturns = await PurchaseReturn.find({
    organizationId,
    branchId,
    returnDate: { $gte: from, $lt: to },
  }).lean();

  return {
    purchases: purchases.map((p) => ({
      purchaseNumber: p.purchaseNumber,
      supplierInvoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate,
      supplierName: p.supplier?.supplierName || null,
      supplierGstin: p.supplier?.gstin || null,
      taxableAmount: p.taxableAmount,
      cgst: p.cgst,
      sgst: p.sgst,
      igst: p.igst,
      grandTotal: p.grandTotal,
    })),
    purchaseReturns: purchaseReturns.map((r) => ({
      returnNumber: r.returnNumber,
      returnDate: r.returnDate,
      taxableAmount: r.taxableAmount,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      grandTotal: r.grandTotal,
    })),
  };
}

/**
 * Top-level orchestration for the GST Return Dashboard and for return
 * generation. `returnType` is 'GSTR-1' | 'GSTR-3B' | undefined (undefined =
 * build both, which the dashboard needs for its combined totals view).
 */
async function generateReturnData({ organizationId, branchId, period, returnType }) {
  const { from, to } = calc.periodToDateRange(period);
  const gstin = await resolveGstin({ organizationId, branchId });

  const invoices = await buildOutwardSupplyInvoices({ organizationId, branchId, from, to, sellerGstin: gstin });
  const creditNotes = await buildCreditNotes({ organizationId, branchId, from, to, sellerGstin: gstin });
  const inward = await buildInwardSupplies({ organizationId, branchId, from, to });

  const result = {
    gstin,
    period,
    dateRange: { from, to },
    salesReturnCount: creditNotes.length,
    purchaseCount: inward.purchases.length,
    purchaseReturnCount: inward.purchaseReturns.length,
  };

  if (!returnType || returnType === 'GSTR-1') {
    result.gstr1 = calc.buildGstr1(invoices, creditNotes);
  }
  if (!returnType || returnType === 'GSTR-3B') {
    result.gstr3b = calc.buildGstr3b(invoices, creditNotes, inward);
  }
  // Kept for gstValidationService (operates on this exact invoice shape) and
  // for JSON/Excel export.
  result._invoices = invoices;
  result._creditNotes = creditNotes;

  return result;
}

module.exports = {
  resolveGstin,
  buildOutwardSupplyInvoices,
  buildCreditNotes,
  buildInwardSupplies,
  generateReturnData,
  periodToDateRange: calc.periodToDateRange,
};
