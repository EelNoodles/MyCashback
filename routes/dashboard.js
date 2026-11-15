'use strict';

const express = require('express');
const ctrl = require('../controllers/dashboardController');

const router = express.Router();

router.get('/summary', ctrl.summary);

module.exports = router;
