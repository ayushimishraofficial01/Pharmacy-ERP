// Phase 10 — controlled/narcotic medicine register (requirement 4).
// One immutable row per movement of a Schedule X (narcotic/controlled) drug.
// Modeled on SupplierLedger's running-balance pattern: `balanceAfter` is the
// register's own running tally for (organizationId, branchId, medicine),
// independent of live Batch.quantity — which is deliberate. A statutory
// narcotic register must be an append-only audit trail; it should not
// silently re-derive itself from current stock if stock gets corrected for
// unrelated reasons (damage, recount) — those go through as their own
// ADJUSTMENT entries instead, same as a supplier ledger would.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const REGISTER_TRANSACTION_TYPES = ['PURCHASE', 'SALE', 'PURCHASE_RETURN', 'SALES_RETURN', 'ADJUSTMENT', 'OPENING_STOCK'];

const controlledDrugRegisterSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },

    date: { type: Date, required: true, default: Date.now },
    transactionType: { type: String, enum: REGISTER_TRANSACTION_TYPES, required: true },

    purchaseQuantity: { type: Number, default: 0, min: 0 },
    saleQuantity: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, required: true }, // running balance for this medicine in this branch after this entry

    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', default: null },
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription', default: null },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
    doctorName: { type: String, trim: true, default: null }, // free-text fallback, same as Sale.restrictedSaleInfo
    prescriptionReference: { type: String, trim: true, default: null },

    referenceType: { type: String, required: true }, // 'Purchase' | 'Sale' | 'PurchaseReturn' | 'SalesReturn' | 'Manual'
    referenceId: { type: Schema.Types.ObjectId, default: null },
    referenceNumber: { type: String, default: '' },

    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // staff who performed the transaction
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

controlledDrugRegisterSchema.index({ organizationId: 1, branchId: 1, medicine: 1, date: 1 });
controlledDrugRegisterSchema.index({ organizationId: 1, branchId: 1, medicine: 1, createdAt: 1 });

const ControlledDrugRegister = mongoose.models.ControlledDrugRegister || mongoose.model('ControlledDrugRegister', controlledDrugRegisterSchema);
module.exports = ControlledDrugRegister;
module.exports.REGISTER_TRANSACTION_TYPES = REGISTER_TRANSACTION_TYPES;
