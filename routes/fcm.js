'use strict';

const express = require('express');
const ctrl = require('../controllers/fcmController');

const router = express.Router();

router.post('/token', ctrl.register);
router.delete('/token', ctrl.remove);

module.exports = router;
