'use strict';

const express = require('express');
const ctrl = require('../controllers/aiController');

const router = express.Router();

router.get('/models', ctrl.listModels);
router.post('/parse-event', ctrl.parseEvent);
router.post('/search-rewards', ctrl.searchRewards);

module.exports = router;
