const express = require('express');
const ctrl = require('../controllers/controlledDrugRegisterController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

// Narcotic register access is restricted — it carries patient/prescription
// data plus a statutory audit trail, same sensitivity level as the
// compliance sales-report.
router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'));
router.get('/', ctrl.list);
router.get('/balance', ctrl.balance);
router.post('/manual', ctrl.manualEntry);

module.exports = router;
