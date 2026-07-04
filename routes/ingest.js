'use strict';

const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const ctrl = require('../controllers/transactionController');

// Machine-to-machine endpoints, authenticated by a self-issued API key
// (not the Firebase session cookie) — mounted in server.js *before*
// the session authMiddleware so it stays reachable without a browser login.
const router = express.Router();

router.post('/card-transactions', apiKeyAuth, ctrl.ingest);

module.exports = router;
