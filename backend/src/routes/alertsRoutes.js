const express = require('express');
const ctrl = require('../controllers/alertsController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.patch('/:id/read', ctrl.markRead);
router.post('/run', requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.run);

module.exports = router;
