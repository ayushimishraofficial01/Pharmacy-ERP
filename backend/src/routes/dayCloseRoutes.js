const express = require('express');
const ctrl = require('../controllers/dayCloseController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'));
router.get('/preview', ctrl.preview);
router.get('/', ctrl.list);
router.post('/', ctrl.closeDay);

module.exports = router;
