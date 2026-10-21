// One immutable row per financial movement against a supplier. Running
// `balance` is the payable balance AFTER this entry (positive = we owe
// the supplier). This is the source of truth Phase 8's Payment
// Reconciliation and CRM/supplier analytics will read from.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const LEDGER_TYPES = ['OPENING_BALANCE', 'PURCHASE', 'PURCHASE_RETURN', 'PAYMENT', 'ADJUSTMENT'];

const supplierLedgerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    date: { type: Date, required: true, default: Date.now },
    referenceType: { type: String, required: true }, // 'Purchase' | 'PurchaseReturn' | 'Payment' | 'Supplier'
    referenceId: { type: Schema.Types.ObjectId, required: true },
    referenceNumber: { type: String, default: '' },
    transactionType: { type: String, enum: LEDGER_TYPES, required: true },
    debit: { type: Number, default: 0 }, // increases payable (purchases)
    credit: { type: Number, default: 0 }, // decreases payable (payments, returns)
    balance: { type: Number, required: true }, // running balance after this entry
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supplierLedgerSchema.index({ supplier: 1, date: 1, createdAt: 1 });

const SupplierLedger = mongoose.models.SupplierLedger || mongoose.model('SupplierLedger', supplierLedgerSchema);
module.exports = SupplierLedger;
module.exports.LEDGER_TYPES = LEDGER_TYPES;
