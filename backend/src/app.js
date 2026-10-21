const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const manufacturerRoutes = require('./routes/manufacturerRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const batchRoutes = require('./routes/batchRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const purchaseReturnRoutes = require('./routes/purchaseReturnRoutes');
const customerRoutes = require('./routes/customerRoutes');
const saleRoutes = require('./routes/saleRoutes');
const salesReturnRoutes = require('./routes/salesReturnRoutes');
const holdBillRoutes = require('./routes/holdBillRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const consultationRoutes = require('./routes/consultationRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const chartOfAccountRoutes = require('./routes/chartOfAccountRoutes');
const journalEntryRoutes = require('./routes/journalEntryRoutes');
const expenseCategoryRoutes = require('./routes/expenseCategoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const dayCloseRoutes = require('./routes/dayCloseRoutes');
const whatsappOrderRoutes = require('./routes/whatsappOrderRoutes');
const inventoryAutomationRoutes = require('./routes/inventoryAutomationRoutes');
const expiryRoutes = require('./routes/expiryRoutes');
const stockCountRoutes = require('./routes/stockCountRoutes');
const paymentReconciliationRoutes = require('./routes/paymentReconciliationRoutes');
const profitAnalyticsRoutes = require('./routes/profitAnalyticsRoutes');
const crmAnalyticsRoutes = require('./routes/crmAnalyticsRoutes');
const businessAnalyticsRoutes = require('./routes/businessAnalyticsRoutes');
const stockMovementRoutes = require('./routes/stockMovementRoutes');
const alertsRoutes = require('./routes/alertsRoutes');
const aiInsightsRoutes = require('./routes/aiInsightsRoutes');
const backupRoutes = require('./routes/backupRoutes');
const hsnMasterRoutes = require('./routes/hsnMasterRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const barcodeRoutes = require('./routes/barcodeRoutes');
const controlledDrugRegisterRoutes = require('./routes/controlledDrugRegisterRoutes');
const familyRoutes = require('./routes/familyRoutes');
const doctorCommissionRoutes = require('./routes/doctorCommissionRoutes');
const distributorRoutes = require('./routes/distributorRoutes');
const stockAnalysisRoutes = require('./routes/stockAnalysisRoutes');
const reorderSuggestionRoutes = require('./routes/reorderSuggestionRoutes');
const purchaseImportRoutes = require('./routes/purchaseImportRoutes');
const exportRoutes = require('./routes/exportRoutes');
const reportBuilderRoutes = require('./routes/reportBuilderRoutes');
// Phase 11
const gstReturnRoutes = require('./routes/gstReturnRoutes');
const offlineSyncRoutes = require('./routes/offlineSyncRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const businessSettingsRoutes = require('./routes/businessSettingsRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
// credentials: false — auth is Bearer-token-only (see authenticateUser.js),
// nothing in this app relies on cookies being sent cross-origin.
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Global rate limit (per-route limits, e.g. login, are added on top of this).
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => res.json({ success: true, message: 'OK', data: { status: 'up' } }));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/manufacturers', manufacturerRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/sales-returns', salesReturnRoutes);
app.use('/api/hold-bills', holdBillRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/chart-of-accounts', chartOfAccountRoutes);
app.use('/api/journal-entries', journalEntryRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/day-close', dayCloseRoutes);
app.use('/api/whatsapp', whatsappOrderRoutes);
app.use('/api/inventory-automation', inventoryAutomationRoutes);
app.use('/api/expiry', expiryRoutes);
app.use('/api/stock-counts', stockCountRoutes);
app.use('/api/payment-reconciliation', paymentReconciliationRoutes);
app.use('/api/profit-analytics', profitAnalyticsRoutes);
app.use('/api/crm-analytics', crmAnalyticsRoutes);
app.use('/api/business-analytics', businessAnalyticsRoutes);
app.use('/api/stock-movement', stockMovementRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/ai-insights', aiInsightsRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/hsn-master', hsnMasterRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/controlled-register', controlledDrugRegisterRoutes);
app.use('/api/families', familyRoutes);
app.use('/api/doctor-commission', doctorCommissionRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/stock-analysis', stockAnalysisRoutes);
app.use('/api/reorder-suggestions', reorderSuggestionRoutes);
app.use('/api/purchase-import', purchaseImportRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/reports', reportBuilderRoutes);
// Phase 11
app.use('/api/gst-returns', gstReturnRoutes);
app.use('/api/offline-sync', offlineSyncRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/business-settings', businessSettingsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
