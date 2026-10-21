const express = require('express');
const ctrl = require('../controllers/gstReturnController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

// GST return filing is an accounting/compliance function — restrict write
// actions to roles that can already see financials elsewhere in the app
// (ADMIN/SUPER_ADMIN/ACCOUNTANT/BRANCH_MANAGER), matching the pattern used
// by other finance-adjacent routes (Payment reconciliation, etc).
const CAN_MANAGE_GST = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'];

router.use(authenticateUser, requireBranch);

router.get('/dashboard', ctrl.dashboard);
router.get('/generate', ctrl.generate);
router.get('/portal-status', ctrl.portalStatus);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/export', ctrl.exportFiling);

router.post('/', authorizeRoles(...CAN_MANAGE_GST), ctrl.createOrUpdateFiling);
router.post('/:id/submit', authorizeRoles(...CAN_MANAGE_GST), ctrl.submitFiling);

module.exports = router;
