// Phase 11 — Feature 3 (Professional Pharmacy GST Invoice). Builds the
// print-ready invoice VIEW MODEL for one Sale. Every pharmacy-identity
// field (name/logo/address/GSTIN/drug license) comes live from
// Organization/Branch/BusinessSettings; every transaction field comes from
// the Sale/SaleItem/Customer/Doctor documents already saved by
// saleCreationService.js. Nothing here is hardcoded — see requirement 12's
// "Data Source Mapping" table, which this function follows field-for-field.
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const SalesReturnItem = require('../models/SalesReturnItem');
const Customer = require('../models/Customer');
const Doctor = require('../models/Doctor');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const BusinessSettings = require('../models/BusinessSettings');
const { amountToWordsINR } = require('../utils/numberToWords');

const DEFAULT_TEMPLATE = {
  paperSize: 'A4',
  fontSize: 'MEDIUM',
  invoiceTitle: 'GST INVOICE',
  showLogo: true,
  logoUrl: null,
  showDrugLicense: true,
  showPatientSection: true,
  showDoctorSection: true,
  showQrCode: false,
  qrType: 'NONE',
  upiId: null,
  upiPayeeName: null,
  termsAndConditions: 'Goods once sold will not be taken back. Medicines cannot be exchanged.',
  returnPolicy: '',
  customerCareText: '',
  footerMessage: 'Thank you for your visit. Get well soon!',
};

