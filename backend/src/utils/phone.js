function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

module.exports = { normalizePhone };
