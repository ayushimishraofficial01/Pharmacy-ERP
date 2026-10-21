const express = require('express');
const ctrl = require('../controllers/stockCountController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.create);
router.patch('/:id/lines', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.recordCounts);
router.post('/:id/submit', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.submit);
// Approval requires a higher bar than submission — Phase 8's explicit "require authorization" rule.
router.post('/:id/approve-and-adjust', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.approveAndAdjust);

module.exports = router;
