'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ctrl = require('../controllers/pointController');

const uploadDir = path.resolve('./public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.\w]/g, '');
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`);
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

router.get('/', ctrl.list);
router.post('/', upload.single('image'), ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', upload.single('image'), ctrl.update);
router.delete('/:id', ctrl.remove);

router.get('/:id/histories', ctrl.listHistories);
router.post('/:id/histories', ctrl.addHistory);
router.put('/:id/histories/:hid', ctrl.updateHistory);
router.delete('/:id/histories/:hid', ctrl.deleteHistory);

router.get('/:id/expiries', ctrl.listExpiries);
router.post('/:id/expiries', ctrl.addExpiry);
router.put('/:id/expiries/:eid', ctrl.updateExpiry);
router.delete('/:id/expiries/:eid', ctrl.deleteExpiry);

module.exports = router;
