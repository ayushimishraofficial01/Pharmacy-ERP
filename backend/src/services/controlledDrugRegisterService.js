// Phase 10 — controlled/narcotic register bookkeeping (requirement 4).
// Single choke point for writing register entries, mirroring
// supplierLedgerService's appendLedgerEntry pattern — every module that
// moves a Schedule X drug (purchase, sale, returns, manual adjustment) MUST
// call this instead of writing ControlledDrugRegister rows directly, so the
// running balance can never diverge from the entry history.
const ControlledDrugRegister = require('../models/ControlledDrugRegister');

async function getCurrentBalance({ organizationId, branchId, medicineId, session }) {
  const last = await ControlledDrugRegister.findOne({ organizationId, branchId, medicine: medicineId })
    .sort({ date: -1, createdAt: -1 })
    .session(session || null);
  return last ? last.balanceAfter : 0;
}

/**
 * Append one register row. purchaseQuantity/saleQuantity are mutually
 * exclusive per entry (a PURCHASE entry sets purchaseQuantity, a SALE entry
 * sets saleQuantity, etc.) — mirrors how StockTransaction always signs a
 * single quantity rather than mixing directions in one row.
 */
async function recordEntry({
  organizationId,
  branchId,
  medicineId,
  batchId = null,
  transactionType,
  purchaseQuantity = 0,
  saleQuantity = 0,
  supplierId = null,
  customerId = null,
  patientId = null,
  prescriptionId = null,
  doctorId = null,
  doctorName = null,
  prescriptionReference = null,
  referenceType,
  referenceId = null,
  referenceNumber = '',
  userId,
  date,
  notes = '',
  session,
}) {
  if (!purchaseQuantity && !saleQuantity) {
    throw Object.assign(new Error('Controlled-drug register entry requires a non-zero purchaseQuantity or saleQuantity'), { statusCode: 400 });
  }

  const currentBalance = await getCurrentBalance({ organizationId, branchId, medicineId, session });
  const balanceAfter = currentBalance + purchaseQuantity - saleQuantity;
  if (balanceAfter < 0) {
    throw Object.assign(new Error('Controlled-drug register balance cannot go negative — check stock/quantity for this entry'), { statusCode: 400 });
  }

  const [entry] = await ControlledDrugRegister.create(
    [
      {
        organizationId,
        branchId,
        medicine: medicineId,
        batch: batchId,
        date: date || new Date(),
        transactionType,
        purchaseQuantity,
        saleQuantity,
        balanceAfter,
        supplier: supplierId,
        customer: customerId,
        patient: patientId,
        prescription: prescriptionId,
        doctor: doctorId,
        doctorName,
        prescriptionReference,
        referenceType,
        referenceId,
        referenceNumber,
        user: userId,
        notes,
      },
    ],
    { session }
  );

  return entry;
}

module.exports = { recordEntry, getCurrentBalance };
