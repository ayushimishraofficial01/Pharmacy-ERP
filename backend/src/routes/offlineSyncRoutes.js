const express = require('express');
const ctrl = require('../controllers/offlineSyncController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);

router.get('/bootstrap', ctrl.bootstrap);
router.post('/push', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.push);
router.get('/status', ctrl.status);
router.post('/:id/retry', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.retry);
router.post('/:id/resolve-conflict', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.resolveConflict);

module.exports = router;
