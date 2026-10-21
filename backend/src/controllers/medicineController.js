const asyncHandler = require('express-async-handler');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const Counter = require('../models/Counter');
const { getStockSummary } = require('../services/stockService');
const { getEffectiveGstRate } = require('../services/hsnLookupService');
const { findSubstitutes } = require('../services/substituteService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// Phase 10: when a medicine is saved with an hsnCode and the caller did NOT
// explicitly send gstRate, pull the current rate from the HSN master instead
// of leaving whatever stale value was there before (or the schema default).
// If the caller DID send gstRate explicitly, we respect it — this never
// silently overrides a rate someone typed on purpose, and never hard-codes
// a rate table in this controller.
async function resolveGstRateFromHsn(organizationId, body) {
  if (body.gstRate !== undefined || !body.hsnCode) return body;
  const rate = await getEffectiveGstRate({ organizationId, hsnCode: body.hsnCode });
  if (rate === null) return body;
  return { ...body, gstRate: rate };
}

async function ensureOpeningBatch({ medicine, branchId, body }) {
  const quantity = Number(body.defaultQuantity) || 0;
  if (!branchId || quantity <= 0) return;

  const existingBatch = await Batch.findOne({
    organizationId: medicine.organizationId,
    branchId,
    medicine: medicine._id,
    isActive: true,
  }).sort({ expiryDate: 1 });
  const rate = Number(body.defaultRate ?? medicine.defaultRate) || 0;
  const mrp = Number(body.defaultMrp ?? medicine.defaultMrp) || rate;
  if (rate <= 0 || mrp <= 0) return;

  if (existingBatch) {
    existingBatch.batchNumber = body.batchNumber || medicine.batchNumber || existingBatch.batchNumber;
    existingBatch.expiryDate = body.defaultExpiryDate || medicine.defaultExpiryDate || existingBatch.expiryDate;
    existingBatch.quantity = quantity;
    existingBatch.sellingRate = rate;
    existingBatch.mrp = mrp;
    existingBatch.gstRate = Number(body.gstRate ?? medicine.gstRate) || 0;
    await existingBatch.save();
    return;
  }

  await Batch.create({
    organizationId: medicine.organizationId,
    branchId,
    medicine: medicine._id,
    batchNumber: body.batchNumber || medicine.batchNumber || medicine.medicineCode,
    barcode: `${medicine.medicineCode}-${body.batchNumber || medicine.batchNumber || 'OPENING'}`,
    expiryDate: body.defaultExpiryDate || medicine.defaultExpiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    quantity,
    purchaseRate: rate,
    mrp,
    sellingRate: rate,
    gstRate: Number(body.gstRate ?? medicine.gstRate) || 0,
  });
}

const list = asyncHandler(async (req, res) => {
  const { search, category, isActive, salt } = req.query;
  const filter = { organizationId: req.organizationId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (category) filter.category = category;
  if (search) filter.$text = { $search: search };
  // Phase 10 (requirement 2): direct salt/composition search — a looser
  // substring match (not the exact-set match substitutes() uses below),
  // useful when the user is browsing/searching rather than looking up
  // substitutes for one specific medicine.
  if (salt) filter.saltComposition = new RegExp(salt, 'i');
  const medicines = await Medicine.find(filter).populate('category manufacturer defaultSupplier').sort({ name: 1 });
  return sendSuccess(res, { data: medicines });
});

const getOne = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('category manufacturer defaultSupplier');
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });

  // Attach live stock summary for this branch so the detail view doesn't
  // need a second round trip (Phase 8's inventory automation needs exactly
  // this shape: current/reserved/available/suggested reorder).
  const stock = req.branchId ? await getStockSummary({ organizationId: req.organizationId, branchId: req.branchId, medicineId: medicine._id }) : null;

  return sendSuccess(res, { data: { medicine, stock } });
});

const create = asyncHandler(async (req, res) => {
  let { medicineCode, barcode } = req.body;
  if (!medicineCode) {
    const seq = await Counter.nextSequence(req.organizationId, 'MEDICINE');
    medicineCode = `MED-${String(seq).padStart(6, '0')}`;
  }
  // Auto-generate barcode from medicineCode if not provided, to avoid sparse index conflicts
  if (!barcode) {
    barcode = medicineCode;
  }
  const body = await resolveGstRateFromHsn(req.organizationId, { ...req.body, barcode });
  const medicine = await Medicine.create({ ...body, medicineCode, barcode, organizationId: req.organizationId, createdBy: req.user._id });
  await ensureOpeningBatch({ medicine, branchId: req.branchId, body });
  await logAction({ req, action: 'MEDICINE_CREATED', entityType: 'Medicine', entityId: medicine._id, description: `Medicine "${medicine.name}" (${medicine.medicineCode}) created` });
  return sendSuccess(res, { statusCode: 201, data: medicine });
});

const update = asyncHandler(async (req, res) => {
  const resolved = await resolveGstRateFromHsn(req.organizationId, req.body);
  const body = { ...resolved, updatedBy: req.user._id };
  delete body.medicineCode; // code is immutable once assigned
  const medicine = await Medicine.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
  await ensureOpeningBatch({ medicine, branchId: req.branchId, body });
  await logAction({ req, action: 'MEDICINE_UPDATED', entityType: 'Medicine', entityId: medicine._id, description: `Medicine "${medicine.name}" updated` });
  return sendSuccess(res, { data: medicine });
});

const remove = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { isActive: false }, { new: true });
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
  await logAction({ req, action: 'MEDICINE_DEACTIVATED', entityType: 'Medicine', entityId: medicine._id, description: `Medicine "${medicine.name}" deactivated` });
  return sendSuccess(res, { message: 'Medicine deactivated', data: medicine });
});

// GET /api/medicines/:id/substitutes — requirement 2. Never auto-applied;
// purely informational for the pharmacist/cashier to choose from (POS shows
// this list, the human picks, the sale is created with whichever medicine
// they actually chose — same createSale path either way).
const substitutes = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
  if (!medicine.saltComposition) return sendSuccess(res, { data: [], message: 'This medicine has no recorded salt/composition to match against' });

  const results = await findSubstitutes({ organizationId: req.organizationId, branchId: req.branchId, medicine });
  return sendSuccess(res, { data: results });
});

module.exports = { list, getOne, create, update, remove, substitutes };
