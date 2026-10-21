// Merged from Phase 1 (auth: bcrypt hashing, JWT-ready shape, toJSON scrub)
// and Phase 7 (organizationId/branchId scoping). Role list expanded to cover
// every role referenced across Phases 1-7 (clinic roles from Phase 5 added).
const { mongoose } = require('../config/db');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const ROLES = [
  'SUPER_ADMIN', // organization owner, sees all branches
  'ADMIN', // branch admin
  'BRANCH_MANAGER',
  'PHARMACIST',
  'DOCTOR',
  'RECEPTIONIST',
  'ACCOUNTANT',
];

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // null for SUPER_ADMIN (org-wide access); required for branch-scoped roles.
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: { type: String, trim: true, default: '' },
    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
    role: { type: String, enum: ROLES, required: [true, 'Role is required'], default: 'RECEPTIONIST' },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Email is unique per organization, not globally (two pharmacies could both
// have a user "admin@clinic.com" in different orgs under this schema design).
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockedUntil;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
module.exports.ROLES = ROLES;
