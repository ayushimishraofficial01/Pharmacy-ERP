const express = require('express');
const ctrl = require('../controllers/expenseCategoryController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.post('/seed-defaults', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.seedDefaults);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), ctrl.update);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
