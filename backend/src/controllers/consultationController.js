const asyncHandler = require('express-async-handler');
const Consultation = require('../models/Consultation');
const Appointment = require('../models/Appointment');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { patient, doctor, status } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (patient) filter.patient = patient;
  if (doctor) filter.doctor = doctor;
  if (status) filter.status = status;

  const consultations = await Consultation.find(filter)
    .populate('patient', 'firstName lastName mobile')
    .populate('doctor', 'name specialization')
    .populate('appointment', 'appointmentNumber status')
    .sort({ consultationDate: -1, createdAt: -1 });

  return sendSuccess(res, { data: consultations });
});

// POST /api/consultations — starts a consultation from a checked-in appointment.
const start = asyncHandler(async (req, res) => {
  const { appointment: appointmentId } = req.body;
  const appointment = await Appointment.findOne({ _id: appointmentId, organizationId: req.organizationId });
  if (!appointment) return sendError(res, { statusCode: 404, message: 'Appointment not found' });
  if (!['CHECKED_IN', 'CONFIRMED', 'SCHEDULED'].includes(appointment.status)) {
    return sendError(res, { statusCode: 400, message: `Cannot start a consultation for an appointment with status ${appointment.status}` });
  }

  const seq = await Counter.nextSequence(req.organizationId, 'CONSULTATION');
  const consultationNumber = `CONS-${String(seq).padStart(6, '0')}`;

  const consultation = await Consultation.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    consultationNumber,
    appointment: appointment._id,
    patient: appointment.patient,
    doctor: appointment.doctor,
    createdBy: req.user._id,
  });

  appointment.status = 'IN_CONSULTATION';
  await appointment.save();

  await logAction({ req, action: 'CONSULTATION_STARTED', entityType: 'Consultation', entityId: consultation._id, description: `Consultation ${consultationNumber} started` });
  return sendSuccess(res, { statusCode: 201, data: consultation });
});

// PUT /api/consultations/:id — doctor fills in clinical fields, or completes it.
const update = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };
  const consultation = await Consultation.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!consultation) return sendError(res, { statusCode: 404, message: 'Consultation not found' });

  if (body.status === 'COMPLETED') {
    await Appointment.findByIdAndUpdate(consultation.appointment, { status: 'COMPLETED' });
  }

  await logAction({ req, action: 'CONSULTATION_UPDATED', entityType: 'Consultation', entityId: consultation._id, description: `Consultation ${consultation.consultationNumber} updated` });
  return sendSuccess(res, { data: consultation });
});

const getOne = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('patient').populate('doctor', 'name specialization');
  if (!consultation) return sendError(res, { statusCode: 404, message: 'Consultation not found' });
  return sendSuccess(res, { data: consultation });
});

module.exports = { list, start, update, getOne };
