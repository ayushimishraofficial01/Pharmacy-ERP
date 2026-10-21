// Branch-scoped writes (stock, sales, purchases...) need a concrete branchId.
// Regular users always have one from their user doc; a SUPER_ADMIN acting
// org-wide must select a branch via the X-Branch-Id header for these routes.
const { sendError } = require('../utils/apiResponse');

function requireBranch(req, res, next) {
  if (!req.branchId) {
    return sendError(res, { statusCode: 400, message: 'This action requires a branch context. Send an X-Branch-Id header.' });
  }
  next();
}

module.exports = requireBranch;
