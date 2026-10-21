// Phase 10 — persisted, reviewable reorder suggestions (requirement 15).
// The live GET /api/inventory-automation/smart-reorder endpoint (Phase 8)
// is a stateless recommendation list. This model gives that same
// recommendation a lifecycle — PENDING → APPROVED/REJECTED → (optionally)
// ORDERED — so "review and approve before creating a purchase order" is an
// actual recorded decision, not just a screen someone glanced at.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const reorderSuggestionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },

    currentStock: { type: Number, required: true },
    onOrder: { type: Number, default: 0 },
    averageDailySales: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 0 },
    safetyStock: { type: Number, default: 0 },
    suggestedQuantity: { type: Number, required: true },
    reason: { type: String, default: '' },
    preferredSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },

    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'ORDERED'], default: 'PENDING' },
    approvedQuantity: { type: Number, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNotes: { type: String, default: '' },

    distributorOrder: { type: Schema.Types.ObjectId, ref: 'DistributorOrder', default: null }, // set if approval created one
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', default: null }, // set once goods are actually received against this

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One open (PENDING) suggestion per medicine per branch at a time.
reorderSuggestionSchema.index({ organizationId: 1, branchId: 1, medicine: 1, status: 1 });

const ReorderSuggestion = mongoose.models.ReorderSuggestion || mongoose.model('ReorderSuggestion', reorderSuggestionSchema);
module.exports = ReorderSuggestion;
