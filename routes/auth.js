'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/sessionLogin', ctrl.sessionLogin);
router.post('/logout', ctrl.logout);
router.get('/me', authMiddleware, ctrl.me);

module.exports = router;
