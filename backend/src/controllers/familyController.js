// Phase 10 — family ledger CRUD + consolidated view (requirement 5).
const asyncHandler = require('express-async-handler');
const Family = require('../models/Family');
const Customer = require('../models/Customer');
const Patient = require('../models/Patient');
const Counter = require('../models/Counter');
const { getConsolidatedLedger } = require('../services/familyLedgerService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  const { search, isActive } = req.query;
  const filter = { organizationId: req.organizationId };
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ familyName: { $regex: search, $options: 'i' } }, { primaryContactMobile: { $regex: search, $options: 'i' } }];
  const families = await Family.find(filter).sort({ familyName: 1 });
  return sendSuccess(res, { data: families });
});

const getOne = asyncHandler(async (req, res) => {
  const family = await Family.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('members.customer', 'name mobile outstandingBalance').populate('members.patient', 'firstName lastName mobile');
  if (!family) return sendError(res, { statusCode: 404, message: 'Family not found' });
  return sendSuccess(res, { data: family });
});

const create = asyncHandler(async (req, res) => {
  const { familyName, primaryContactMobile, address, members } = req.body;
  if (!familyName) return sendError(res, { statusCode: 400, message: 'familyName is required' });

  const seq = await Counter.nextSequence(req.organizationId, 'FAMILY');
  const familyCode = `FAM-${String(seq).padStart(6, '0')}`;

  const family = await Family.create({
    organizationId: req.organizationId,
    branchId: req.branchId || null,
    familyCode,
    familyName,
    primaryContactMobile: primaryContactMobile || null,
    address: address || '',
    members: Array.isArray(members) ? members : [],
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'FAMILY_CREATED', entityType: 'Family', entityId: family._id, description: `Family "${family.familyName}" (${family.familyCode}) created` });
  return sendSuccess(res, { statusCode: 201, data: family });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };
  delete body.familyCode;
  delete body.members; // members are managed via addMember/removeMember so ids/audit stay consistent
  const family = await Family.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!family) return sendError(res, { statusCode: 404, message: 'Family not found' });
  await logAction({ req, action: 'FAMILY_UPDATED', entityType: 'Family', entityId: family._id, description: `Family "${family.familyName}" updated` });
  return sendSuccess(res, { data: family });
});

// POST /api/families/:id/members  { customer?, patient?, name, relationship?, isHead? }
const addMember = asyncHandler(async (req, res) => {
  const family = await Family.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!family) return sendError(res, { statusCode: 404, message: 'Family not found' });

  const { customer, patient, name, relationship, isHead } = req.body;
  if (!name) return sendError(res, { statusCode: 400, message: 'Member name is required' });

  if (customer) {
    const customerDoc = await Customer.findOne({ _id: customer, organizationId: req.organizationId });
    if (!customerDoc) return sendError(res, { statusCode: 404, message: 'Linked customer not found' });
  }
  if (patient) {
    const patientDoc = await Patient.findOne({ _id: patient, organizationId: req.organizationId });
    if (!patientDoc) return sendError(res, { statusCode: 404, message: 'Linked patient not found' });
  }

  if (isHead) family.members.forEach((m) => { m.isHead = false; });
  family.members.push({ customer: customer || null, patient: patient || null, name, relationship: relationship || '', isHead: !!isHead });
  family.updatedBy = req.user._id;
  await family.save();

  await logAction({ req, action: 'FAMILY_MEMBER_ADDED', entityType: 'Family', entityId: family._id, description: `"${name}" added to family "${family.familyName}"` });
  return sendSuccess(res, { statusCode: 201, data: family });
});

// DELETE /api/families/:id/members/:memberId
const removeMember = asyncHandler(async (req, res) => {
  const family = await Family.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!family) return sendError(res, { statusCode: 404, message: 'Family not found' });

  const member = family.members.id(req.params.memberId);
  if (!member) return sendError(res, { statusCode: 404, message: 'Family member not found' });
  const memberName = member.name;
  member.deleteOne();
  family.updatedBy = req.user._id;
  await family.save();

  await logAction({ req, action: 'FAMILY_MEMBER_REMOVED', entityType: 'Family', entityId: family._id, description: `"${memberName}" removed from family "${family.familyName}"` });
  return sendSuccess(res, { data: family });
});

// GET /api/families/:id/ledger — consolidated outstanding + purchase + payment history.
const ledger = asyncHandler(async (req, res) => {
  const family = await Family.findOne({ _id: req.params.id, organizationId: req.organizationId }).populate('members.customer', 'name mobile outstandingBalance');
  if (!family) return sendError(res, { statusCode: 404, message: 'Family not found' });

  const result = await getConsolidatedLedger({ organizationId: req.organizationId, family });
  await logAction({ req, action: 'FAMILY_LEDGER_ACCESS', entityType: 'Family', entityId: family._id, description: `Consolidated ledger viewed for family "${family.familyName}"` });
  return sendSuccess(res, { data: { family, ...result } });
});

module.exports = { list, getOne, create, update, addMember, removeMember, ledger };
