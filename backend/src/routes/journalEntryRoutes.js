const express = require('express');
const ctrl = require('../controllers/journalEntryController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'));
router.get('/', ctrl.list);
router.post('/', ctrl.create);

module.exports = router;
