// Phase 10 — a purchase order sent to a distributor (requirement 7).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const ORDER_STATUSES = ['PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'];

const distributorOrderItemSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineNameSnapshot: { type: String, required: true },
    distributorProductCode: { type: String, default: '' },
    requestedQuantity: { type: Number, required: true, min: 1 },
    acceptedQuantity: { type: Number, default: null }, // set once distributor responds
    fulfilledQuantity: { type: Number, default: 0 }, // updated as goods actually arrive
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const distributorOrderSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING' },
    items: { type: [distributorOrderItemSchema], default: [] },
    totalEstimatedValue: { type: Number, default: 0 },

    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    // Populated by distributorApiAdapter.js when a real distributor API is
    // configured for the supplier; null for manual/offline ordering.
    externalOrderReference: { type: String, default: null },
    lastApiError: { type: String, default: null },

    notes: { type: String, trim: true, default: '' },
    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: { type: String, default: '' },
      },
    ],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

distributorOrderSchema.index({ organizationId: 1, branchId: 1, orderNumber: 1 }, { unique: true });
distributorOrderSchema.index({ organizationId: 1, supplier: 1, status: 1 });

const DistributorOrder = mongoose.models.DistributorOrder || mongoose.model('DistributorOrder', distributorOrderSchema);
module.exports = DistributorOrder;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
