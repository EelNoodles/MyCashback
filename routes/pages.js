'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('dashboard', { title: '儀表板 - Points & Cashback Hub', active: 'dashboard' });
});

router.get('/points', (req, res) => {
  res.render('points', { title: '點數時間軸 - Points & Cashback Hub', active: 'points' });
});

router.get('/cashback', (req, res) => {
  res.render('cashback', { title: '回饋活動 - Points & Cashback Hub', active: 'cashback' });
});

router.get('/tags', (req, res) => {
  res.render('tags', { title: '卡片與支付方式 - Points & Cashback Hub', active: 'tags' });
});

// PWA manifest & service-worker need to live under BASE_URL too
router.get('/manifest.webmanifest', (req, res) => {
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '') || '/';
  res.type('application/manifest+json');
  res.json({
    name: 'Points & Cashback Hub',
    short_name: 'Cashback',
    description: '點數與回饋資產管理中樞',
    start_url: baseUrl === '/' ? '/' : baseUrl + '/',
    scope: baseUrl === '/' ? '/' : baseUrl + '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#1a76f5',
    orientation: 'portrait-primary',
    icons: [
      {
        src: (baseUrl === '/' ? '' : baseUrl) + '/static/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: (baseUrl === '/' ? '' : baseUrl) + '/static/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    shortcuts: [
      {
        name: '點數時間軸',
        url: (baseUrl === '/' ? '' : baseUrl) + '/points'
      },
      {
        name: '回饋活動',
        url: (baseUrl === '/' ? '' : baseUrl) + '/cashback'
      }
    ]
  });
});

router.get('/service-worker.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(require('path').resolve('./public/service-worker.js'));
});

module.exports = router;
