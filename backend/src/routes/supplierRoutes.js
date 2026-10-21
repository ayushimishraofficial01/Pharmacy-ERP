const express = require('express');
const ctrl = require('../controllers/supplierController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST', 'ACCOUNTANT'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST', 'ACCOUNTANT'), ctrl.update);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
