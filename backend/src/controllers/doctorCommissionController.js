// Phase 10 — doctor commission rules, ledger, payouts, and sales reports (requirement 6).
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const DoctorCommissionRule = require('../models/DoctorCommissionRule');
const DoctorCommissionLedger = require('../models/DoctorCommissionLedger');
const DoctorCommissionPayout = require('../models/DoctorCommissionPayout');
const Doctor = require('../models/Doctor');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Counter = require('../models/Counter');
const money = require('../utils/money');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// ---- Rules ----

const listRules = asyncHandler(async (req, res) => {
  const { doctor, isActive } = req.query;
  const filter = { organizationId: req.organizationId };
  if (doctor) filter.doctor = doctor;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  const rules = await DoctorCommissionRule.find(filter).populate('doctor', 'name doctorCode').populate('medicine', 'name').populate('category', 'name').populate('manufacturer', 'name').sort({ createdAt: -1 });
  return sendSuccess(res, { data: rules });
});

const createRule = asyncHandler(async (req, res) => {
  const { doctor, medicine, category, manufacturer, commissionType, commissionValue } = req.body;
  if (!['PERCENTAGE', 'FIXED_AMOUNT'].includes(commissionType)) return sendError(res, { statusCode: 400, message: 'commissionType must be PERCENTAGE or FIXED_AMOUNT' });
  if (commissionValue === undefined || Number(commissionValue) < 0) return sendError(res, { statusCode: 400, message: 'commissionValue is required and must be >= 0' });
  if ([medicine, category, manufacturer].filter(Boolean).length > 1) return sendError(res, { statusCode: 400, message: 'A rule can target only one of medicine, category, or manufacturer at a time' });

  const rule = await DoctorCommissionRule.create({
    organizationId: req.organizationId,
    branchId: req.body.branchId || null,
    doctor: doctor || null,
    medicine: medicine || null,
    category: category || null,
    manufacturer: manufacturer || null,
    commissionType,
    commissionValue: Number(commissionValue),
    effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date(),
    effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null,
    notes: req.body.notes || '',
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'DOCTOR_COMMISSION_RULE_CREATED', entityType: 'DoctorCommissionRule', entityId: rule._id, description: `Commission rule created (${rule.commissionType} ${rule.commissionValue})` });
  return sendSuccess(res, { statusCode: 201, data: rule });
});

const updateRule = asyncHandler(async (req, res) => {
  const body = { ...req.body, updatedBy: req.user._id };
  const rule = await DoctorCommissionRule.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, body, { new: true, runValidators: true });
  if (!rule) return sendError(res, { statusCode: 404, message: 'Commission rule not found' });
  await logAction({ req, action: 'DOCTOR_COMMISSION_RULE_UPDATED', entityType: 'DoctorCommissionRule', entityId: rule._id, description: 'Commission rule updated' });
  return sendSuccess(res, { data: rule });
});

const deactivateRule = asyncHandler(async (req, res) => {
  const rule = await DoctorCommissionRule.findOneAndUpdate({ _id: req.params.id, organizationId: req.organizationId }, { isActive: false, updatedBy: req.user._id }, { new: true });
  if (!rule) return sendError(res, { statusCode: 404, message: 'Commission rule not found' });
  await logAction({ req, action: 'DOCTOR_COMMISSION_RULE_DEACTIVATED', entityType: 'DoctorCommissionRule', entityId: rule._id, description: 'Commission rule deactivated' });
  return sendSuccess(res, { message: 'Rule deactivated', data: rule });
});

// ---- Ledger ----

