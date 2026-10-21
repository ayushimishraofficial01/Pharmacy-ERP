// One function per backend endpoint (see backend/API_REFERENCE.md — this
// file is that document, executable). Grouped by resource so pages import
// only what they need: `import { medicines, sales } from '../api/endpoints'`.
import client, { unwrap } from './client';

export const auth = {
  registerOrganization: (body) => unwrap(client.post('/auth/register-organization', body)),
  login: (body) => unwrap(client.post('/auth/login', body)),
  logout: () => unwrap(client.post('/auth/logout')),
  me: () => unwrap(client.get('/auth/me')),
};

export const categories = {
  list: (params) => unwrap(client.get('/categories', { params })),
  create: (body) => unwrap(client.post('/categories', body)),
  update: (id, body) => unwrap(client.put(`/categories/${id}`, body)),
  remove: (id) => unwrap(client.delete(`/categories/${id}`)),
};

export const manufacturers = {
  list: (params) => unwrap(client.get('/manufacturers', { params })),
  create: (body) => unwrap(client.post('/manufacturers', body)),
  update: (id, body) => unwrap(client.put(`/manufacturers/${id}`, body)),
  remove: (id) => unwrap(client.delete(`/manufacturers/${id}`)),
};

export const medicines = {
  list: (params) => unwrap(client.get('/medicines', { params })),
  get: (id) => unwrap(client.get(`/medicines/${id}`)),
  create: (body) => unwrap(client.post('/medicines', body)),
  update: (id, body) => unwrap(client.put(`/medicines/${id}`, body)),
  remove: (id) => unwrap(client.delete(`/medicines/${id}`)),
};

export const exportsApi = {
  xlsx: (entity) => client.get(`/export/${entity}`, { params: { format: 'xlsx' }, responseType: 'blob' }),
};

export const batches = {
  listForMedicine: (medicineId) => unwrap(client.get(`/batches/medicine/${medicineId}`)),
  adjust: (body) => unwrap(client.post('/batches/adjust', body)),
};

export const suppliers = {
  list: (params) => unwrap(client.get('/suppliers', { params })),
  get: (id) => unwrap(client.get(`/suppliers/${id}`)),
  create: (body) => unwrap(client.post('/suppliers', body)),
  update: (id, body) => unwrap(client.put(`/suppliers/${id}`, body)),
  remove: (id) => unwrap(client.delete(`/suppliers/${id}`)),
};

export const purchases = {
  list: (params) => unwrap(client.get('/purchases', { params })),
  get: (id) => unwrap(client.get(`/purchases/${id}`)),
  create: (body) => unwrap(client.post('/purchases', body)),
};

export const purchaseReturns = {
  list: () => unwrap(client.get('/purchase-returns')),
  create: (body) => unwrap(client.post('/purchase-returns', body)),
};

export const customers = {
  list: (params) => unwrap(client.get('/customers', { params })),
  get: (id) => unwrap(client.get(`/customers/${id}`)),
  create: (body) => unwrap(client.post('/customers', body)),
  update: (id, body) => unwrap(client.put(`/customers/${id}`, body)),
};

export const sales = {
  list: (params) => unwrap(client.get('/sales', { params })),
  get: (id) => unwrap(client.get(`/sales/${id}`)),
  create: (body) => unwrap(client.post('/sales', body)),
  cancel: (id, reason) => unwrap(client.post(`/sales/${id}/cancel`, { reason })),
};

export const salesReturns = {
  list: () => unwrap(client.get('/sales-returns')),
  create: (body) => unwrap(client.post('/sales-returns', body)),
};

export const holdBills = {
  list: () => unwrap(client.get('/hold-bills')),
  create: (body) => unwrap(client.post('/hold-bills', body)),
  resume: (id) => unwrap(client.get(`/hold-bills/${id}/resume`)),
  remove: (id) => unwrap(client.delete(`/hold-bills/${id}`)),
};

export const doctors = {
  list: () => unwrap(client.get('/doctors')),
  create: (body) => unwrap(client.post('/doctors', body)),
  update: (id, body) => unwrap(client.put(`/doctors/${id}`, body)),
};

export const patients = {
  list: (params) => unwrap(client.get('/patients', { params })),
  get: (id) => unwrap(client.get(`/patients/${id}`)),
  create: (body) => unwrap(client.post('/patients', body)),
  update: (id, body) => unwrap(client.put(`/patients/${id}`, body)),
};

export const appointments = {
  list: (params) => unwrap(client.get('/appointments', { params })),
  create: (body) => unwrap(client.post('/appointments', body)),
  updateStatus: (id, body) => unwrap(client.patch(`/appointments/${id}/status`, body)),
};

export const consultations = {
  list: (params) => unwrap(client.get('/consultations', { params })),
  start: (body) => unwrap(client.post('/consultations', body)),
  get: (id) => unwrap(client.get(`/consultations/${id}`)),
  update: (id, body) => unwrap(client.put(`/consultations/${id}`, body)),
};

export const prescriptions = {
  create: (body) => unwrap(client.post('/prescriptions', body)),
  listForPatient: (patientId) => unwrap(client.get(`/prescriptions/patient/${patientId}`)),
  get: (id) => unwrap(client.get(`/prescriptions/${id}`)),
  dispense: (id, body) => unwrap(client.patch(`/prescriptions/${id}/dispense`, body)),
};

export const chartOfAccounts = {
  list: () => unwrap(client.get('/chart-of-accounts')),
  create: (body) => unwrap(client.post('/chart-of-accounts', body)),
};

export const journalEntries = {
  list: () => unwrap(client.get('/journal-entries')),
  create: (body) => unwrap(client.post('/journal-entries', body)),
};

