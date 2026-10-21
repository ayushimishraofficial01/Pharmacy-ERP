// Ported from Phase 7 (source of the multi-tenant foundation). Every other
// business model in the merged app is scoped under an Organization, and
// most under a Branch as well — see MERGE_NOTES.md.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    drugLicenseNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },
    financialYearStartMonth: { type: Number, default: 4, min: 1, max: 12 }, // April default (India)
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
