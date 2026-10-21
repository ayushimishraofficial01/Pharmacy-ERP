const express = require('express');
const ctrl = require('../controllers/businessSettingsController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.getSettings);
router.put('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.updateSettings);

module.exports = router;
