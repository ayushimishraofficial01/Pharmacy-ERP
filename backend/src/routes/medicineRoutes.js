const express = require('express');
const ctrl = require('../controllers/medicineController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/substitutes', ctrl.substitutes);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.update);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