// GET /api/doctor-commission/ledger?doctor=&from=&to=&status=&format=csv
const listLedger = asyncHandler(async (req, res) => {
  const { doctor, from, to, status, format } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (doctor) filter.doctor = doctor;
  if (status) filter.status = status;
  if (from || to) filter.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const entries = await DoctorCommissionLedger.find(filter).populate('doctor', 'name doctorCode').populate('medicine', 'name').populate('manufacturer', 'name').populate('sale', 'saleNumber invoiceNumber').sort({ saleDate: -1 });

  if (format === 'csv') {
    const header = ['Date', 'Doctor', 'Sale No', 'Medicine', 'Manufacturer', 'Qty', 'Sale Amount', 'Type', 'Rate/Amount', 'Commission', 'Status'];
    const rows = entries.map((e) =>
      [new Date(e.saleDate).toISOString(), e.doctor?.name, e.sale?.saleNumber, e.medicine?.name, e.manufacturer?.name, e.quantity, e.saleAmount, e.commissionType, e.commissionValue, e.commissionAmount, e.status]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="doctor-commission-ledger.csv"');
    return res.status(200).send(csv);
  }

  return sendSuccess(res, { data: entries });
});

// GET /api/doctor-commission/summary?from=&to=  — commission payable per doctor (ACCRUED only).
const summary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const match = { organizationId: req.organizationId, branchId: req.branchId, status: 'ACCRUED' };
  if (from || to) match.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const rows = await DoctorCommissionLedger.aggregate([
    { $match: match },
    { $group: { _id: '$doctor', totalPayable: { $sum: '$commissionAmount' }, entryCount: { $sum: 1 }, totalSaleAmount: { $sum: '$saleAmount' } } },
    { $lookup: { from: 'doctors', localField: '_id', foreignField: '_id', as: 'doctor' } },
    { $unwind: '$doctor' },
    { $project: { _id: 0, doctorId: '$_id', doctorName: '$doctor.name', doctorCode: '$doctor.doctorCode', totalPayable: 1, entryCount: 1, totalSaleAmount: 1 } },
    { $sort: { totalPayable: -1 } },
  ]);

  return sendSuccess(res, { data: rows });
});

// POST /api/doctor-commission/payouts  { doctor, periodFrom, periodTo, method?, referenceNumber?, notes? }
// Marks every ACCRUED ledger entry for this doctor in the period as PAID,
// atomically, and creates one payout record summarizing them.
const createPayout = asyncHandler(async (req, res) => {
  const { doctor, periodFrom, periodTo, method, referenceNumber, notes } = req.body;
  if (!doctor || !periodFrom || !periodTo) return sendError(res, { statusCode: 400, message: 'doctor, periodFrom and periodTo are required' });

  const session = await mongoose.startSession();
  try {
    let payout;
    let entryCount = 0;
    await session.withTransaction(async () => {
      const entries = await DoctorCommissionLedger.find({
        organizationId: req.organizationId,
        branchId: req.branchId,
        doctor,
        status: 'ACCRUED',
        saleDate: { $gte: new Date(periodFrom), $lte: new Date(periodTo) },
      }).session(session);

      if (entries.length === 0) throw Object.assign(new Error('No accrued commission entries found for this doctor in the given period'), { statusCode: 404 });

      const totalAmount = money.sum(...entries.map((e) => e.commissionAmount));
      entryCount = entries.length;

      const seq = await Counter.nextSequence(req.organizationId, 'DOCTOR_COMMISSION_PAYOUT');
      const payoutNumber = `DCP-${String(seq).padStart(6, '0')}`;

      [payout] = await DoctorCommissionPayout.create(
        [
          {
            organizationId: req.organizationId,
            branchId: req.branchId,
            doctor,
            payoutNumber,
            periodFrom: new Date(periodFrom),
            periodTo: new Date(periodTo),
            entryCount,
            totalAmount,
            method: method || 'BANK_TRANSFER',
            referenceNumber: referenceNumber || null,
            notes: notes || '',
            createdBy: req.user._id,
          },
        ],
        { session }
      );

      await DoctorCommissionLedger.updateMany({ _id: { $in: entries.map((e) => e._id) } }, { status: 'PAID', payout: payout._id }, { session });
    });

    await logAction({ req, action: 'DOCTOR_COMMISSION_PAYOUT_CREATED', entityType: 'DoctorCommissionPayout', entityId: payout._id, description: `Payout ${payout.payoutNumber} of ${payout.totalAmount} for ${entryCount} entries created` });
    return sendSuccess(res, { statusCode: 201, data: payout });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  } finally {
    session.endSession();
  }
});

