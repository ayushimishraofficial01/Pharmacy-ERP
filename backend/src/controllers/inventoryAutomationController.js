const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const DistributorOrder = require('../models/DistributorOrder');
const { getAverageDailySales } = require('../services/salesVelocityService');
const { sendSuccess } = require('../utils/apiResponse');

// Phase 10: sum of requestedQuantity - fulfilledQuantity across every open
// distributor order, grouped by medicine — closes the "onOrder: 0, Stage 9
// doesn't track open POs" gap the original Phase 8 comment called out.
async function getOnOrderQuantities({ organizationId, branchId }) {
  const orders = await DistributorOrder.find({ organizationId, branchId, status: { $in: ['PENDING', 'SENT', 'ACCEPTED', 'PARTIALLY_FULFILLED'] } });
  const byMedicine = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const key = String(item.medicine);
      const outstanding = Math.max(0, item.requestedQuantity - (item.fulfilledQuantity || 0));
      byMedicine.set(key, (byMedicine.get(key) || 0) + outstanding);
    }
  }
  return byMedicine;
}

// GET /api/inventory-automation/status
// Phase 8 section 2: current/reserved/available/on-order/suggested-reorder
// per medicine.
const status = asyncHandler(async (req, res) => {
  const medicines = await Medicine.find({ organizationId: req.organizationId, isActive: true });
  const onOrderByMedicine = await getOnOrderQuantities({ organizationId: req.organizationId, branchId: req.branchId });
  const results = [];

  for (const med of medicines) {
    const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    const reservedStock = batches.reduce((s, b) => s + (b.reservedQuantity || 0), 0);
    const availableStock = Math.max(0, currentStock - reservedStock);
    const onOrder = onOrderByMedicine.get(String(med._id)) || 0;

    let suggestedReorderQuantity = 0;
    if (currentStock + onOrder <= med.reorderLevel) {
      suggestedReorderQuantity = Math.max(med.reorderQuantity, med.minimumStockLevel + med.safetyStock - currentStock - onOrder);
    }

    results.push({
      medicine: { _id: med._id, name: med.name, medicineCode: med.medicineCode },
      currentStock,
      reservedStock,
      availableStock,
      onOrder,
      minimumStockLevel: med.minimumStockLevel,
      maximumStockLevel: med.maximumStockLevel,
      reorderLevel: med.reorderLevel,
      reorderQuantity: med.reorderQuantity,
      safetyStock: med.safetyStock,
      leadTimeDays: med.leadTimeDays,
      suggestedReorderQuantity,
      belowReorderLevel: currentStock + onOrder <= med.reorderLevel,
    });
  }

  return sendSuccess(res, { data: results });
});

// GET /api/inventory-automation/smart-reorder
// Phase 8 section 3: purchase RECOMMENDATIONS only — never auto-creates a
// PO. User must approve (i.e. manually create the Purchase via Stage 3's
// existing endpoint) after reviewing this list.
const smartReorder = asyncHandler(async (req, res) => {
  const medicines = await Medicine.find({ organizationId: req.organizationId, isActive: true }).populate('defaultSupplier', 'supplierName supplierCode');
  const recommendations = [];

  for (const med of medicines) {
    const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    if (currentStock > med.reorderLevel) continue;

    const avgDailySales = await getAverageDailySales({ organizationId: req.organizationId, branchId: req.branchId, medicineId: med._id, days: 30 });
    const leadTimeDemand = Math.ceil(avgDailySales * med.leadTimeDays);
    const suggestedQuantity = Math.max(med.reorderQuantity, leadTimeDemand + med.safetyStock - currentStock, 1);

    const reasons = [];
    if (currentStock === 0) reasons.push('Out of stock');
    else if (currentStock <= med.minimumStockLevel) reasons.push('At or below minimum stock level');
    else reasons.push('At or below reorder level');
    if (avgDailySales > 0) reasons.push(`Selling ~${avgDailySales.toFixed(1)}/day, lead time ${med.leadTimeDays} day(s)`);

    recommendations.push({
      medicine: { _id: med._id, name: med.name, medicineCode: med.medicineCode },
      currentStock,
      averageDailySales: Number(avgDailySales.toFixed(2)),
      suggestedQuantity,
      supplier: med.defaultSupplier || null,
      reason: reasons.join('; '),
    });
  }

  return sendSuccess(res, { data: recommendations });
});

module.exports = { status, smartReorder, getAverageDailySales };
