const express = require('express');
const ctrl = require('../controllers/consultationController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR'));
router.get('/', ctrl.list);
router.post('/', ctrl.start);
router.get('/:id', ctrl.getOne);
router.put('/:id', ctrl.update);

module.exports = router;
