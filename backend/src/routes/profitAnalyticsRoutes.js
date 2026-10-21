const express = require('express');
const ctrl = require('../controllers/profitAnalyticsController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'));
router.get('/', ctrl.summary);

module.exports = router;
