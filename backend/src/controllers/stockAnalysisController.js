// Phase 10 — advanced stock analysis (requirement 13) and fast/slow/
// non-moving/dead-stock classification (requirement 14).
const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const BusinessSettings = require('../models/BusinessSettings');
const { getAverageDailySales, getAveragePurchaseVelocity, getLastSaleDate } = require('../services/salesVelocityService');
const { classifyMovement, DEFAULT_THRESHOLDS } = require('../services/stockMovementService');
const { sendSuccess } = require('../utils/apiResponse');

async function buildMedicineFilter(req) {
  const { medicine, category, manufacturer, supplier } = req.query;
  const filter = { organizationId: req.organizationId, isActive: true };
  if (medicine) filter._id = medicine;
  if (category) filter.category = category;
  if (manufacturer) filter.manufacturer = manufacturer;
  if (supplier) filter.defaultSupplier = supplier;
  return filter;
}

// GET /api/stock-analysis/report?medicine=&category=&manufacturer=&supplier=&days=30
// Requirement 13: current stock, average daily sales, days of stock, stock
// coverage, stock value, sales velocity, purchase velocity, recommended
// order quantity — filterable by medicine/category/manufacturer/supplier
// (branch is always scoped to the authenticated branch; date range controls
// the velocity window).
const report = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const filter = await buildMedicineFilter(req);
  const medicines = await Medicine.find(filter).populate('category', 'name').populate('manufacturer', 'name');

  const rows = [];
  for (const med of medicines) {
    const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    const stockValueAtCost = Number(batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0).toFixed(2));
    const stockValueAtMrp = Number(batches.reduce((s, b) => s + b.quantity * b.mrp, 0).toFixed(2));

    const avgDailySales = await getAverageDailySales({ organizationId: req.organizationId, branchId: req.branchId, medicineId: med._id, days });
    const avgDailyPurchases = await getAveragePurchaseVelocity({ organizationId: req.organizationId, branchId: req.branchId, medicineId: med._id, days });
    // "Days of stock" / "stock coverage" — how many days current stock will
    // last at the current sales rate. Null (not Infinity) when there's no
    // sales velocity to divide by, since Infinity doesn't serialize to JSON.
    const daysOfStock = avgDailySales > 0 ? Number((currentStock / avgDailySales).toFixed(1)) : null;

    const leadTimeDemand = Math.ceil(avgDailySales * med.leadTimeDays);
    const recommendedOrderQuantity = currentStock <= med.reorderLevel ? Math.max(med.reorderQuantity, leadTimeDemand + med.safetyStock - currentStock, 0) : 0;

    rows.push({
      medicine: { _id: med._id, name: med.name, medicineCode: med.medicineCode },
      category: med.category?.name || null,
      manufacturer: med.manufacturer?.name || null,
      currentStock,
      stockValueAtCost,
      stockValueAtMrp,
      averageDailySales: Number(avgDailySales.toFixed(2)),
      averageDailyPurchases: Number(avgDailyPurchases.toFixed(2)),
      daysOfStock,
      stockCoverageDays: daysOfStock, // same figure, named per requirement 13's separate "stock coverage" wording
      recommendedOrderQuantity,
    });
  }

  return sendSuccess(res, { data: rows });
});

// GET /api/stock-analysis/movement?days=30
// Requirement 14: classify every active medicine as fast/normal/slow/
// non-moving/dead-stock, using the org's configured thresholds.
const movement = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const filter = await buildMedicineFilter(req);
  const medicines = await Medicine.find(filter);

  const settings = await BusinessSettings.findOne({ organizationId: req.organizationId, branchId: req.branchId });
  const thresholds = settings?.stockMovementThresholds || {};

  const rows = [];
  for (const med of medicines) {
    const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    if (currentStock <= 0) continue; // classification is for stock sitting on the shelf right now

    const avgDailySales = await getAverageDailySales({ organizationId: req.organizationId, branchId: req.branchId, medicineId: med._id, days });
    const lastSaleDate = await getLastSaleDate({ organizationId: req.organizationId, branchId: req.branchId, medicineId: med._id });
    const daysSinceLastSale = lastSaleDate ? Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / (24 * 60 * 60 * 1000)) : null;

    const classification = classifyMovement({ avgDailySales, daysSinceLastSale }, thresholds);
    const stockValueAtCost = Number(batches.reduce((s, b) => s + b.quantity * b.purchaseRate, 0).toFixed(2));

    rows.push({
      medicine: { _id: med._id, name: med.name, medicineCode: med.medicineCode },
      currentStock,
      averageDailySales: Number(avgDailySales.toFixed(2)),
      daysSinceLastSale,
      stockValueAtCost,
      classification,
    });
  }

  // Dashboard widget summary: count + value tied up per classification.
  const summary = {};
  for (const key of ['FAST_MOVING', 'NORMAL', 'SLOW_MOVING', 'NON_MOVING', 'DEAD_STOCK']) {
    const inClass = rows.filter((r) => r.classification === key);
    summary[key] = { count: inClass.length, stockValueAtCost: Number(inClass.reduce((s, r) => s + r.stockValueAtCost, 0).toFixed(2)) };
  }

  return sendSuccess(res, { data: { summary, items: rows, thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds } } });
});

// PUT /api/stock-analysis/movement/thresholds  { fastMovingVelocity?, slowMovingVelocity?, nonMovingDays?, deadStockDays? }
const updateThresholds = asyncHandler(async (req, res) => {
  const { fastMovingVelocity, slowMovingVelocity, nonMovingDays, deadStockDays } = req.body;
  const update = {};
  if (fastMovingVelocity !== undefined) update['stockMovementThresholds.fastMovingVelocity'] = Number(fastMovingVelocity);
  if (slowMovingVelocity !== undefined) update['stockMovementThresholds.slowMovingVelocity'] = Number(slowMovingVelocity);
  if (nonMovingDays !== undefined) update['stockMovementThresholds.nonMovingDays'] = Number(nonMovingDays);
  if (deadStockDays !== undefined) update['stockMovementThresholds.deadStockDays'] = Number(deadStockDays);

  const settings = await BusinessSettings.findOneAndUpdate({ organizationId: req.organizationId, branchId: req.branchId }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true });
  return sendSuccess(res, { data: settings.stockMovementThresholds });
});

module.exports = { report, movement, updateThresholds };