const listPayouts = asyncHandler(async (req, res) => {
  const { doctor } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (doctor) filter.doctor = doctor;
  const payouts = await DoctorCommissionPayout.find(filter).populate('doctor', 'name doctorCode').sort({ paidAt: -1 });
  return sendSuccess(res, { data: payouts });
});

// ---- Reports (requirement 6: company-wise sales, doctor-wise sales, profitability) ----

// GET /api/doctor-commission/reports/manufacturer-wise?from=&to=
const manufacturerWiseSales = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const saleMatch = { organizationId: req.organizationId, branchId: req.branchId };
  if (from || to) saleMatch.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const saleIds = await Sale.find(saleMatch).distinct('_id');
  const rows = await SaleItem.aggregate([
    { $match: { organizationId: req.organizationId, sale: { $in: saleIds } } },
    { $lookup: { from: 'medicines', localField: 'medicine', foreignField: '_id', as: 'med' } },
    { $unwind: '$med' },
    { $group: { _id: '$med.manufacturer', quantitySold: { $sum: '$quantity' }, salesValue: { $sum: '$totalAmount' }, taxableValue: { $sum: '$taxableAmount' }, costValue: { $sum: { $multiply: ['$quantity', '$purchaseRateSnapshot'] } } } },
    { $lookup: { from: 'manufacturers', localField: '_id', foreignField: '_id', as: 'manufacturer' } },
    { $unwind: { path: '$manufacturer', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, manufacturerId: '$_id', manufacturerName: { $ifNull: ['$manufacturer.name', 'Unassigned'] }, quantitySold: 1, salesValue: 1, taxableValue: 1, estimatedMargin: { $subtract: ['$taxableValue', '$costValue'] } } },
    { $sort: { salesValue: -1 } },
  ]);

  return sendSuccess(res, { data: rows });
});

// GET /api/doctor-commission/reports/doctor-wise?from=&to=  — sales referred by each doctor, plus commission and estimated profitability.
const doctorWiseSales = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const saleMatch = { organizationId: req.organizationId, branchId: req.branchId, referringDoctor: { $ne: null } };
  if (from || to) saleMatch.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const salesRows = await Sale.aggregate([
    { $match: saleMatch },
    { $group: { _id: '$referringDoctor', salesCount: { $sum: 1 }, salesValue: { $sum: '$grandTotal' } } },
  ]);

  const commissionMatch = { organizationId: req.organizationId, branchId: req.branchId };
  if (from || to) commissionMatch.saleDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const commissionRows = await DoctorCommissionLedger.aggregate([{ $match: commissionMatch }, { $group: { _id: '$doctor', totalCommission: { $sum: '$commissionAmount' } } }]);
  const commissionByDoctor = new Map(commissionRows.map((r) => [String(r._id), r.totalCommission]));

  const doctorIds = salesRows.map((r) => r._id);
  const doctors = await Doctor.find({ _id: { $in: doctorIds } }).select('name doctorCode specialization');
  const doctorById = new Map(doctors.map((d) => [String(d._id), d]));

  const rows = salesRows
    .map((r) => {
      const doctor = doctorById.get(String(r._id));
      const totalCommission = commissionByDoctor.get(String(r._id)) || 0;
      return {
        doctorId: r._id,
        doctorName: doctor?.name || null,
        doctorCode: doctor?.doctorCode || null,
        specialization: doctor?.specialization || null,
        salesCount: r.salesCount,
        salesValue: r.salesValue,
        totalCommission,
        netAfterCommission: r.salesValue - totalCommission,
      };
    })
    .sort((a, b) => b.salesValue - a.salesValue);

  return sendSuccess(res, { data: rows });
});

module.exports = { listRules, createRule, updateRule, deactivateRule, listLedger, summary, createPayout, listPayouts, manufacturerWiseSales, doctorWiseSales };
