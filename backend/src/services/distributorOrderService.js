// Phase 10 — distributor ordering workflow (requirement 7).
const DistributorOrder = require('../models/DistributorOrder');
const { sendOrderToDistributor } = require('./distributorApiAdapter');

function computeTotalEstimatedValue(items) {
  return Math.round(items.reduce((sum, i) => sum + i.requestedQuantity * i.unitPrice, 0) * 100) / 100;
}

/**
 * Send a PENDING order: tries the configured distributor API (if any), and
 * falls back to "manual" mode (still marks SENT — meaning "ready to be
 * placed by phone/email/portal", not that an API call succeeded) when no
 * API is configured. Only stays PENDING if an API *is* configured but the
 * call actually failed, so a real integration failure is visible and
 * retryable rather than silently treated as sent.
 */
async function sendOrder({ order, supplier, userId }) {
  const result = await sendOrderToDistributor(supplier, order);

  if (result.mode === 'ERROR') {
    order.lastApiError = result.message;
    order.statusHistory.push({ status: order.status, changedAt: new Date(), changedBy: userId, notes: `Send failed: ${result.message}` });
    await order.save();
    return { order, apiResult: result };
  }

  order.status = 'SENT';
  order.sentAt = new Date();
  order.lastApiError = null;
  if (result.externalOrderReference) order.externalOrderReference = result.externalOrderReference;
  order.statusHistory.push({ status: 'SENT', changedAt: new Date(), changedBy: userId, notes: result.mode === 'API' ? 'Sent via distributor API' : 'Marked sent (manual/offline order placement)' });
  await order.save();
  return { order, apiResult: result };
}

/** Manual status transition — accept/reject/partial/fulfill/cancel, until a real distributor webhook exists. */
async function updateStatus({ orderId, organizationId, status, notes, userId }) {
  const order = await DistributorOrder.findOne({ _id: orderId, organizationId });
  if (!order) throw Object.assign(new Error('Distributor order not found'), { statusCode: 404 });

  const validTransitions = {
    PENDING: ['SENT', 'CANCELLED'],
    SENT: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'],
    PARTIALLY_FULFILLED: ['FULFILLED', 'CANCELLED'],
    REJECTED: [],
    FULFILLED: [],
    CANCELLED: [],
  };
  if (!validTransitions[order.status]?.includes(status)) {
    throw Object.assign(new Error(`Cannot move a ${order.status} order to ${status}`), { statusCode: 400 });
  }

  order.status = status;
  order.respondedAt = ['ACCEPTED', 'REJECTED'].includes(status) ? new Date() : order.respondedAt;
  order.statusHistory.push({ status, changedAt: new Date(), changedBy: userId, notes: notes || '' });
  await order.save();
  return order;
}

/**
 * Called when a Purchase is created with a `distributorOrder` reference —
 * updates fulfilledQuantity per line and rolls the order status forward to
 * PARTIALLY_FULFILLED or FULFILLED once goods are actually received. Does
 * NOT create the Purchase itself (that's still the normal purchase flow) —
 * this only closes the loop on the order this purchase was placed against.
 */
async function recordFulfillment({ orderId, organizationId, purchasedItems, session }) {
  const order = await DistributorOrder.findOne({ _id: orderId, organizationId }).session(session || null);
  if (!order) return null;

  for (const line of purchasedItems) {
    const item = order.items.find((i) => String(i.medicine) === String(line.medicineId));
    if (item) item.fulfilledQuantity = (item.fulfilledQuantity || 0) + line.quantity;
  }

  const allFulfilled = order.items.every((i) => i.fulfilledQuantity >= i.requestedQuantity);
  const anyFulfilled = order.items.some((i) => i.fulfilledQuantity > 0);
  if (allFulfilled) order.status = 'FULFILLED';
  else if (anyFulfilled) order.status = 'PARTIALLY_FULFILLED';

  await order.save({ session });
  return order;
}

module.exports = { computeTotalEstimatedValue, sendOrder, updateStatus, recordFulfillment };
