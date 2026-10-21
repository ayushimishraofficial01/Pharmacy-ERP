// Phase 11 — Feature 1: PURE calculation/reshaping functions for GST return
// data, split out from gstReturnService.js so this half can be unit tested
// without a DB connection (same "pure service" pattern as
// gstCalculationService.js / saleCalculationService.js). gstReturnService.js
// does the Mongoose querying and hands already-fetched plain objects to
// these functions — nothing here touches a model or the database.
const money = require('../utils/money');

/** "2026-08" -> { from: <Aug 1 00:00:00 UTC>, to: <Sep 1 00:00:00 UTC exclusive> } */
function periodToDateRange(period) {
  const [yearStr, monthStr] = String(period).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  if (!year || !month || month < 1 || month > 12) {
    throw Object.assign(new Error(`Invalid period "${period}". Expected "YYYY-MM".`), { statusCode: 400 });
  }
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

/** HSN-wise summary table (GSTR-1 table 12 shape): groups all sale line items by HSN + GST rate. */
function buildHsnSummary(invoices) {
  const map = new Map();
  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      const key = `${item.hsnCode || 'UNKNOWN'}|${item.gstRate}`;
      if (!map.has(key)) {
        map.set(key, { hsnCode: item.hsnCode || 'UNKNOWN', gstRate: item.gstRate, quantity: 0, taxableAmount: 0, cgst: 0, sgst: 0, igst: 0 });
      }
      const row = map.get(key);
      row.quantity += item.quantity || 0;
      row.taxableAmount = money.sum(row.taxableAmount, item.taxableAmount);
      row.cgst = money.sum(row.cgst, item.cgst);
      row.sgst = money.sum(row.sgst, item.sgst);
      row.igst = money.sum(row.igst, item.igst);
    }
  }
  return [...map.values()].sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
}

/** GSTR-1 shape: B2B invoices, B2C(Small) aggregated by place-of-supply + rate, credit notes, HSN summary. */
function buildGstr1(invoices, creditNotes) {
  const b2b = invoices.filter((i) => i.invoiceCategory === 'B2B');
  const b2cInvoices = invoices.filter((i) => i.invoiceCategory === 'B2C');

  const b2csMap = new Map();
  for (const invoice of b2cInvoices) {
    for (const item of invoice.items || []) {
      const key = `${invoice.placeOfSupply || 'UNKNOWN'}|${item.gstRate}`;
      if (!b2csMap.has(key)) {
        b2csMap.set(key, { placeOfSupply: invoice.placeOfSupply || 'UNKNOWN', gstRate: item.gstRate, taxableAmount: 0, cgst: 0, sgst: 0, igst: 0 });
      }
      const row = b2csMap.get(key);
      row.taxableAmount = money.sum(row.taxableAmount, item.taxableAmount);
      row.cgst = money.sum(row.cgst, item.cgst);
      row.sgst = money.sum(row.sgst, item.sgst);
      row.igst = money.sum(row.igst, item.igst);
    }
  }

  return {
    b2b,
    b2cs: [...b2csMap.values()],
    creditNotes,
    hsnSummary: buildHsnSummary(invoices),
    totals: {
      invoiceCount: invoices.length,
      taxableAmount: money.sum(...invoices.map((i) => i.taxableAmount)),
      cgst: money.sum(...invoices.map((i) => i.cgst)),
      sgst: money.sum(...invoices.map((i) => i.sgst)),
      igst: money.sum(...invoices.map((i) => i.igst)),
    },
  };
}

/** GSTR-3B shape: net outward tax liability, eligible ITC from purchases, net payable. */
function buildGstr3b(invoices, creditNotes, inward) {
  const outwardTaxable = money.sum(...invoices.map((i) => i.taxableAmount));
  const outwardCgst = money.sum(...invoices.map((i) => i.cgst));
  const outwardSgst = money.sum(...invoices.map((i) => i.sgst));
  const outwardIgst = money.sum(...invoices.map((i) => i.igst));

  const cnTaxable = money.sum(...creditNotes.map((c) => c.taxableAmount));
  const cnCgst = money.sum(...creditNotes.map((c) => c.cgst));
  const cnSgst = money.sum(...creditNotes.map((c) => c.sgst));
  const cnIgst = money.sum(...creditNotes.map((c) => c.igst));

  const netOutwardTaxable = money.subtract(outwardTaxable, cnTaxable);
  const netOutputCgst = money.subtract(outwardCgst, cnCgst);
  const netOutputSgst = money.subtract(outwardSgst, cnSgst);
  const netOutputIgst = money.subtract(outwardIgst, cnIgst);
  const netOutputGst = money.sum(netOutputCgst, netOutputSgst, netOutputIgst);

  const itcCgst = money.subtract(money.sum(...inward.purchases.map((p) => p.cgst)), money.sum(...inward.purchaseReturns.map((r) => r.cgst)));
  const itcSgst = money.subtract(money.sum(...inward.purchases.map((p) => p.sgst)), money.sum(...inward.purchaseReturns.map((r) => r.sgst)));
  const itcIgst = money.subtract(money.sum(...inward.purchases.map((p) => p.igst)), money.sum(...inward.purchaseReturns.map((r) => r.igst)));
  const totalItc = money.sum(itcCgst, itcSgst, itcIgst);

  const netPayable = Math.max(0, money.subtract(netOutputGst, totalItc));

  return {
    outwardSupplies: { taxableAmount: netOutwardTaxable, cgst: netOutputCgst, sgst: netOutputSgst, igst: netOutputIgst, totalTax: netOutputGst },
    inputTaxCredit: { cgst: itcCgst, sgst: itcSgst, igst: itcIgst, total: totalItc },
    netGstPayable: netPayable,
  };
}

module.exports = { periodToDateRange, buildHsnSummary, buildGstr1, buildGstr3b };
