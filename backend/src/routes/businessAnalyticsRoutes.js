const express = require('express');
const ctrl = require('../controllers/businessAnalyticsController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'));
router.get('/branch-comparison', ctrl.branchComparison); // org-wide, no branch required
router.get('/', requireBranch, ctrl.dashboard);

module.exports = router;
