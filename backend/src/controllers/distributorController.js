// Phase 10 — distributor master, catalog, and ordering endpoints (requirement 7).
const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const DistributorProduct = require('../models/DistributorProduct');
const DistributorOrder = require('../models/DistributorOrder');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const { computeTotalEstimatedValue, sendOrder, updateStatus } = require('../services/distributorOrderService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// ---- Distributor master (a flag + config on the existing Supplier model) ----

// GET /api/distributors — suppliers flagged as distributors.
const listDistributors = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({ organizationId: req.organizationId, isDistributor: true, isActive: true }).sort({ supplierName: 1 });
  return sendSuccess(res, { data: suppliers });
});

// PUT /api/distributors/:supplierId/config — mark a supplier as a distributor and set its API config.
const configureDistributor = asyncHandler(async (req, res) => {
  const { isDistributor, baseUrl, apiKeyEnvVar } = req.body;
  const supplier = await Supplier.findOne({ _id: req.params.supplierId, organizationId: req.organizationId });
  if (!supplier) return sendError(res, { statusCode: 404, message: 'Supplier not found' });

  if (isDistributor !== undefined) supplier.isDistributor = isDistributor;
  if (baseUrl !== undefined) supplier.distributorApiConfig.baseUrl = baseUrl || null;
  if (apiKeyEnvVar !== undefined) supplier.distributorApiConfig.apiKeyEnvVar = apiKeyEnvVar || null;
  supplier.distributorApiConfig.integrationStatus = supplier.distributorApiConfig.baseUrl ? 'CONFIGURED' : 'NOT_CONFIGURED';
  supplier.updatedBy = req.user._id;
  await supplier.save();

  await logAction({ req, action: 'DISTRIBUTOR_CONFIGURED', entityType: 'Supplier', entityId: supplier._id, description: `Distributor config updated for "${supplier.supplierName}"` });
  return sendSuccess(res, { data: supplier });
});

// ---- Distributor product catalog ----

const listProducts = asyncHandler(async (req, res) => {
  const { supplier, medicine } = req.query;
  const filter = { organizationId: req.organizationId };
  if (supplier) filter.supplier = supplier;
  if (medicine) filter.medicine = medicine;
  const products = await DistributorProduct.find(filter).populate('supplier', 'supplierName').populate('medicine', 'name medicineCode').sort({ createdAt: -1 });
  return sendSuccess(res, { data: products });
});

