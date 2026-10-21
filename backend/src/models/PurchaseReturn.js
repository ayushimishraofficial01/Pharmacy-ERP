const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const purchaseReturnSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    returnNumber: { type: String, required: true, trim: true },
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    returnDate: { type: Date, required: true, default: Date.now },
    reason: { type: String, trim: true, default: '' },

    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    roundOff: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    settlementType: { type: String, enum: ['REFUND', 'ADJUSTMENT'], required: true, default: 'ADJUSTMENT' },
    refundAmount: { type: Number, default: 0 },
    adjustmentAmount: { type: Number, default: 0 },

    notes: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseReturnSchema.index({ organizationId: 1, branchId: 1, returnNumber: 1 }, { unique: true });
purchaseReturnSchema.index({ supplier: 1, createdAt: -1 });
purchaseReturnSchema.index({ purchase: 1 });

module.exports = mongoose.models.PurchaseReturn || mongoose.model('PurchaseReturn', purchaseReturnSchema);
