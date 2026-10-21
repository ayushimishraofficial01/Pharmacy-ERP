// In-app notification foundation only — no external SMS/WhatsApp dispatch
// here (that's Phase 9's WhatsApp module, Stage 7, which sends via its own
// adapter and can optionally also write one of these for in-app visibility).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const NOTIFICATION_TYPES = [
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
  'PATIENT_CHECKED_IN',
  'CONSULTATION_STARTED',
  'APPOINTMENT_TOMORROW',
  'APPOINTMENT_TODAY',
  'FOLLOW_UP_DUE',
  // Added for Phase 8's automated business alerts (Stage 9) so they reuse
  // this same delivery mechanism instead of a parallel alerts table.
  'LOW_STOCK',
  'CRITICAL_STOCK',
  'EXPIRY_RISK',
  'HIGH_OUTSTANDING',
  'CREDIT_LIMIT_RISK',
  'LARGE_EXPENSE',
  'SALES_DROP',
  'NEGATIVE_CASH_VARIANCE',
  'UNUSUAL_STOCK_ADJUSTMENT',
  'REVIEW_REQUIRED',
];

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // recipient
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    message: { type: String, required: true },
    relatedEntityType: { type: String, default: null },
    relatedEntityId: { type: Schema.Types.ObjectId, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
