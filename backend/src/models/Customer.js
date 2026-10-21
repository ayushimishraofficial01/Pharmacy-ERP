// Ported from Phase 4. Minimal on purpose — Stage 6 (Finance/CRM analytics)
// builds segments/spend-analysis on top of this, it doesn't need its own
// Customer record.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: null, trim: true },
    address: { type: String, default: null },
    doctorName: { type: String, default: null, trim: true },
    gstin: { type: String, default: null },
    state: { type: String, default: null },
    isWalkIn: { type: Boolean, default: false },
    creditLimit: { type: Number, default: 0 },
    // Running outstanding balance from credit sales.
    outstandingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

customerSchema.index({ organizationId: 1, mobile: 1 });
customerSchema.index({ name: 'text' });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
