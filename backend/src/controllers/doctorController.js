const asyncHandler = require('express-async-handler');
const Doctor = require('../models/Doctor');
const Counter = require('../models/Counter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId };
  if (req.branchId) filter.branchId = req.branchId;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const doctors = await Doctor.find(filter).sort({ name: 1 });
  return sendSuccess(res, { data: doctors });
});

const create = asyncHandler(async (req, res) => {
  let { doctorCode } = req.body;
  if (!doctorCode) {
    const seq = await Counter.nextSequence(req.organizationId, 'DOCTOR');
    doctorCode = `DOC-${String(seq).padStart(4, '0')}`;
  }
  const doctor = await Doctor.create({ ...req.body, doctorCode, organizationId: req.organizationId, branchId: req.branchId });
  await logAction({ req, action: 'DOCTOR_CREATED', entityType: 'Doctor', entityId: doctor._id, description: `Doctor "${doctor.name}" added` });
  return sendSuccess(res, { statusCode: 201, data: doctor });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.doctorCode;
  const doctor = await Doctor.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!doctor) return sendError(res, { statusCode: 404, message: 'Doctor not found' });
  await logAction({ req, action: 'DOCTOR_UPDATED', entityType: 'Doctor', entityId: doctor._id, description: `Doctor "${doctor.name}" updated` });
  return sendSuccess(res, { data: doctor });
});

module.exports = { list, create, update };
