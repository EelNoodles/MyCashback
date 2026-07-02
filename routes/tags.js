'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ctrl = require('../controllers/tagController');

const uploadDir = path.resolve('./public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.\w]/g, '');
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image files allowed'));
    cb(null, true);
  }
});

const router = express.Router();

router.get('/cards', ctrl.listCards);
router.get('/cards/:id/pan', ctrl.getCardPan);
router.post('/cards', upload.single('image'), ctrl.createCard);
router.put('/cards/:id', upload.single('image'), ctrl.updateCard);
router.delete('/cards/:id', ctrl.deleteCard);

router.get('/payment-methods', ctrl.listPaymentMethods);
router.post('/payment-methods', upload.single('image'), ctrl.createPaymentMethod);
router.put('/payment-methods/:id', upload.single('image'), ctrl.updatePaymentMethod);
router.delete('/payment-methods/:id', ctrl.deletePaymentMethod);

module.exports = router;
