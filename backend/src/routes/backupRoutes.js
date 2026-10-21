const express = require('express');
const ctrl = require('../controllers/backupController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser, authorizeRoles('SUPER_ADMIN', 'ADMIN'));
router.get('/', ctrl.list);
router.post('/', ctrl.record);
router.post('/run', ctrl.run);
router.post('/:id/authorize-restore', ctrl.authorizeRestore);
router.post('/:id/restore', ctrl.restore);
router.get('/schedule', ctrl.getSchedule);
router.put('/schedule', ctrl.updateSchedule);

module.exports = router;
