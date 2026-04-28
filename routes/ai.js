'use strict';

const express = require('express');
const ctrl = require('../controllers/aiController');

const router = express.Router();

router.post('/parse-event', ctrl.parseEvent);

module.exports = router;
