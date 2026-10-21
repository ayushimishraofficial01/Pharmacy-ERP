// Phase 10 — family ledger (requirement 5).
// Members are embedded (not their own collection) — a family is a small,
// bounded group by nature, same reasoning the codebase already applies to
// PrescriptionItem/HoldBillItem: cheap to load whole, no independent
// lifecycle of its own outside the parent Family.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const familyMemberSchema = new Schema(
  {
    // A member is usually a Customer (for billing/outstanding) and/or a
    // Patient (for clinical history) — either, both, or neither (a member
    // can be added by name only, before they have a Customer/Patient record
    // of their own yet).
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', default: null },
    name: { type: String, required: true, trim: true },
    relationship: { type: String, trim: true, default: '' }, // e.g. Self, Spouse, Child, Parent
    isHead: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const familySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    familyCode: { type: String, required: true, trim: true },
    familyName: { type: String, required: true, trim: true },
    primaryContactMobile: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: '' },
    members: { type: [familyMemberSchema], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

familySchema.index({ organizationId: 1, familyCode: 1 }, { unique: true });
familySchema.index({ organizationId: 1, 'members.customer': 1 });
familySchema.index({ organizationId: 1, 'members.patient': 1 });

const Family = mongoose.models.Family || mongoose.model('Family', familySchema);
module.exports = Family;
