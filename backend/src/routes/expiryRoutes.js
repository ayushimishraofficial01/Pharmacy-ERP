const express = require('express');
const ctrl = require('../controllers/expiryController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/dashboard', ctrl.dashboard);
router.get('/near-expiry-report', ctrl.nearExpiryReport);
router.get('/stock-valuation', ctrl.stockValuation);
router.get('/returnable-batches', ctrl.returnableBatches);
router.post('/returns', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.createReturn);

module.exports = router;
