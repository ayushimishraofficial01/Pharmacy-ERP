const express = require('express');
const Category = require('../models/Category');
const buildMasterController = require('../controllers/masterController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();
const ctrl = buildMasterController(Category, 'Category');

router.use(authenticateUser);
router.get('/', ctrl.list);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.update);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
