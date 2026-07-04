'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const logger = require('./config/logger');
const { sequelize } = require('./models');
const { initFirebase } = require('./config/firebase');
const { authMiddleware, optionalAuth } = require('./middleware/authMiddleware');
const baseUrlMiddleware = require('./middleware/baseUrl');

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const pointRoutes = require('./routes/points');
const cashbackRoutes = require('./routes/cashback');
const tagRoutes = require('./routes/tags');
const aiRoutes = require('./routes/ai');
const fcmRoutes = require('./routes/fcm');
const transactionRoutes = require('./routes/transactions');
const ingestRoutes = require('./routes/ingest');
const pointCtrl = require('./controllers/pointController');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

// ---------- Logs / uploads dirs ----------
const logDir = path.resolve(process.env.LOG_DIR || './logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const uploadDir = path.resolve('./public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ---------- Init Firebase Admin ----------
initFirebase();

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Core middleware ----------
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret'));

// HTTP request logging via morgan -> winston
const morganStream = {
  write: (msg) => logger.info(msg.trim())
};
app.use(morgan('combined', { stream: morganStream }));

// Inject BASE_URL helpers into res.locals for every view & response
app.use(baseUrlMiddleware);

// ---------- Mount under BASE_URL ----------
const router = express.Router();

// Static files (no auth)
router.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0
}));

// Uploaded images — imageUrl stored as "/uploads/xxx.png" so serve them at that path too
router.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0
}));

// Health check (no auth)
router.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// PWA: Serve manifest and Service Worker publicly
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

router.get('/firebase-messaging-sw.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public/firebase-messaging-sw.js'));
});

// Auth routes (login page is public, sessionLogin posts ID token)
router.use('/auth', authRoutes);

// Login page (public)
router.get('/login', optionalAuth, (req, res) => {
  if (req.user) return res.redirect((BASE_URL || '') + '/');
  res.render('login', {
    title: '登入 - Points & Cashback Hub',
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      vapidKey: process.env.FIREBASE_VAPID_KEY || ''
    }
  });
});

// Machine-to-machine ingestion: authenticated by its own API key
// (middleware/apiKeyAuth.js), intentionally mounted before the session
// authMiddleware below so external callers never need a browser login.
router.use('/api/ingest', ingestRoutes);

// All routes below require an authenticated session
router.use(authMiddleware);

// Page routes
router.use('/', pageRoutes);

// API routes
router.use('/api/points', pointRoutes);
router.use('/api/cashback', cashbackRoutes);
router.use('/api/tags', tagRoutes);
router.use('/api/ai', aiRoutes);
router.use('/api/fcm', fcmRoutes);
router.use('/api/transactions', transactionRoutes);
router.get('/api/expiries/alerts', pointCtrl.listAlerts);

// Mount router with optional BASE_URL prefix
if (BASE_URL) {
  app.use(BASE_URL, router);
  // Redirect root to BASE_URL for convenience
  app.get('/', (req, res) => res.redirect(BASE_URL + '/'));
} else {
  app.use('/', router);
}

// ---------- 404 ----------
app.use((req, res) => {
  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.status(404).render('error', {
      title: '404 - Not Found',
      status: 404,
      message: '找不到此頁面'
    });
  }
  res.status(404).json({ error: 'Not Found' });
});

// ---------- Error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.stack || err.message, url: req.originalUrl });
  const status = err.status || 500;
  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.status(status).render('error', {
      title: `${status} - Error`,
      status,
      message: process.env.NODE_ENV === 'production' ? '伺服器發生錯誤' : err.message
    });
  }
  res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
  });
});

// ---------- Boot ----------
async function boot() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected');
    // Auto-sync schema in dev; production should use migrations.
    const syncMode = process.env.NODE_ENV === 'production'
      ? {}
      : { alter: true };
    await sequelize.sync(syncMode);
    logger.info('Database schema synced');

    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT} (BASE_URL="${BASE_URL || '/'}")`);

      // Start notification cron after server is up
      try {
        const { startExpiryNotificationCron } = require('./services/notificationCron');
        startExpiryNotificationCron();
      } catch (err) {
        logger.warn('Failed to start notification cron', { err: err.message });
      }
    });
  } catch (err) {
    logger.error('Failed to boot', { err: err.stack || err.message });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('UnhandledRejection', { reason: reason && reason.stack ? reason.stack : reason });
});
process.on('uncaughtException', (err) => {
  logger.error('UncaughtException', { err: err.stack || err.message });
});

boot();
