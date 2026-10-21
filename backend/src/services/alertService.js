// Phase 8 sections 12-13: automated business alerts + rule-based anomaly
// flags. Both write to the Notification model (extended in Stage 5 with
// exactly these types) rather than a parallel alerts table.
//
// Deliberately read-only / advisory: NEVER takes an automatic irreversible
// action (Phase 8's explicit rule) — every alert here is informational,
// surfaced to admins/managers to act on manually.
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Notification = require('../models/Notification');

const LARGE_EXPENSE_THRESHOLD = 50000;
const UNUSUAL_DISCOUNT_PERCENT = 30;

async function notifyAdmins({ organizationId, branchId, type, message, relatedEntityType, relatedEntityId }) {
  const admins = await User.find({ organizationId, role: { $in: ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'] }, isActive: true });
  const notifications = admins.map((u) => ({ organizationId, branchId, user: u._id, type, message, relatedEntityType, relatedEntityId }));
  if (notifications.length) await Notification.insertMany(notifications);
  return notifications.length;
}

async function checkInventoryAlerts({ organizationId, branchId }) {
  let count = 0;
  const medicines = await Medicine.find({ organizationId, isActive: true });
  for (const med of medicines) {
    const batches = await Batch.find({ organizationId, branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);

    if (currentStock === 0) {
      count += await notifyAdmins({ organizationId, branchId, type: 'CRITICAL_STOCK', message: `${med.name} is out of stock`, relatedEntityType: 'Medicine', relatedEntityId: med._id });
    } else if (currentStock <= med.minimumStockLevel) {
      count += await notifyAdmins({ organizationId, branchId, type: 'LOW_STOCK', message: `${med.name} is at or below minimum stock level (${currentStock}/${med.minimumStockLevel})`, relatedEntityType: 'Medicine', relatedEntityId: med._id });
    }

    const near = batches.find((b) => b.quantity > 0 && (b.expiryDate - Date.now()) / 86400000 <= 60);
    if (near) {
      count += await notifyAdmins({ organizationId, branchId, type: 'EXPIRY_RISK', message: `${med.name} batch ${near.batchNumber} expires within 60 days`, relatedEntityType: 'Batch', relatedEntityId: near._id });
    }
  }
  return count;
}

async function checkCustomerAlerts({ organizationId, branchId }) {
  let count = 0;
  const customers = await Customer.find({ organizationId, isActive: true, outstandingBalance: { $gt: 0 } });
  for (const c of customers) {
    if (c.creditLimit > 0 && c.outstandingBalance >= c.creditLimit) {
      count += await notifyAdmins({ organizationId, branchId, type: 'CREDIT_LIMIT_RISK', message: `${c.name} has reached/exceeded their credit limit (₹${c.outstandingBalance}/₹${c.creditLimit})`, relatedEntityType: 'Customer', relatedEntityId: c._id });
    } else if (c.outstandingBalance >= 10000) {
      count += await notifyAdmins({ organizationId, branchId, type: 'HIGH_OUTSTANDING', message: `${c.name} has high outstanding balance: ₹${c.outstandingBalance}`, relatedEntityType: 'Customer', relatedEntityId: c._id });
    }
  }
  return count;
}

async function checkExpenseAlerts({ organizationId, branchId }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const large = await Expense.find({ organizationId, branchId, status: 'RECORDED', amount: { $gte: LARGE_EXPENSE_THRESHOLD }, createdAt: { $gte: since } });
  let count = 0;
  for (const e of large) {
    count += await notifyAdmins({ organizationId, branchId, type: 'LARGE_EXPENSE', message: `Large expense recorded: ₹${e.amount} (${e.description || 'no description'})`, relatedEntityType: 'Expense', relatedEntityId: e._id });
  }
  return count;
}

async function checkSalesDropAlert({ organizationId, branchId, windowDays = 7 }) {
  const now = Date.now();
  const currentStart = new Date(now - windowDays * 86400000);
  const priorStart = new Date(now - windowDays * 2 * 86400000);

  const [currentSales, priorSales] = await Promise.all([
    Sale.find({ organizationId, branchId, status: { $ne: 'CANCELLED' }, saleDate: { $gte: currentStart } }),
    Sale.find({ organizationId, branchId, status: { $ne: 'CANCELLED' }, saleDate: { $gte: priorStart, $lt: currentStart } }),
  ]);
  const currentTotal = currentSales.reduce((s, sale) => s + sale.grandTotal, 0);
  const priorTotal = priorSales.reduce((s, sale) => s + sale.grandTotal, 0);

  if (priorTotal > 0 && currentTotal < priorTotal * 0.7) {
    const dropPercent = (((priorTotal - currentTotal) / priorTotal) * 100).toFixed(1);
    await notifyAdmins({ organizationId, branchId, type: 'SALES_DROP', message: `Sales dropped ${dropPercent}% vs the previous ${windowDays}-day period (₹${currentTotal.toFixed(0)} vs ₹${priorTotal.toFixed(0)})` });
    return 1;
  }
  return 0;
}

async function checkAnomalies({ organizationId, branchId }) {
  let count = 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const sales = await Sale.find({ organizationId, branchId, saleDate: { $gte: since }, status: { $ne: 'CANCELLED' } });
  for (const sale of sales) {
    const discountPercent = sale.subtotal > 0 ? (sale.totalDiscount / sale.subtotal) * 100 : 0;
    if (discountPercent >= UNUSUAL_DISCOUNT_PERCENT) {
      count += await notifyAdmins({ organizationId, branchId, type: 'REVIEW_REQUIRED', message: `Sale ${sale.saleNumber} has an unusually high discount (${discountPercent.toFixed(0)}%) — review required`, relatedEntityType: 'Sale', relatedEntityId: sale._id });
    }
  }

  const patterns = [
    { action: 'INVOICE_CANCELLED', threshold: 3, label: 'repeated invoice cancellations' },
    { action: 'STOCK_ADJUSTMENT', threshold: 5, label: 'repeated stock adjustments' },
    { action: 'LOGIN_FAILED', threshold: 5, label: 'multiple failed logins' },
  ];
  for (const p of patterns) {
    const grouped = await AuditLog.aggregate([
      { $match: { organizationId, branchId, action: p.action, createdAt: { $gte: since } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $match: { count: { $gte: p.threshold } } },
    ]);
    for (const g of grouped) {
      count += await notifyAdmins({ organizationId, branchId, type: 'REVIEW_REQUIRED', message: `${p.label} detected (${g.count} in 24h) — review required`, relatedEntityType: 'User', relatedEntityId: g._id });
    }
  }

  return count;
}

async function runAllChecks({ organizationId, branchId }) {
  const [inventory, customers, expenses, salesDrop, anomalies] = await Promise.all([
    checkInventoryAlerts({ organizationId, branchId }),
    checkCustomerAlerts({ organizationId, branchId }),
    checkExpenseAlerts({ organizationId, branchId }),
    checkSalesDropAlert({ organizationId, branchId }),
    checkAnomalies({ organizationId, branchId }),
  ]);
  return { inventory, customers, expenses, salesDrop, anomalies, total: inventory + customers + expenses + salesDrop + anomalies };
}

module.exports = { runAllChecks };
