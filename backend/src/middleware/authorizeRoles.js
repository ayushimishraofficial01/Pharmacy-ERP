// Ported from Phase 1/2 (identical in both). Usage:
//   router.post('/', authenticateUser, authorizeRoles('ADMIN', 'ACCOUNTANT'), handler)
const { sendError } = require('../utils/apiResponse');

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, { statusCode: 401, message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, { statusCode: 403, message: 'You do not have permission to perform this action.' });
    }
    next();
  };
};

module.exports = authorizeRoles;
