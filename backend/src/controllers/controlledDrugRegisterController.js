// Phase 10 — controlled/narcotic register endpoints (requirement 4).
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ControlledDrugRegister = require('../models/ControlledDrugRegister');
const Medicine = require('../models/Medicine');
const { recordEntry, getCurrentBalance } = require('../services/controlledDrugRegisterService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// GET /api/controlled-register?medicine=&from=&to=&transactionType=&format=csv
const list = asyncHandler(async (req, res) => {
  const { medicine, from, to, transactionType, format } = req.query;
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (medicine) filter.medicine = medicine;
  if (transactionType) filter.transactionType = transactionType;
  if (from || to) filter.date = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const entries = await ControlledDrugRegister.find(filter)
    .populate('medicine', 'name medicineCode strength dosageForm')
    .populate('batch', 'batchNumber expiryDate')
    .populate('supplier', 'supplierName')
    .populate('customer', 'name mobile')
    .populate('patient', 'firstName lastName mobile')
    .populate('doctor', 'name registrationNumber')
    .populate('user', 'name role')
    .sort({ date: 1, createdAt: 1 });

  if (format === 'csv') {
    const header = ['Date', 'Medicine', 'Batch', 'Type', 'Purchase Qty', 'Sale Qty', 'Balance', 'Supplier', 'Customer', 'Patient', 'Doctor', 'Prescription Ref', 'Reference No', 'Staff'];
    const rows = entries.map((e) =>
      [
        new Date(e.date).toISOString(),
        e.medicine?.name,
        e.batch?.batchNumber,
        e.transactionType,
        e.purchaseQuantity,
        e.saleQuantity,
        e.balanceAfter,
        e.supplier?.supplierName,
        e.customer?.name,
        e.patient ? [e.patient.firstName, e.patient.lastName].filter(Boolean).join(' ') : '',
        e.doctor?.name || e.doctorName,
        e.prescriptionReference,
        e.referenceNumber,
        e.user?.name,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="controlled-drug-register.csv"');
    return res.status(200).send(csv);
  }

  return sendSuccess(res, { data: entries });
});

// GET /api/controlled-register/balance?medicine=...
const balance = asyncHandler(async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) return sendError(res, { statusCode: 400, message: 'medicine is required' });
  const currentBalance = await getCurrentBalance({ organizationId: req.organizationId, branchId: req.branchId, medicineId: medicine });
  return sendSuccess(res, { data: { medicine, currentBalance } });
});

// POST /api/controlled-register/manual — opening stock entry or a correction
// adjustment. Purchase/Sale entries are created automatically by
// purchaseController/saleController — this endpoint is only for the two
// cases nothing else creates: initial opening balance, and a manual
// correction (with a mandatory reason, audit-logged).
const manualEntry = asyncHandler(async (req, res) => {
  const { medicine: medicineId, transactionType, purchaseQuantity, saleQuantity, notes, date } = req.body;
  if (!medicineId || !transactionType) return sendError(res, { statusCode: 400, message: 'medicine and transactionType are required' });
  if (!['OPENING_STOCK', 'ADJUSTMENT'].includes(transactionType)) return sendError(res, { statusCode: 400, message: 'Manual entries must be OPENING_STOCK or ADJUSTMENT' });
  if (!notes || !notes.trim()) return sendError(res, { statusCode: 400, message: 'A reason/notes is required for a manual controlled-drug register entry' });

  const medicine = await Medicine.findOne({ _id: medicineId, organizationId: req.organizationId });
  if (!medicine) return sendError(res, { statusCode: 404, message: 'Medicine not found' });
  if (medicine.scheduleType !== 'X') return sendError(res, { statusCode: 400, message: 'This medicine is not classified as a controlled/narcotic (Schedule X) drug' });

  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      entry = await recordEntry({
        organizationId: req.organizationId,
        branchId: req.branchId,
        medicineId,
        transactionType,
        purchaseQuantity: Number(purchaseQuantity) || 0,
        saleQuantity: Number(saleQuantity) || 0,
        referenceType: 'Manual',
        userId: req.user._id,
        date: date ? new Date(date) : new Date(),
        notes,
        session,
      });
    });
    await logAction({ req, action: 'CONTROLLED_REGISTER_MANUAL_ENTRY', entityType: 'ControlledDrugRegister', entityId: entry._id, description: `Manual ${transactionType} entry for "${medicine.name}": ${notes}` });
    return sendSuccess(res, { statusCode: 201, data: entry });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  } finally {
    session.endSession();
  }
});

module.exports = { list, balance, manualEntry };
