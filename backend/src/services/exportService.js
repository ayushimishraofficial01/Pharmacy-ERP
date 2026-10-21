// Phase 10 — export system (requirement 20). A registry-driven approach:
// one entry per exportable entity, describing which model/query/columns to
// use and which roles may export it. Entities carrying patient/prescription
// data are gated to a smaller role set (`sensitiveRoles`) than general
// business data (`allowedRoles`) — applied by exportController, not
// route-level authorizeRoles alone, so each entity gets its own bar.
const Customer = require('../models/Customer');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Supplier = require('../models/Supplier');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Prescription = require('../models/Prescription');
const Doctor = require('../models/Doctor');
const HsnMaster = require('../models/HsnMaster');

const GENERAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const CLINICAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST']; // for patient/prescription data

// Each entry: { label, allowedRoles, fetch(req) -> rows[], columns: [{key,label}] }
const REGISTRY = {
  customers: {
    label: 'Customers',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Customer.find({ organizationId: req.organizationId }).lean(),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'address', label: 'Address' },
      { key: 'doctorName', label: 'Doctor' },
      { key: 'state', label: 'State' },
      { key: 'outstandingBalance', label: 'Outstanding Balance' },
      { key: 'createdAt', label: 'Created At' },
    ],
  },
  patients: {
    label: 'Patients',
    allowedRoles: CLINICAL_ROLES,
    fetch: async (req) => Patient.find({ organizationId: req.organizationId }).lean(),
    columns: [
      { key: 'firstName', label: 'First Name' },
      { key: 'lastName', label: 'Last Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'gender', label: 'Gender' },
      { key: 'createdAt', label: 'Created At' },
    ],
  },
  medicines: {
    label: 'Medicines',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Medicine.find({ organizationId: req.organizationId }).populate('category', 'name').populate('manufacturer', 'name').lean(),
    columns: [
      { key: 'medicineCode', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'saltComposition', label: 'Composition' },
      { key: 'batchNumber', label: 'Batch No' },
      { key: 'defaultRate', label: 'Rate' },
      { key: 'defaultQuantity', label: 'Quantity' },
      { key: 'defaultMrp', label: 'Default MRP' },
      { key: 'defaultExpiryDate', label: 'Default Expiry' },
      { key: 'defaultDiscountType', label: 'Discount Type' },
      { key: 'defaultDiscountValue', label: 'Discount' },
      { key: 'hsnCode', label: 'HSN' },
      { key: 'gstRate', label: 'GST %' },
      { key: 'scheduleType', label: 'Schedule' },
    ],
  },
  stock: {
    label: 'Stock (batches)',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => {
      const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, isActive: true }).populate('medicine', 'name medicineCode').lean();
      return batches.map((b) => ({ ...b, medicineName: b.medicine?.name, medicineCode: b.medicine?.medicineCode }));
    },
    columns: [
      { key: 'medicineCode', label: 'Medicine Code' },
      { key: 'medicineName', label: 'Medicine' },
      { key: 'batchNumber', label: 'Batch' },
      { key: 'expiryDate', label: 'Expiry' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'purchaseRate', label: 'Purchase Rate' },
      { key: 'mrp', label: 'MRP' },
    ],
  },
  purchases: {
    label: 'Purchases',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => {
      const purchases = await Purchase.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('supplier', 'supplierName').lean();
      return purchases.map((p) => ({ ...p, supplierName: p.supplier?.supplierName }));
    },
    columns: [
      { key: 'purchaseNumber', label: 'Purchase No' },
      { key: 'invoiceNumber', label: 'Invoice No' },
      { key: 'invoiceDate', label: 'Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'grandTotal', label: 'Grand Total' },
      { key: 'paymentStatus', label: 'Payment Status' },
    ],
  },
  sales: {
    label: 'Sales',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => {
      const sales = await Sale.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('customer', 'name').lean();
      return sales.map((s) => ({ ...s, customerName: s.customer?.name || s.walkInCustomerName }));
    },
    columns: [
      { key: 'saleNumber', label: 'Sale No' },
      { key: 'invoiceNumber', label: 'Invoice No' },
      { key: 'saleDate', label: 'Date' },
      { key: 'customerName', label: 'Customer' },
      { key: 'grandTotal', label: 'Grand Total' },
      { key: 'paymentStatus', label: 'Payment Status' },
    ],
  },
  suppliers: {
    label: 'Suppliers',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Supplier.find({ organizationId: req.organizationId }).lean(),
    columns: [
      { key: 'supplierCode', label: 'Code' },
      { key: 'supplierName', label: 'Name' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'isDistributor', label: 'Is Distributor' },
      { key: 'isActive', label: 'Active' },
    ],
  },
  payments: {
    label: 'Payments',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Payment.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('customer', 'name').populate('supplier', 'supplierName').lean(),
    columns: [
      { key: 'paymentNumber', label: 'Payment No' },
      { key: 'direction', label: 'Direction' },
      { key: 'method', label: 'Method' },
      { key: 'amount', label: 'Amount' },
      { key: 'paymentDate', label: 'Date' },
    ],
  },
  expenses: {
    label: 'Expenses',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Expense.find({ organizationId: req.organizationId, branchId: req.branchId }).populate('category', 'name').lean(),
    columns: [
      { key: 'expenseNumber', label: 'Expense No' },
      { key: 'date', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'vendor', label: 'Vendor' },
    ],
  },
  gst: {
    label: 'GST data (HSN master)',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => HsnMaster.find({ organizationId: req.organizationId, isActive: true }).lean(),
    columns: [
      { key: 'hsnCode', label: 'HSN Code' },
      { key: 'description', label: 'Description' },
      { key: 'gstRate', label: 'GST %' },
      { key: 'effectiveDate', label: 'Effective Date' },
    ],
  },
  'profit-report': {
    label: 'Profit report (sale items, taxable vs cost)',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => {
      const sales = await Sale.find({ organizationId: req.organizationId, branchId: req.branchId, status: { $ne: 'CANCELLED' } }).select('_id saleDate saleNumber');
      const saleById = new Map(sales.map((s) => [String(s._id), s]));
      const items = await SaleItem.find({ organizationId: req.organizationId, sale: { $in: sales.map((s) => s._id) } }).lean();
      return items.map((i) => {
        const sale = saleById.get(String(i.sale));
        const cost = i.quantity * (i.purchaseRateSnapshot || 0);
        return { saleNumber: sale?.saleNumber, saleDate: sale?.saleDate, medicineName: i.medicineNameSnapshot, quantity: i.quantity, taxableAmount: i.taxableAmount, cost, margin: i.taxableAmount - cost };
      });
    },
    columns: [
      { key: 'saleNumber', label: 'Sale No' },
      { key: 'saleDate', label: 'Date' },
      { key: 'medicineName', label: 'Medicine' },
      { key: 'quantity', label: 'Qty' },
      { key: 'taxableAmount', label: 'Taxable Amount' },
      { key: 'cost', label: 'Est. Cost' },
      { key: 'margin', label: 'Est. Margin' },
    ],
  },
  prescriptions: {
    label: 'Prescription data',
    allowedRoles: CLINICAL_ROLES,
    fetch: async (req) => {
      const prescriptions = await Prescription.find({ organizationId: req.organizationId }).populate('patient', 'firstName lastName').populate('doctor', 'name').lean();
      return prescriptions.map((p) => ({ ...p, patientName: [p.patient?.firstName, p.patient?.lastName].filter(Boolean).join(' '), doctorName: p.doctor?.name }));
    },
    columns: [
      { key: 'prescriptionNumber', label: 'Prescription No' },
      { key: 'patientName', label: 'Patient' },
      { key: 'doctorName', label: 'Doctor' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'status', label: 'Status' },
    ],
  },
  doctors: {
    label: 'Doctor reports',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => Doctor.find({ organizationId: req.organizationId }).lean(),
    columns: [
      { key: 'doctorCode', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'specialization', label: 'Specialization' },
      { key: 'registrationNumber', label: 'Registration No' },
      { key: 'mobile', label: 'Mobile' },
    ],
  },
  inventory: {
    label: 'Inventory report (current stock summary)',
    allowedRoles: GENERAL_ROLES,
    fetch: async (req) => {
      const medicines = await Medicine.find({ organizationId: req.organizationId, isActive: true }).lean();
      const rows = [];
      for (const med of medicines) {
        const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true }).lean();
        const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
        const stockValue = batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0);
        rows.push({ medicineCode: med.medicineCode, medicineName: med.name, currentStock, stockValue, reorderLevel: med.reorderLevel });
      }
      return rows;
    },
    columns: [
      { key: 'medicineCode', label: 'Code' },
      { key: 'medicineName', label: 'Medicine' },
      { key: 'currentStock', label: 'Current Stock' },
      { key: 'stockValue', label: 'Stock Value' },
      { key: 'reorderLevel', label: 'Reorder Level' },
    ],
  },
};

function getEntity(key) {
  return REGISTRY[key] || null;
}

function listEntities() {
  return Object.entries(REGISTRY).map(([key, v]) => ({ key, label: v.label, allowedRoles: v.allowedRoles }));
}

module.exports = { getEntity, listEntities };
