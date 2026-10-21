// Merged from Phase 1's authenticateUser, extended to attach
// organizationId/branchId onto req (every downstream query filters by these
// — see MERGE_NOTES.md "Branch isolation" section).
//
// SECURITY NOTE: only accepts the token via the Authorization header, never
// via cookie. The frontend (Stage 8) stores the token in localStorage and
// sends it as a Bearer header — it never sets an auth cookie. An earlier
// draft of this middleware also accepted `req.cookies.token` as a fallback;
// that was removed deliberately: accepting a token from a cookie without
// CSRF protection (a double-submit token, SameSite=strict, or similar) is a
// real CSRF hole, and since nothing in this app actually sets that cookie,
// the fallback was unused attack surface with no corresponding benefit. If
// cookie-based auth is added later, add CSRF protection in the same change.
const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const { sendError } = require('../utils/apiResponse');

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return sendError(res, { statusCode: 401, message: 'Authentication required. Please log in.' });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return sendError(res, { statusCode: 401, message: 'Invalid or expired session. Please log in again.' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return sendError(res, { statusCode: 401, message: 'Account no longer exists.' });
    }
    if (!user.isActive) {
      return sendError(res, { statusCode: 403, message: 'Account is deactivated. Contact your administrator.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return sendError(res, { statusCode: 403, message: 'Account is temporarily locked. Try again later.' });
    }

    req.user = user;
    req.organizationId = user.organizationId;
    // SUPER_ADMIN can act org-wide; everyone else is pinned to their branch.
    req.branchId = user.role === 'SUPER_ADMIN' ? req.headers['x-branch-id'] || null : user.branchId;

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticateUser;
