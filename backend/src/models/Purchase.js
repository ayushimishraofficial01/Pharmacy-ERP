const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const purchaseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    purchaseNumber: { type: String, required: true, trim: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    invoiceNumber: { type: String, required: true, trim: true }, // supplier's own invoice #
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date },
    purchaseType: { type: String, enum: ['CASH', 'CREDIT'], required: true },
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'UNPAID'], required: true, default: 'UNPAID' },

    // Snapshot totals — computed once at save time, never recalculated from
    // current medicine master data afterwards.
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    roundOff: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    paidAmount: { type: Number, required: true, default: 0 },
    outstandingAmount: { type: Number, required: true, default: 0 },

    taxType: { type: String, enum: ['INTRA_STATE', 'INTER_STATE'] },

    status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' },
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,

    notes: { type: String, trim: true, default: '' },
    // Phase 10 (requirement 7): optional link back to the distributor order
    // this purchase fulfills, when goods arrived against an order placed
    // through the distributor-ordering module. Purchase creation itself is
    // unchanged — this is purely a traceability link, set by the caller.
    distributorOrder: { type: Schema.Types.ObjectId, ref: 'DistributorOrder', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseSchema.index({ organizationId: 1, branchId: 1, purchaseNumber: 1 }, { unique: true });
purchaseSchema.index({ organizationId: 1, supplier: 1, createdAt: -1 });
purchaseSchema.index({ organizationId: 1, supplier: 1, invoiceNumber: 1, status: 1 });
purchaseSchema.index({ branchId: 1, paymentStatus: 1 });
purchaseSchema.index({ branchId: 1, dueDate: 1 });

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
