const asyncHandler = require('express-async-handler');
const WhatsAppOrder = require('../models/WhatsAppOrder');
const Customer = require('../models/Customer');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Counter = require('../models/Counter');
const { normalizePhone } = require('../utils/phone');
const { convertOrderToSale } = require('../services/orderConversionService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// GET /api/whatsapp/availability?medicineId=&quantity=
// Read-only stock check — NEVER reserves or deducts anything. Used while
// building/confirming an order.
const checkAvailability = asyncHandler(async (req, res) => {
  const { medicineId, quantity } = req.query;
  const qty = Number(quantity) || 1;
  const batches = await Batch.find({ organizationId: req.organizationId, branchId: req.branchId, medicine: medicineId, isActive: true, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
  const totalAvailable = batches.reduce((sum, b) => sum + (b.quantity - (b.reservedQuantity || 0)), 0);
  const nearExpiryWindowMs = 60 * 24 * 60 * 60 * 1000;
  const hasNearExpiry = batches.some((b) => new Date(b.expiryDate) - Date.now() < nearExpiryWindowMs);

  let status = 'AVAILABLE';
  if (totalAvailable === 0) status = 'OUT_OF_STOCK';
  else if (totalAvailable < qty) status = 'LOW_STOCK';
  else if (hasNearExpiry) status = 'NEAR_EXPIRY';

  return sendSuccess(res, { data: { status, totalAvailable, suggestedBatch: batches[0] || null } });
});

// POST /api/whatsapp/orders
// Creating an order NEVER deducts stock — items are PENDING until a staff
// member confirms them (assigning a batch) and later converts to a Sale.
const create = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.phoneNumber || !body.customerName) return sendError(res, { statusCode: 400, message: 'phoneNumber and customerName are required' });
  if (!Array.isArray(body.items) || body.items.length === 0) return sendError(res, { statusCode: 400, message: 'At least one item is required' });

  const phone = normalizePhone(body.phoneNumber);
  let customer = await Customer.findOne({ organizationId: req.organizationId, mobile: phone });
  if (!customer) {
    customer = await Customer.create({ organizationId: req.organizationId, name: body.customerName, mobile: phone, address: body.deliveryAddress || '', createdBy: req.user._id });
  }

  const items = [];
  for (const raw of body.items) {
    const medicine = await Medicine.findOne({ _id: raw.medicine, organizationId: req.organizationId });
    if (!medicine) return sendError(res, { statusCode: 404, message: `Medicine ${raw.medicine} not found` });
    items.push({
      medicine: medicine._id,
      medicineName: medicine.name,
      quantity: raw.quantity,
      mrp: raw.mrp,
      sellingPrice: raw.sellingPrice,
      discount: raw.discount || 0,
      gst: raw.gst || medicine.gstRate,
      finalPrice: raw.finalPrice,
    });
  }

  const subtotal = items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
  const discount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
  const gst = items.reduce((sum, i) => sum + (i.gst || 0), 0);
  const grandTotal = items.reduce((sum, i) => sum + i.finalPrice, 0) + (body.deliveryCharge || 0);

  const seq = await Counter.nextSequence(req.organizationId, 'WHATSAPP_ORDER');
  const orderNumber = `WA-${String(seq).padStart(6, '0')}`;

  const order = await WhatsAppOrder.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    orderNumber,
    customer: customer._id,
    phoneNumber: phone,
    customerName: body.customerName,
    orderType: body.orderType || 'STORE_COUNTER',
    items,
    subtotal,
    discount,
    gst,
    deliveryCharge: body.deliveryCharge || 0,
    grandTotal,
    deliveryAddress: body.deliveryAddress || '',
    deliveryPhone: body.deliveryPhone || phone,
    orderNotes: body.orderNotes || '',
    createdBy: req.user._id,
  });
  order.pushTimeline('CREATED', req.user, 'Order created');
  await order.save();

  await logAction({ req, action: 'WHATSAPP_ORDER_CREATED', entityType: 'WhatsAppOrder', entityId: order._id, description: `WhatsApp order ${orderNumber} created for ${customer.name}` });
  return sendSuccess(res, { statusCode: 201, data: order });
});

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (status) filter.orderStatus = status;
  const orders = await WhatsAppOrder.find(filter).populate('customer', 'name mobile').sort({ createdAt: -1 });
  return sendSuccess(res, { data: orders });
});

const getOne = asyncHandler(async (req, res) => {
  const order = await WhatsAppOrder.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('customer').populate('items.medicine', 'name');
  if (!order) return sendError(res, { statusCode: 404, message: 'Order not found' });
  return sendSuccess(res, { data: order });
});

// PATCH /api/whatsapp/orders/:id/status
const updateStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await WhatsAppOrder.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!order) return sendError(res, { statusCode: 404, message: 'Order not found' });
  if (!order.canTransitionTo(status)) {
    return sendError(res, { statusCode: 400, message: `Cannot transition order from ${order.orderStatus} to ${status}` });
  }
  order.orderStatus = status;
  order.updatedBy = req.user._id;
  order.pushTimeline(`STATUS_${status}`, req.user, note);
  await order.save();

  await logAction({ req, action: 'WHATSAPP_ORDER_STATUS_CHANGED', entityType: 'WhatsAppOrder', entityId: order._id, description: `Order ${order.orderNumber} -> ${status}` });
  return sendSuccess(res, { data: order });
});

// PATCH /api/whatsapp/orders/:id/confirm-item
// Staff assigns a real batch to an item (the point where stock gets
// checked against a concrete batch, still without deducting anything).
const confirmItem = asyncHandler(async (req, res) => {
  const { itemId, batchId } = req.body;
  const order = await WhatsAppOrder.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!order) return sendError(res, { statusCode: 404, message: 'Order not found' });
  const item = order.items.id(itemId);
  if (!item) return sendError(res, { statusCode: 404, message: 'Order item not found' });

  const batch = await Batch.findOne({ _id: batchId, organizationId: req.organizationId, branchId: req.branchId, medicine: item.medicine });
  if (!batch) return sendError(res, { statusCode: 404, message: 'Batch not found for this medicine' });
  const available = batch.quantity - (batch.reservedQuantity || 0);
  item.availability = available === 0 ? 'OUT_OF_STOCK' : available < item.quantity ? 'LOW_STOCK' : 'AVAILABLE';
  item.batch = batch._id;
  item.itemStatus = available >= item.quantity ? 'CONFIRMED' : 'UNAVAILABLE';
  await order.save();

  return sendSuccess(res, { data: order });
});

// POST /api/whatsapp/orders/:id/convert — the only place stock actually moves.
const convert = asyncHandler(async (req, res) => {
  const order = await WhatsAppOrder.findOne({ _id: req.params.id, organizationId: req.organizationId, branchId: req.branchId });
  if (!order) return sendError(res, { statusCode: 404, message: 'Order not found' });

  try {
    const sale = await convertOrderToSale(order, { userId: req.user._id });
    await logAction({ req, action: 'WHATSAPP_ORDER_CONVERTED', entityType: 'WhatsAppOrder', entityId: order._id, description: `Order ${order.orderNumber} converted to sale ${sale.saleNumber}` });
    return sendSuccess(res, { message: 'Order converted to sale', data: { sale } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { checkAvailability, create, list, getOne, updateStatus, confirmItem, convert };
