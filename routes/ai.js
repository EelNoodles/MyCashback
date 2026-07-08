'use strict';

const express = require('express');
const ctrl = require('../controllers/aiController');
const keys = require('../controllers/aiKeyController');

const router = express.Router();

router.get('/models', ctrl.listModels);
router.post('/parse-event', ctrl.parseEvent);
router.post('/parse-merchants', ctrl.parseMerchants);
router.post('/search-rewards', ctrl.searchRewards);

router.get('/keys', keys.list);
router.post('/keys', keys.create);
router.put('/keys/:id', keys.update);
router.delete('/keys/:id', keys.remove);

module.exports = router;
