// Ported from Phase 9. Phase 9 was written against unknown Phase 1-8 models
// via an adapter layer (backend/adapters/) since it had no access to real
// code. Now that real Medicine/Batch/Customer/Sale/User models exist, this
// version references them directly — the adapter indirection is no longer
// needed and would just be extra layers with nothing left to abstract over.
//
// IMPORTANT (kept from Phase 9's spec notes): creating a WhatsApp order must
// NEVER deduct stock. Stock is only ever touched when the order is
// converted to a real Sale (see orderConversionService.js), which goes
// through the exact same stock-movement path as a POS sale.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const ORDER_STATUSES = ['NEW', 'CONTACTED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'];

const STATUS_TRANSITIONS = {
  NEW: ['CONTACTED', 'CONFIRMED', 'CANCELLED', 'REJECTED'],
  CONTACTED: ['CONFIRMED', 'CANCELLED', 'REJECTED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED'];
const ORDER_TYPES = ['DELIVERY', 'PICKUP', 'STORE_COUNTER'];
const ITEM_AVAILABILITY = ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'NEAR_EXPIRY', 'EXPIRED'];
const ITEM_STATUS = ['PENDING', 'CONFIRMED', 'UNAVAILABLE', 'REMOVED'];

const orderItemSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null }, // chosen at confirm time
    medicineName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    mrp: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true },
    availability: { type: String, enum: ITEM_AVAILABILITY, default: 'AVAILABLE' },
    itemStatus: { type: String, enum: ITEM_STATUS, default: 'PENDING' },
  },
  { _id: true }
);

const timelineEntrySchema = new Schema(
  {
    action: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    note: String,
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const whatsAppOrderSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    phoneNumber: { type: String, required: true, index: true },
    customerName: { type: String, required: true },

    orderType: { type: String, enum: ORDER_TYPES, required: true },
    items: { type: [orderItemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },

    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING' },
    paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'], default: null },
    amountPaid: { type: Number, default: 0 },

    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'NEW', index: true },

    deliveryAddress: { type: String, default: '' },
    deliveryPhone: { type: String, default: '' },
    deliveryNotes: { type: String, default: '' },
    assignedDeliveryPerson: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    expectedDeliveryTime: { type: Date, default: null },

    orderNotes: { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Set only when converted — see orderConversionService.js.
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    convertedAt: { type: Date, default: null },

    timeline: { type: [timelineEntrySchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

whatsAppOrderSchema.index({ organizationId: 1, branchId: 1, orderNumber: 1 }, { unique: true });
whatsAppOrderSchema.index({ branchId: 1, orderStatus: 1, createdAt: -1 });
whatsAppOrderSchema.index({ customer: 1, createdAt: -1 });

whatsAppOrderSchema.methods.canTransitionTo = function canTransitionTo(nextStatus) {
  return (STATUS_TRANSITIONS[this.orderStatus] || []).includes(nextStatus);
};

whatsAppOrderSchema.methods.pushTimeline = function pushTimeline(action, user, note) {
  this.timeline.push({ action, user: user?._id || user, userName: user?.name, note, timestamp: new Date() });
};

const WhatsAppOrder = mongoose.models.WhatsAppOrder || mongoose.model('WhatsAppOrder', whatsAppOrderSchema);
module.exports = WhatsAppOrder;
module.exports.constants = { ORDER_STATUSES, STATUS_TRANSITIONS, PAYMENT_STATUSES, ORDER_TYPES, ITEM_AVAILABILITY, ITEM_STATUS };
