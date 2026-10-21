// New for Phase 8 (no earlier phase had this). Workflow: Create Count ->
// Physical Counting -> System vs Physical Comparison -> Variance -> Approval
// -> Stock Adjustment. The adjustment step goes through stockService so it
// lands in the same StockTransaction ledger as every other stock movement.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const stockCountLineSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    medicineNameSnapshot: { type: String, required: true },
    batchNumberSnapshot: { type: String, required: true },
    systemQuantity: { type: Number, required: true }, // snapshotted when the count is created
    physicalQuantity: { type: Number, default: null }, // filled in during counting
    variance: { type: Number, default: null }, // physicalQuantity - systemQuantity
    valueImpact: { type: Number, default: null }, // variance * batch.purchaseRate
    notes: { type: String, default: '' },
  },
  { _id: true }
);

const stockCountSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    countNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: ['DRAFT', 'COUNTING', 'PENDING_APPROVAL', 'APPROVED', 'ADJUSTED', 'CANCELLED'], default: 'DRAFT' },
    scope: { type: String, enum: ['FULL', 'CATEGORY', 'SELECTED_MEDICINES'], default: 'SELECTED_MEDICINES' },
    lines: [stockCountLineSchema],
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    adjustedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

stockCountSchema.index({ organizationId: 1, branchId: 1, countNumber: 1 }, { unique: true });

module.exports = mongoose.models.StockCount || mongoose.model('StockCount', stockCountSchema);