/** Builds the full print-ready invoice data for one Sale (requirements 1-9, 12). */
async function buildInvoiceData({ organizationId, saleId }) {
  const sale = await Sale.findOne({ _id: saleId, organizationId }).lean();
  if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });

  const [items, branch, organization, settings, customer, doctor, salesReturns] = await Promise.all([
    SaleItem.find({ sale: sale._id }).lean(),
    Branch.findOne({ _id: sale.branchId, organizationId }).lean(),
    Organization.findById(organizationId).lean(),
    BusinessSettings.findOne({ organizationId, branchId: sale.branchId }).lean(),
    sale.customer ? Customer.findOne({ _id: sale.customer, organizationId }).lean() : null,
    sale.restrictedSaleInfo?.doctor ? Doctor.findOne({ _id: sale.restrictedSaleInfo.doctor, organizationId }).lean() : sale.referringDoctor ? Doctor.findOne({ _id: sale.referringDoctor, organizationId }).lean() : null,
    SalesReturn.find({ originalSale: sale._id, organizationId, status: { $ne: 'CANCELLED' } }).lean(),
  ]);

  // requirement 5: sales returns linked to this invoice, with their items,
  // so the printed bill can clearly mark returned quantities/amounts.
  let returnedItemsBySaleLine = new Map();
  if (salesReturns.length) {
    const returnIds = salesReturns.map((r) => r._id);
    const returnItems = await SalesReturnItem.find({ salesReturn: { $in: returnIds } }).lean();
    for (const ri of returnItems) {
      const key = String(ri.saleItem || ri.originalSaleItem || '');
      if (!key) continue;
      returnedItemsBySaleLine.set(key, (returnedItemsBySaleLine.get(key) || 0) + (ri.quantity || 0));
    }
  }
  const totalReturnAmount = salesReturns.reduce((sum, r) => sum + (r.totalRefundAmount || 0), 0);

  // requirement 1 & 12: pharmacy identity — Branch overrides Organization
  // where set (multi-branch), never hardcoded.
  const pharmacy = {
    name: organization?.name || null,
    legalName: organization?.legalName || null,
    logoUrl: settings?.invoiceTemplate?.logoUrl || null,
    address: branch ? [branch.address, branch.city, branch.state, branch.pincode].filter(Boolean).join(', ') : [organization?.address?.line1, organization?.address?.city, organization?.address?.state, organization?.address?.pincode].filter(Boolean).join(', '),
    phone: branch?.phone || organization?.phone || null,
    email: branch?.email || organization?.email || null,
    gstin: branch?.gstin || organization?.gstin || null,
    drugLicenseNumber: branch?.drugLicenseNumber || organization?.drugLicenseNumber || null,
    branchName: branch?.branchName || null,
    branchCode: branch?.branchCode || null,
  };

  const template = { ...DEFAULT_TEMPLATE, ...(settings?.invoiceTemplate || {}) };

  const financialYear = (() => {
    const d = new Date(sale.saleDate);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
  })();

  const lineItems = items.map((it, idx) => ({
    srNo: idx + 1,
    medicineName: it.medicineNameSnapshot,
    batchNumber: it.batchNumberSnapshot,
    expiryDate: it.expiryDateSnapshot,
    hsnCode: it.hsnCodeSnapshot,
    quantity: it.quantity,
    freeQuantity: it.freeQuantity,
    mrp: it.mrp,
    rate: it.sellingRate,
    discount: it.discountAmount + it.billDiscountAllocated,
    taxableAmount: it.taxableAmount,
    gstRate: it.gstRate,
    cgst: it.cgst,
    sgst: it.sgst,
    igst: it.igst,
    totalAmount: it.totalAmount,
    returnedQuantity: returnedItemsBySaleLine.get(String(it._id)) || it.returnedQuantity || 0,
  }));

  let qr = null;
  if (template.showQrCode && template.qrType === 'UPI' && template.upiId) {
    // requirement 8: generated from actual configured info, never copied
    // from any reference image. The frontend renders this payload as a
    // scannable QR — see PHASE11_REPORT.md for what's needed to render it.
    const payeeName = encodeURIComponent(template.upiPayeeName || pharmacy.name || 'Pharmacy');
    qr = {
      type: 'UPI',
      payload: `upi://pay?pa=${encodeURIComponent(template.upiId)}&pn=${payeeName}&am=${sale.grandTotal}&tn=${encodeURIComponent(`Invoice ${sale.invoiceNumber}`)}&cu=INR`,
    };
  }

  return {
    template,
    pharmacy,
    invoice: {
      title: template.invoiceTitle,
      invoiceNumber: sale.invoiceNumber,
      saleNumber: sale.saleNumber,
      invoiceDate: sale.saleDate,
      financialYear,
      paymentMode: sale.payments?.map((p) => p.method).join(', ') || sale.saleType,
      taxType: sale.taxType,
    },
    customer: {
      name: customer?.name || sale.walkInCustomerName || 'Walk-in Customer',
      customerId: customer?._id || null,
      mobile: customer?.mobile || sale.walkInCustomerMobile || null,
      gstin: customer?.gstin || null,
      address: customer?.address || null,
    },
    doctor:
      sale.hasRestrictedItems || sale.referringDoctor || sale.referringDoctorName
        ? {
            name: sale.restrictedSaleInfo?.doctorName || doctor?.name || sale.referringDoctorName || null,
            registrationNumber: sale.restrictedSaleInfo?.doctorRegistrationNo || doctor?.registrationNumber || null,
            prescriptionReference: sale.restrictedSaleInfo?.prescriptionReference || null,
            prescriptionDate: sale.restrictedSaleInfo?.prescriptionDate || null,
          }
        : null,
    items: lineItems,
    salesReturns: salesReturns.map((r) => ({ returnNumber: r.returnNumber, returnDate: r.returnDate, totalRefundAmount: r.totalRefundAmount, reason: r.reason })),
    hasReturns: salesReturns.length > 0,
    totals: {
      subtotal: sale.subtotal,
      itemDiscount: sale.itemDiscount,
      billDiscount: sale.billDiscount,
      totalDiscount: sale.totalDiscount,
      taxableAmount: sale.taxableAmount,
      cgst: sale.cgst,
      sgst: sale.sgst,
      igst: sale.igst,
      totalGst: sale.cgst + sale.sgst + sale.igst,
      roundOff: sale.roundOff,
      grandTotal: sale.grandTotal,
      totalReturnAmount,
      netAmount: sale.grandTotal - totalReturnAmount,
      paidAmount: sale.paidAmount,
      outstandingAmount: sale.outstandingAmount,
      amountInWords: amountToWordsINR(sale.grandTotal),
    },
    qr,
  };
}

module.exports = { buildInvoiceData };
