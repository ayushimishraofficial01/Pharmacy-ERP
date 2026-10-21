const express = require('express');
const ctrl = require('../controllers/holdBillController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id/resume', ctrl.resume);
router.delete('/:id', ctrl.remove);

module.exports = router;
