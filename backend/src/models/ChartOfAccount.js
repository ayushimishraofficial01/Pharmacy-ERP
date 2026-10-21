// Ported from Phase 6. Optional double-entry foundation — not wired into
// every transaction (Sale/Purchase post to SupplierLedger/Customer balance
// directly, not journal lines); provided as an extensible base for orgs
// that want proper books.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const chartOfAccountSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

chartOfAccountSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.ChartOfAccount || mongoose.model('ChartOfAccount', chartOfAccountSchema);
