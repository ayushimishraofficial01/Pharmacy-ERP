// Ported from Phase 2 — this is the immutable audit trail for every stock
// movement. Batch.quantity is the current-state cache; StockTransaction is
// the history that state was derived from. Never edit/delete a row here —
// corrections get a new offsetting ADJUSTMENT row (see stockService).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const STOCK_TRANSACTION_TYPES = [
  'OPENING_STOCK',
  'PURCHASE',
  'SALE',
  'PURCHASE_RETURN',
  'SALES_RETURN',
  'ADJUSTMENT',
  'DAMAGE',
  'EXPIRED',
  'STOCK_TRANSFER_OUT',
  'STOCK_TRANSFER_IN',
  'STOCK_COUNT_CORRECTION',
];

const stockTransactionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    transactionType: { type: String, enum: STOCK_TRANSACTION_TYPES, required: true },

    quantity: { type: Number, required: true }, // signed: +ve increase, -ve decrease
    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },

    referenceType: { type: String, trim: true, default: '' }, // "Purchase", "Sale", "StockCount", "Manual"
    referenceId: { type: Schema.Types.ObjectId, default: null },

    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockTransactionSchema.index({ branchId: 1, medicine: 1, createdAt: -1 });
stockTransactionSchema.index({ branchId: 1, batch: 1, createdAt: -1 });
stockTransactionSchema.index({ branchId: 1, transactionType: 1 });

const StockTransaction = mongoose.models.StockTransaction || mongoose.model('StockTransaction', stockTransactionSchema);
module.exports = StockTransaction;
module.exports.STOCK_TRANSACTION_TYPES = STOCK_TRANSACTION_TYPES;
