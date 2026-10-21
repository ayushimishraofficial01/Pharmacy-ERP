const express = require('express');
const ctrl = require('../controllers/stockAnalysisController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/report', ctrl.report);
router.get('/movement', ctrl.movement);
router.put('/movement/thresholds', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.updateThresholds);

module.exports = router;
