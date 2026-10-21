const asyncHandler = require('express-async-handler');
const Prescription = require('../models/Prescription');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const create = asyncHandler(async (req, res) => {
  const { patient, doctor, consultation, items } = req.body;
  if (!patient || !doctor || !consultation) return sendError(res, { statusCode: 400, message: 'patient, doctor and consultation are required' });
  if (!Array.isArray(items) || items.length === 0) return sendError(res, { statusCode: 400, message: 'At least one prescription item is required' });

  const snapshotItems = [];
  for (const it of items) {
    const medicine = await Medicine.findOne({ _id: it.medicine, organizationId: req.organizationId });
    if (!medicine) return sendError(res, { statusCode: 404, message: `Medicine ${it.medicine} not found` });
    snapshotItems.push({ ...it, medicineNameSnapshot: medicine.name });
  }

  const seq = await Counter.nextSequence(req.organizationId, 'PRESCRIPTION');
  const prescriptionNumber = `RX-${String(seq).padStart(6, '0')}`;

  const prescription = await Prescription.create({
    ...req.body,
    items: snapshotItems,
    prescriptionNumber,
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'PRESCRIPTION_CREATED', entityType: 'Prescription', entityId: prescription._id, description: `Prescription ${prescriptionNumber} issued` });
  return sendSuccess(res, { statusCode: 201, data: prescription });
});

const getOne = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('patient').populate('doctor', 'name');
  if (!prescription) return sendError(res, { statusCode: 404, message: 'Prescription not found' });
  await logAction({ req, action: 'PRESCRIPTION_ACCESS', entityType: 'Prescription', entityId: prescription._id, description: `Prescription ${prescription.prescriptionNumber} accessed` });
  return sendSuccess(res, { data: prescription });
});

const listForPatient = asyncHandler(async (req, res) => {
  const prescriptions = await Prescription.find({ organizationId: req.organizationId, patient: req.params.patientId }).sort({ prescriptionDate: -1 });
  return sendSuccess(res, { data: prescriptions });
});

// PATCH /api/prescriptions/:id/dispense
// body: { items: [{ prescriptionItemId, quantityDispensed }] }
// Called by the pharmacy counter AFTER a Sale has already deducted stock
// through the normal POS flow (createSale) — this only updates the
// prescription's own fulfillment tracking, it does not itself touch stock,
// to avoid two different code paths being able to change inventory for the
// same physical handoff.
const dispense = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!prescription) return sendError(res, { statusCode: 404, message: 'Prescription not found' });
  if (prescription.status === 'CANCELLED') return sendError(res, { statusCode: 400, message: 'Cannot dispense a cancelled prescription' });

  for (const line of req.body.items || []) {
    const item = prescription.items.id(line.prescriptionItemId);
    if (!item) return sendError(res, { statusCode: 404, message: `Prescription item ${line.prescriptionItemId} not found` });
    const newDispensed = item.quantityDispensed + Number(line.quantityDispensed || 0);
    if (newDispensed > item.quantity) {
      return sendError(res, { statusCode: 400, message: `Cannot dispense more than prescribed for "${item.medicineNameSnapshot}" (prescribed ${item.quantity}, already dispensed ${item.quantityDispensed})` });
    }
    item.quantityDispensed = newDispensed;
  }

  const allComplete = prescription.items.every((i) => i.quantityDispensed >= i.quantity);
  const anyDispensed = prescription.items.some((i) => i.quantityDispensed > 0);
  prescription.status = allComplete ? 'COMPLETED' : anyDispensed ? 'PARTIALLY_DISPENSED' : prescription.status;
  await prescription.save();

  await logAction({ req, action: 'PRESCRIPTION_DISPENSED', entityType: 'Prescription', entityId: prescription._id, description: `Prescription ${prescription.prescriptionNumber} dispense recorded, status ${prescription.status}` });
  return sendSuccess(res, { data: prescription });
});

module.exports = { create, getOne, listForPatient, dispense };
