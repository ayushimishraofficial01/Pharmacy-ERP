// Phase 10 — dedicated HSN/GST master (requirement 9).
// Purpose: stop GST rates from being scattered/hard-coded per module. Medicine
// keeps its own `gstRate` (Batch/Sale/Purchase snapshot pricing off Medicine
// at transaction time, per the existing "never read pricing back later" rule)
// but that rate should be SET FROM here, and this collection is the single
// place GST-rate-by-HSN history lives.
//
// rateHistory supports GST rate changes over time (the government revises
// HSN rates periodically) without losing the ability to answer "what was the
// correct rate for this HSN on this past date" — needed for GST filing and
// audit correctness, not just for billing today.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const rateHistoryEntrySchema = new Schema(
  {
    gstRate: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const hsnMasterSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    hsnCode: { type: String, required: [true, 'HSN code is required'], trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },

    // Current effective rate — kept denormalized alongside rateHistory so
    // every read doesn't need to walk the history array to find "now".
    gstRate: { type: Number, required: true, min: 0, max: 100 },
    effectiveDate: { type: Date, required: true, default: Date.now },

    rateHistory: { type: [rateHistoryEntrySchema], default: [] },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

hsnMasterSchema.index({ organizationId: 1, hsnCode: 1 }, { unique: true });
hsnMasterSchema.index({ organizationId: 1, isActive: 1 });

const HsnMaster = mongoose.models.HsnMaster || mongoose.model('HsnMaster', hsnMasterSchema);
module.exports = HsnMaster;
