const express = require('express');
const ctrl = require('../controllers/customerController');
const authenticateUser = require('../middleware/authenticateUser');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
