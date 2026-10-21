const Supplier = require('../models/Supplier');
const SupplierLedger = require('../models/SupplierLedger');

/**
 * Append one ledger row for a supplier and update Supplier.currentBalance to
 * match. Must run inside the same DB session as the Purchase/Payment/Return
 * write that triggered it, passed in via `session`.
 */
async function appendLedgerEntry({ organizationId, branchId, supplierId, date, referenceType, referenceId, referenceNumber, transactionType, debit = 0, credit = 0, notes = '', userId, session }) {
  const supplier = await Supplier.findById(supplierId).session(session || null);
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });

  const newBalance = supplier.currentBalance + debit - credit;
  supplier.currentBalance = newBalance;
  await supplier.save({ session });

  const [entry] = await SupplierLedger.create(
    [
      {
        organizationId,
        branchId,
        supplier: supplierId,
        date: date || new Date(),
        referenceType,
        referenceId,
        referenceNumber,
        transactionType,
        debit,
        credit,
        balance: newBalance,
        notes,
        createdBy: userId,
      },
    ],
    { session }
  );

  return entry;
}

module.exports = { appendLedgerEntry };
