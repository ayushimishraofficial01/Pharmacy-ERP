const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const refundEntrySchema = new Schema(
  {
    method: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CUSTOMER_BALANCE_ADJUSTMENT', 'OTHER'], required: true },
    amount: { type: Number, required: true, min: 0 },
    referenceNumber: { type: String, default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
  },
  { _id: false }
);

const salesReturnSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    returnNumber: { type: String, required: true, trim: true },
    originalSale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    originalInvoiceNumber: { type: String, required: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    returnDate: { type: Date, required: true, default: Date.now },

    items: [{ type: Schema.Types.ObjectId, ref: 'SalesReturnItem' }],

    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    totalRefundAmount: { type: Number, required: true, default: 0 },

    refunds: [refundEntrySchema],
    reason: { type: String, default: null },

    status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

salesReturnSchema.index({ organizationId: 1, branchId: 1, returnNumber: 1 }, { unique: true });
salesReturnSchema.index({ branchId: 1, returnDate: -1 });

module.exports = mongoose.models.SalesReturn || mongoose.model('SalesReturn', salesReturnSchema);