const upsertProduct = asyncHandler(async (req, res) => {
  const { supplier, medicine, distributorProductCode, distributorPrice, minOrderQuantity, isAvailable } = req.body;
  if (!supplier || !medicine || distributorPrice === undefined) return sendError(res, { statusCode: 400, message: 'supplier, medicine and distributorPrice are required' });

  const supplierDoc = await Supplier.findOne({ _id: supplier, organizationId: req.organizationId, isDistributor: true });
  if (!supplierDoc) return sendError(res, { statusCode: 400, message: 'Supplier not found or is not flagged as a distributor' });
  const medicineDoc = await Medicine.findOne({ _id: medicine, organizationId: req.organizationId });
  if (!medicineDoc) return sendError(res, { statusCode: 404, message: 'Medicine not found' });

  const product = await DistributorProduct.findOneAndUpdate(
    { organizationId: req.organizationId, supplier, medicine },
    { distributorProductCode: distributorProductCode || '', distributorPrice: Number(distributorPrice), minOrderQuantity: minOrderQuantity ? Number(minOrderQuantity) : 1, isAvailable: isAvailable !== false, createdBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  );

  await logAction({ req, action: 'DISTRIBUTOR_PRODUCT_UPSERTED', entityType: 'DistributorProduct', entityId: product._id, description: `Catalog entry for "${medicineDoc.name}" set for distributor "${supplierDoc.supplierName}"` });
  return sendSuccess(res, { data: product });
});

// ---- Distributor orders ----

const listOrders = asyncHandler(async (req, res) => {
  const { supplier, status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (supplier) filter.supplier = supplier;
  if (status) filter.status = status;
  const orders = await DistributorOrder.find(filter).populate('supplier', 'supplierName').sort({ createdAt: -1 });
  return sendSuccess(res, { data: orders });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await DistributorOrder.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('supplier').populate('items.medicine', 'name medicineCode');
  if (!order) return sendError(res, { statusCode: 404, message: 'Distributor order not found' });
  return sendSuccess(res, { data: order });
});

// POST /api/distributors/orders  { supplier, items: [{ medicine, requestedQuantity, unitPrice?, distributorProductCode? }], notes? }
const createOrder = asyncHandler(async (req, res) => {
  const { supplier: supplierId, items, notes } = req.body;
  if (!supplierId) return sendError(res, { statusCode: 400, message: 'supplier is required' });
  if (!Array.isArray(items) || items.length === 0) return sendError(res, { statusCode: 400, message: 'Order must contain at least one item' });

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: req.organizationId, isDistributor: true, isActive: true });
  if (!supplier) return sendError(res, { statusCode: 400, message: 'Supplier not found, inactive, or not flagged as a distributor' });

  const resolvedItems = [];
  for (const raw of items) {
    if (!raw.medicine || !raw.requestedQuantity) return sendError(res, { statusCode: 400, message: 'Each item requires medicine and requestedQuantity' });
    const medicine = await Medicine.findOne({ _id: raw.medicine, organizationId: req.organizationId });
    if (!medicine) return sendError(res, { statusCode: 404, message: `Medicine ${raw.medicine} not found` });

    let unitPrice = raw.unitPrice;
    let distributorProductCode = raw.distributorProductCode;
    if (unitPrice === undefined) {
      const catalogEntry = await DistributorProduct.findOne({ organizationId: req.organizationId, supplier: supplierId, medicine: raw.medicine });
      if (!catalogEntry) return sendError(res, { statusCode: 400, message: `No price given and no catalog entry found for "${medicine.name}" from this distributor` });
      unitPrice = catalogEntry.distributorPrice;
      distributorProductCode = distributorProductCode || catalogEntry.distributorProductCode;
    }

    resolvedItems.push({ medicine: medicine._id, medicineNameSnapshot: medicine.name, distributorProductCode: distributorProductCode || '', requestedQuantity: Number(raw.requestedQuantity), unitPrice: Number(unitPrice) });
  }

  const seq = await Counter.nextSequence(req.organizationId, 'DISTRIBUTOR_ORDER');
  const orderNumber = `DO-${String(seq).padStart(6, '0')}`;

  const order = await DistributorOrder.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    orderNumber,
    supplier: supplier._id,
    items: resolvedItems,
    totalEstimatedValue: computeTotalEstimatedValue(resolvedItems),
    notes: notes || '',
    statusHistory: [{ status: 'PENDING', changedAt: new Date(), changedBy: req.user._id, notes: 'Order created' }],
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'DISTRIBUTOR_ORDER_CREATED', entityType: 'DistributorOrder', entityId: order._id, description: `Order ${order.orderNumber} created for "${supplier.supplierName}", estimated ${order.totalEstimatedValue}` });
  return sendSuccess(res, { statusCode: 201, data: order });
});

// POST /api/distributors/orders/:id/send
const sendOrderHandler = asyncHandler(async (req, res) => {
  const order = await DistributorOrder.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('supplier');
  if (!order) return sendError(res, { statusCode: 404, message: 'Distributor order not found' });
  if (order.status !== 'PENDING') return sendError(res, { statusCode: 400, message: `Order is already ${order.status}` });

  const { order: updated, apiResult } = await sendOrder({ order, supplier: order.supplier, userId: req.user._id });
  await logAction({ req, action: 'DISTRIBUTOR_ORDER_SENT', entityType: 'DistributorOrder', entityId: updated._id, description: `Order ${updated.orderNumber} send attempted (${apiResult.mode})` });

  if (apiResult.mode === 'ERROR') return sendError(res, { statusCode: 502, message: apiResult.message });
  return sendSuccess(res, { data: updated, message: apiResult.mode === 'API' ? 'Order sent to distributor API' : 'Order marked sent — place it manually (phone/email/portal)' });
});

// PUT /api/distributors/orders/:id/status  { status, notes? }
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!DistributorOrder.ORDER_STATUSES.includes(status)) return sendError(res, { statusCode: 400, message: `status must be one of ${DistributorOrder.ORDER_STATUSES.join(', ')}` });

  try {
    const order = await updateStatus({ orderId: req.params.id, organizationId: req.organizationId, status, notes, userId: req.user._id });
    await logAction({ req, action: 'DISTRIBUTOR_ORDER_STATUS_CHANGED', entityType: 'DistributorOrder', entityId: order._id, description: `Order ${order.orderNumber} moved to ${status}` });
    return sendSuccess(res, { data: order });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { listDistributors, configureDistributor, listProducts, upsertProduct, listOrders, getOrder, createOrder, sendOrderHandler, updateOrderStatus };
