const express = require('express');
const ctrl = require('../controllers/chartOfAccountController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'));
router.get('/', ctrl.list);
router.post('/', ctrl.create);

module.exports = router;
