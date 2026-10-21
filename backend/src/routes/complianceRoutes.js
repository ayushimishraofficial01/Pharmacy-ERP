const express = require('express');
const ctrl = require('../controllers/complianceController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser);
router.get('/check', ctrl.check);
router.get('/restricted-medicines', ctrl.restrictedMedicines);
// Compliance report can reveal patient/prescription info — restrict to
// staff roles who legitimately need it, same set the sale-creating roles use.
router.get('/sales-report', requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.salesReport);

module.exports = router;
