const express = require('express');
const ctrl = require('../controllers/hsnMasterController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.get('/rate', ctrl.getRate);
router.get('/:id', ctrl.getOne);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.update);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;
