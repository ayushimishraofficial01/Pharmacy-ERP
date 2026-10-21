const express = require('express');
const ctrl = require('../controllers/reorderSuggestionController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.post('/generate', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.generate);
router.put('/:id/approve', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.approve);
router.put('/:id/reject', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.reject);

module.exports = router;
