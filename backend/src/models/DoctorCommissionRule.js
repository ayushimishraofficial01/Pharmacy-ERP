// Phase 10 — doctor commission/incentive rules (requirement 6).
// A rule can target a specific medicine, a category, a manufacturer, or
// nothing (a doctor's/org's default rate) — resolution picks the most
// specific match (see doctorCommissionService.resolveCommissionRule).
// `doctor: null` means "applies to every doctor" (an org-wide default),
// letting a pharmacy configure e.g. "10% on all Manufacturer X sales,
// referred by any doctor" without one rule per doctor.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const COMMISSION_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'];

const doctorCommissionRuleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null }, // null = applies org-wide across branches

    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null }, // null = default rule for all doctors
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', default: null },
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    manufacturer: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },

    commissionType: { type: String, enum: COMMISSION_TYPES, required: true },
    // PERCENTAGE: % of the sale item's taxable amount.
    // FIXED_AMOUNT: flat amount PER UNIT sold (fixed-amount-per-quantity is
    // the common pharma-commission convention, e.g. "₹5 per strip").
    commissionValue: { type: Number, required: true, min: 0 },

    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null }, // null = open-ended

    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

doctorCommissionRuleSchema.index({ organizationId: 1, doctor: 1, isActive: 1 });
doctorCommissionRuleSchema.index({ organizationId: 1, medicine: 1 });
doctorCommissionRuleSchema.index({ organizationId: 1, category: 1 });
doctorCommissionRuleSchema.index({ organizationId: 1, manufacturer: 1 });

const DoctorCommissionRule = mongoose.models.DoctorCommissionRule || mongoose.model('DoctorCommissionRule', doctorCommissionRuleSchema);
module.exports = DoctorCommissionRule;
module.exports.COMMISSION_TYPES = COMMISSION_TYPES;