export const expenseCategories = {
  list: () => unwrap(client.get('/expense-categories')),
  seedDefaults: () => unwrap(client.post('/expense-categories/seed-defaults')),
  create: (body) => unwrap(client.post('/expense-categories', body)),
};

export const expenses = {
  list: (params) => unwrap(client.get('/expenses', { params })),
  create: (body) => unwrap(client.post('/expenses', body)),
  cancel: (id) => unwrap(client.patch(`/expenses/${id}/cancel`)),
};

export const income = {
  list: (params) => unwrap(client.get('/income', { params })),
  create: (body) => unwrap(client.post('/income', body)),
  cancel: (id) => unwrap(client.patch(`/income/${id}/cancel`)),
};

export const dayClose = {
  preview: (date) => unwrap(client.get('/day-close/preview', { params: { date } })),
  list: () => unwrap(client.get('/day-close')),
  close: (body) => unwrap(client.post('/day-close', body)),
};

export const whatsapp = {
  checkAvailability: (params) => unwrap(client.get('/whatsapp/availability', { params })),
  listOrders: (params) => unwrap(client.get('/whatsapp/orders', { params })),
  getOrder: (id) => unwrap(client.get(`/whatsapp/orders/${id}`)),
  createOrder: (body) => unwrap(client.post('/whatsapp/orders', body)),
  updateStatus: (id, body) => unwrap(client.patch(`/whatsapp/orders/${id}/status`, body)),
  confirmItem: (id, body) => unwrap(client.patch(`/whatsapp/orders/${id}/confirm-item`, body)),
  convert: (id) => unwrap(client.post(`/whatsapp/orders/${id}/convert`)),
};

export const inventoryAutomation = {
  status: () => unwrap(client.get('/inventory-automation/status')),
  smartReorder: () => unwrap(client.get('/inventory-automation/smart-reorder')),
};

export const expiry = {
  dashboard: () => unwrap(client.get('/expiry/dashboard')),
  nearExpiryReport: (days) => unwrap(client.get('/expiry/near-expiry-report', { params: { days } })),
  stockValuation: () => unwrap(client.get('/expiry/stock-valuation')),
};

export const stockCounts = {
  list: () => unwrap(client.get('/stock-counts')),
  get: (id) => unwrap(client.get(`/stock-counts/${id}`)),
  create: (body) => unwrap(client.post('/stock-counts', body)),
  recordLines: (id, body) => unwrap(client.patch(`/stock-counts/${id}/lines`, body)),
  submit: (id) => unwrap(client.post(`/stock-counts/${id}/submit`)),
  approveAndAdjust: (id) => unwrap(client.post(`/stock-counts/${id}/approve-and-adjust`)),
};

export const paymentReconciliation = {
  get: (params) => unwrap(client.get('/payment-reconciliation', { params })),
};

export const profitAnalytics = {
  get: (params) => unwrap(client.get('/profit-analytics', { params })),
};

export const crmAnalytics = {
  segments: () => unwrap(client.get('/crm-analytics/segments')),
};

export const businessAnalytics = {
  dashboard: (params) => unwrap(client.get('/business-analytics', { params })),
  branchComparison: (params) => unwrap(client.get('/business-analytics/branch-comparison', { params })),
};

export const stockMovement = {
  report: (days) => unwrap(client.get('/stock-movement/report', { params: { days } })),
};

export const alerts = {
  list: (unreadOnly) => unwrap(client.get('/alerts', { params: { unreadOnly } })),
  markRead: (id) => unwrap(client.patch(`/alerts/${id}/read`)),
  run: () => unwrap(client.post('/alerts/run')),
};

export const aiInsights = {
  get: (params) => unwrap(client.get('/ai-insights', { params })),
};

export const backups = {
  list: () => unwrap(client.get('/backups')),
  record: (body) => unwrap(client.post('/backups', body)),
  authorizeRestore: (id, notes) => unwrap(client.post(`/backups/${id}/authorize-restore`, { notes })),
};

// Phase 11 — Feature 1
export const gstReturns = {
  dashboard: (params) => unwrap(client.get('/gst-returns/dashboard', { params })),
  generate: (params) => unwrap(client.get('/gst-returns/generate', { params })),
  save: (body) => unwrap(client.post('/gst-returns', body)),
  list: (params) => unwrap(client.get('/gst-returns', { params })),
  get: (id) => unwrap(client.get(`/gst-returns/${id}`)),
  // GET requires the Bearer auth header, so this can't be a plain <a href>
  // link — fetch as a blob and let the caller trigger the download.
  exportFile: async (id, format) => {
    const res = await client.get(`/gst-returns/${id}/export`, { params: { format }, responseType: format === 'JSON' ? 'json' : 'blob' });
    return res;
  },
  submit: (id) => unwrap(client.post(`/gst-returns/${id}/submit`)),
  portalStatus: () => unwrap(client.get('/gst-returns/portal-status')),
};

// Phase 11 — Feature 2 (server side of offline sync; the offline queue
// itself lives in frontend/src/offline/*)
export const offlineSync = {
  bootstrap: () => unwrap(client.get('/offline-sync/bootstrap')),
  push: (body) => unwrap(client.post('/offline-sync/push', body)),
  status: () => unwrap(client.get('/offline-sync/status')),
  retry: (id) => unwrap(client.post(`/offline-sync/${id}/retry`)),
  resolveConflict: (id, body) => unwrap(client.post(`/offline-sync/${id}/resolve-conflict`, body)),
};

// Phase 11 — Feature 3
export const invoices = {
  get: (saleId) => unwrap(client.get(`/invoices/${saleId}`)),
};

export const businessSettings = {
  get: () => unwrap(client.get('/business-settings')),
  update: (body) => unwrap(client.put('/business-settings', body)),
};
