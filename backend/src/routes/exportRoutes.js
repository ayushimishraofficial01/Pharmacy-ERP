const express = require('express');
const ctrl = require('../controllers/exportController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.get('/:entity', ctrl.exportEntity);

module.exports = router;
