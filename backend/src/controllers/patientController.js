const asyncHandler = require('express-async-handler');
const Patient = require('../models/Patient');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = { organizationId: req.organizationId };
  if (search) filter.$or = [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { mobile: { $regex: search, $options: 'i' } }];
  const patients = await Patient.find(filter).sort({ createdAt: -1 });
  return sendSuccess(res, { data: patients });
});

// Clinical fields (allergies, chronicConditions, notes) are visible here —
// this route requires DOCTOR/ADMIN/SUPER_ADMIN/RECEPTIONIST per patientRoutes.js,
// keeping unauthorized CRM users from seeing clinical data (Phase 8's rule).
const getOne = asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!patient) return sendError(res, { statusCode: 404, message: 'Patient not found' });
  await logAction({ req, action: 'PATIENT_RECORD_ACCESS', entityType: 'Patient', entityId: patient._id, description: `Patient record for "${patient.firstName} ${patient.lastName}" accessed` });
  return sendSuccess(res, { data: patient });
});

const create = asyncHandler(async (req, res) => {
  let { patientCode } = req.body;
  if (!patientCode) {
    const seq = await Counter.nextSequence(req.organizationId, 'PATIENT');
    patientCode = `PT-${String(seq).padStart(6, '0')}`;
  }
  const patient = await Patient.create({ ...req.body, patientCode, organizationId: req.organizationId, createdBy: req.user._id });
  await logAction({ req, action: 'PATIENT_CREATED', entityType: 'Patient', entityId: patient._id, description: `Patient "${patient.firstName} ${patient.lastName}" registered` });
  return sendSuccess(res, { statusCode: 201, data: patient });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };
  delete body.patientCode;
  const patient = await Patient.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!patient) return sendError(res, { statusCode: 404, message: 'Patient not found' });
  await logAction({ req, action: 'PATIENT_UPDATED', entityType: 'Patient', entityId: patient._id, description: `Patient "${patient.firstName} ${patient.lastName}" updated` });
  return sendSuccess(res, { data: patient });
});

module.exports = { list, getOne, create, update };
