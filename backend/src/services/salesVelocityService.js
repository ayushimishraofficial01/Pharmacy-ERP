// Phase 10 — shared sales/purchase velocity helpers (requirements 13, 14, 15).
// getAverageDailySales was originally defined inline in
// inventoryAutomationController.js (Phase 8) — extracted here so the new
// stock-analysis and fast/slow-moving reports can reuse the exact same
// calculation instead of a second, possibly-drifting copy.
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const StockTransaction = require('../models/StockTransaction');

async function getAverageDailySales({ organizationId, branchId, medicineId, days = 30 }) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sales = await Sale.find({ organizationId, branchId, status: { $ne: 'CANCELLED' }, saleDate: { $gte: since } }).select('_id');
  const saleIds = sales.map((s) => s._id);
  const items = await SaleItem.find({ organizationId, medicine: medicineId, sale: { $in: saleIds } });
  const totalSold = items.reduce((sum, i) => sum + i.quantity, 0);
  return totalSold / days;
}

/** Average units purchased per day over the trailing window — requirement 13's "purchase velocity". */
async function getAveragePurchaseVelocity({ organizationId, branchId, medicineId, days = 30 }) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await StockTransaction.aggregate([
    { $match: { organizationId, branchId, medicine: medicineId, transactionType: 'PURCHASE', createdAt: { $gte: since } } },
    { $group: { _id: null, totalPurchased: { $sum: '$quantity' } } },
  ]);
  const totalPurchased = rows[0]?.totalPurchased || 0;
  return totalPurchased / days;
}

/** Most recent sale date for a medicine, or null if it has never sold (branch-scoped). Used for non-moving/dead-stock classification. */
async function getLastSaleDate({ organizationId, branchId, medicineId }) {
  const rows = await SaleItem.aggregate([
    { $match: { organizationId, medicine: medicineId } },
    { $lookup: { from: 'sales', localField: 'sale', foreignField: '_id', as: 'saleDoc' } },
    { $unwind: '$saleDoc' },
    { $match: { 'saleDoc.branchId': branchId, 'saleDoc.status': { $ne: 'CANCELLED' } } },
    { $sort: { 'saleDoc.saleDate': -1 } },
    { $limit: 1 },
    { $project: { _id: 0, saleDate: '$saleDoc.saleDate' } },
  ]);
  return rows[0]?.saleDate || null;
}

module.exports = { getAverageDailySales, getAveragePurchaseVelocity, getLastSaleDate };
