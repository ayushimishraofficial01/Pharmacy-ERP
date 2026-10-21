const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Ported from Phase 5's double-booking protection: two appointments for the
// same doctor on the same date overlap if one starts before the other ends.
async function hasOverlap({ doctor, appointmentDate, startTime, endTime, excludeId }) {
  const dayStart = new Date(appointmentDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const candidates = await Appointment.find({
    doctor,
    appointmentDate: { $gte: dayStart, $lt: dayEnd },
    status: { $nin: ['CANCELLED', 'NO_SHOW'] },
    ...(excludeId && { _id: { $ne: excludeId } }),
  });

  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);
  return candidates.some((a) => newStart < toMinutes(a.endTime) && toMinutes(a.startTime) < newEnd);
}

const list = asyncHandler(async (req, res) => {
  const { doctor, patient, status, date } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (doctor) filter.doctor = doctor;
  if (patient) filter.patient = patient;
  if (status) filter.status = status;
  if (date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    filter.appointmentDate = { $gte: d, $lt: next };
  }
  const appointments = await Appointment.find(filter).populate('patient', 'firstName lastName mobile').populate('doctor', 'name specialization').sort({ appointmentDate: 1, startTime: 1 });
  return sendSuccess(res, { data: appointments });
});

const create = asyncHandler(async (req, res) => {
  const { patient, doctor, appointmentDate, startTime, endTime } = req.body;
  if (!patient || !doctor || !appointmentDate || !startTime || !endTime) {
    return sendError(res, { statusCode: 400, message: 'patient, doctor, appointmentDate, startTime and endTime are required' });
  }
  const doc = await Doctor.findOne({ _id: doctor, organizationId: req.organizationId });
  if (!doc || !doc.isActive) return sendError(res, { statusCode: 404, message: 'Doctor not found or inactive' });

  if (await hasOverlap({ doctor, appointmentDate, startTime, endTime })) {
    return sendError(res, { statusCode: 409, message: 'This doctor already has an appointment overlapping that time slot' });
  }

  const seq = await Counter.nextSequence(req.organizationId, 'APPOINTMENT');
  const appointmentNumber = `APT-${String(seq).padStart(6, '0')}`;

  const appointment = await Appointment.create({ ...req.body, appointmentNumber, organizationId: req.organizationId, branchId: req.branchId, createdBy: req.user._id });
  await logAction({ req, action: 'APPOINTMENT_CREATED', entityType: 'Appointment', entityId: appointment._id, description: `Appointment ${appointmentNumber} scheduled` });
  return sendSuccess(res, { statusCode: 201, data: appointment });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status, cancelledReason } = req.body;
  const validStatuses = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
  if (!validStatuses.includes(status)) return sendError(res, { statusCode: 400, message: `status must be one of: ${validStatuses.join(', ')}` });

  const update = { status };
  if (status === 'CHECKED_IN') {
    update.checkedInAt = new Date();
    update.checkedInBy = req.user._id;
  }
  if (status === 'CANCELLED') update.cancelledReason = cancelledReason || '';

  const appointment = await Appointment.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, update, { new: true });
  if (!appointment) return sendError(res, { statusCode: 404, message: 'Appointment not found' });
  await logAction({ req, action: 'APPOINTMENT_STATUS_CHANGED', entityType: 'Appointment', entityId: appointment._id, description: `Appointment ${appointment.appointmentNumber} -> ${status}` });
  return sendSuccess(res, { data: appointment });
});

module.exports = { list, create, updateStatus };
