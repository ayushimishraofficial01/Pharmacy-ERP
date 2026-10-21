// Phase 10 — generate/approve/reject reorder suggestions (requirement 15).
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const ReorderSuggestion = require('../models/ReorderSuggestion');
const DistributorOrder = require('../models/DistributorOrder');
const Counter = require('../models/Counter');
const { getAverageDailySales } = require('./salesVelocityService');
const { computeTotalEstimatedValue } = require('./distributorOrderService');

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

/**
 * Regenerate PENDING suggestions for every medicine at/below its reorder
 * level (accounting for stock already on order, so we don't suggest
 * reordering something that's already inbound). Existing PENDING
 * suggestions for a medicine are refreshed in place rather than duplicated;
 * a medicine that's back above its reorder level has its stale PENDING
 * suggestion cleared automatically.
 */
async function generateSuggestions({ organizationId, branchId }) {
  const medicines = await Medicine.find({ organizationId, isActive: true }).populate('defaultSupplier', 'supplierName isDistributor');
  const onOrderByMedicine = await getOnOrderQuantities({ organizationId, branchId });
  const created = [];

  for (const med of medicines) {
    const batches = await Batch.find({ organizationId, branchId, medicine: med._id, isActive: true });
    const currentStock = batches.reduce((s, b) => s + b.quantity, 0);
    const onOrder = onOrderByMedicine.get(String(med._id)) || 0;

    if (currentStock + onOrder > med.reorderLevel) {
      // No longer needs reordering — clear any stale pending suggestion.
      await ReorderSuggestion.deleteMany({ organizationId, branchId, medicine: med._id, status: 'PENDING' });
      continue;
    }

    const avgDailySales = await getAverageDailySales({ organizationId, branchId, medicineId: med._id, days: 30 });
    const leadTimeDemand = Math.ceil(avgDailySales * med.leadTimeDays);
    const suggestedQuantity = Math.max(med.reorderQuantity, leadTimeDemand + med.safetyStock - currentStock - onOrder, 1);

    const reasons = [];
    if (currentStock === 0) reasons.push('Out of stock');
    else if (currentStock <= med.minimumStockLevel) reasons.push('At or below minimum stock level');
    else reasons.push('At or below reorder level');
    if (onOrder > 0) reasons.push(`${onOrder} already on order`);
    if (avgDailySales > 0) reasons.push(`Selling ~${avgDailySales.toFixed(1)}/day, lead time ${med.leadTimeDays} day(s)`);

    const suggestion = await ReorderSuggestion.findOneAndUpdate(
      { organizationId, branchId, medicine: med._id, status: 'PENDING' },
      {
        organizationId,
        branchId,
        medicine: med._id,
        currentStock,
        onOrder,
        averageDailySales: Number(avgDailySales.toFixed(2)),
        leadTimeDays: med.leadTimeDays,
        safetyStock: med.safetyStock,
        suggestedQuantity,
        reason: reasons.join('; '),
        preferredSupplier: med.defaultSupplier?._id || null,
        generatedAt: new Date(),
      },
      { new: true, upsert: true }
    );
    created.push(suggestion);
  }

  return created;
}

/**
 * Approve a suggestion. Never auto-creates a Purchase (goods haven't
 * arrived yet — that's still the normal purchase-receiving flow). Can
 * optionally open a DistributorOrder immediately if the preferred supplier
 * is a distributor and the caller asks for it — otherwise approval is just
 * a recorded decision for someone to act on manually.
 */
async function approveSuggestion({ suggestionId, organizationId, approvedQuantity, decisionNotes, userId, createDistributorOrder }) {
  const suggestion = await ReorderSuggestion.findOne({ _id: suggestionId, organizationId });
  if (!suggestion) throw Object.assign(new Error('Reorder suggestion not found'), { statusCode: 404 });
  if (suggestion.status !== 'PENDING') throw Object.assign(new Error(`Suggestion is already ${suggestion.status}`), { statusCode: 400 });

  suggestion.status = 'APPROVED';
  suggestion.approvedQuantity = approvedQuantity || suggestion.suggestedQuantity;
  suggestion.decidedBy = userId;
  suggestion.decidedAt = new Date();
  suggestion.decisionNotes = decisionNotes || '';

  if (createDistributorOrder && suggestion.preferredSupplier) {
    const medicine = await Medicine.findById(suggestion.medicine);
    const items = [{ medicine: medicine._id, medicineNameSnapshot: medicine.name, distributorProductCode: '', requestedQuantity: suggestion.approvedQuantity, unitPrice: 0 }];
    const seq = await Counter.nextSequence(organizationId, 'DISTRIBUTOR_ORDER');
    const order = await DistributorOrder.create({
      organizationId,
      branchId: suggestion.branchId,
      orderNumber: `DO-${String(seq).padStart(6, '0')}`,
      supplier: suggestion.preferredSupplier,
      items,
      totalEstimatedValue: computeTotalEstimatedValue(items),
      notes: `Auto-created from approved reorder suggestion for "${medicine.name}"`,
      statusHistory: [{ status: 'PENDING', changedAt: new Date(), changedBy: userId, notes: 'Created from approved reorder suggestion' }],
      createdBy: userId,
    });
    suggestion.distributorOrder = order._id;
    suggestion.status = 'ORDERED';
  }

  await suggestion.save();
  return suggestion;
}

async function rejectSuggestion({ suggestionId, organizationId, decisionNotes, userId }) {
  const suggestion = await ReorderSuggestion.findOne({ _id: suggestionId, organizationId });
  if (!suggestion) throw Object.assign(new Error('Reorder suggestion not found'), { statusCode: 404 });
  if (suggestion.status !== 'PENDING') throw Object.assign(new Error(`Suggestion is already ${suggestion.status}`), { statusCode: 400 });

  suggestion.status = 'REJECTED';
  suggestion.decidedBy = userId;
  suggestion.decidedAt = new Date();
  suggestion.decisionNotes = decisionNotes || '';
  await suggestion.save();
  return suggestion;
}

module.exports = { generateSuggestions, approveSuggestion, rejectSuggestion };
