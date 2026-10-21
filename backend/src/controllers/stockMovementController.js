const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const SaleItem = require('../models/SaleItem');
const Sale = require('../models/Sale');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/stock-movement/report?days=90
// Phase 8 section 11: Slow Moving / Dead Stock / Fast Moving classification
// based on sales velocity over a trailing window.
const report = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 90;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sales = await Sale.find({ organizationId: req.organizationId, branchId: req.branchId, status: { $ne: 'CANCELLED' }, saleDate: { $gte: since } }).select('_id saleDate');
  const saleIds = sales.map((s) => s._id);
  const saleDateById = Object.fromEntries(sales.map((s) => [String(s._id), s.saleDate]));

  const saleItems = await SaleItem.find({ organizationId: req.organizationId, sale: { $in: saleIds } });

  const soldByMedicine = {};
  const lastSaleByMedicine = {};
  for (const item of saleItems) {
    const key = String(item.medicine);
    soldByMedicine[key] = (soldByMedicine[key] || 0) + item.quantity;
    const saleDate = saleDateById[String(item.sale)];
    if (saleDate && (!lastSaleByMedicine[key] || saleDate > lastSaleByMedicine[key])) {
      lastSaleByMedicine[key] = saleDate;
    }
  }

  const medicines = await Medicine.find({ organizationId: req.organizationId, isActive: true });
  const results = [];

  for (const med of medicines) {
    const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true, quantity: { $gt: 0 } });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    if (currentStock === 0) continue;

    const stockValue = batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0);
    const unitsSold = soldByMedicine[String(med._id)] || 0;
    const salesVelocity = unitsSold / days; // units/day
    const lastSaleDate = lastSaleByMedicine[String(med._id)] || null;

    let classification;
    let suggestedAction;
    if (unitsSold === 0) {
      classification = 'DEAD_STOCK';
      suggestedAction = 'No sales in the period — consider a clearance discount, return-to-supplier, or write-off after checking expiry';
    } else if (salesVelocity < currentStock / (days * 3)) {
      // Selling slowly enough that, at current velocity, more than 3x the
      // window would be needed to clear existing stock.
      classification = 'SLOW_MOVING';
      suggestedAction = 'Reduce reorder quantity; consider a bundled promotion';
    } else {
      classification = 'FAST_MOVING';
      suggestedAction = 'Maintain or increase reorder quantity to avoid stockouts';
    }

    results.push({
      medicine: { _id: med._id, name: med.name, medicineCode: med.medicineCode },
      currentStock,
      salesVelocity: Number(salesVelocity.toFixed(3)),
      stockValue: Number(stockValue.toFixed(2)),
      lastSaleDate,
      classification,
      suggestedAction,
    });
  }

  return sendSuccess(res, {
    data: {
      period: { days },
      slowMoving: results.filter((r) => r.classification === 'SLOW_MOVING'),
      deadStock: results.filter((r) => r.classification === 'DEAD_STOCK'),
      fastMoving: results.filter((r) => r.classification === 'FAST_MOVING'),
    },
  });
});

module.exports = { report };
