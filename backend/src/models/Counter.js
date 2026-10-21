// Ported from Phase 3. Scoped per-organization so code sequences (MED-000001,
// PUR-000001...) don't leak/skew across tenants.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const counterSchema = new Schema({
  _id: { type: String, required: true }, // e.g. "orgId:MEDICINE", "orgId:PURCHASE"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function nextSequence(organizationId, key) {
  const id = `${organizationId}:${key}`;
  const doc = await Counter.findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
}

module.exports = Counter;
module.exports.nextSequence = nextSequence;
