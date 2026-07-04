'use strict';

const express = require('express');
const router = express.Router();

// Inject Firebase config on all authenticated pages (for FCM push)
router.use((req, res, next) => {
  res.locals.firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    vapidKey: process.env.FIREBASE_VAPID_KEY || ''
  };
  next();
});
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

router.get('/transactions', (req, res) => {
  res.render('transactions', { title: '信用卡交易紀錄 - Points & Cashback Hub', active: 'transactions' });
});

// PWA manifest & service-worker need to live under BASE_URL too
router.get('/manifest.webmanifest', (req, res) => {
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '') || '/';
  res.type('application/manifest+json');
  res.json({
    name: 'MyCashback 點數追蹤',
    short_name: 'MyCashback',
    description: '點數與回饋資產管理中樞',
    start_url: baseUrl === '/' ? '/' : baseUrl + '/',
    scope: baseUrl === '/' ? '/' : baseUrl + '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
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

// Serve the Service Worker at root scope
router.get('/firebase-messaging-sw.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(require('path').resolve(__dirname, '../public/firebase-messaging-sw.js'));
});

module.exports = router;
