const express = require('express');
const ctrl = require('../controllers/incomeController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'), ctrl.create);
router.patch('/:id/cancel', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), ctrl.cancel);

module.exports = router;
