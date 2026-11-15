'use strict';

/**
 * Express application factory. server.js boots it for real; tests call
 * createApp({ auth }) with a stub session-auth middleware so no Firebase
 * project is needed (production never exposes any auth bypass).
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const logger = require('./config/logger');
const baseUrlMiddleware = require('./middleware/baseUrl');

function firebaseClientConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    vapidKey: process.env.FIREBASE_VAPID_KEY || ''
  };
}

function baseUrl() {
  return (process.env.BASE_URL || '').replace(/\/$/, '');
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
}

function createApp(options = {}) {
  const auth = options.auth || require('./middleware/authMiddleware').authMiddleware;
  const optionalAuth = options.optionalAuth || require('./middleware/authMiddleware').optionalAuth;

  const authRoutes = require('./routes/auth');
  const pageRoutes = require('./routes/pages');
  const pointRoutes = require('./routes/points');
  const cashbackRoutes = require('./routes/cashback');
  const tagRoutes = require('./routes/tags');
  const aiRoutes = require('./routes/ai');
  const fcmRoutes = require('./routes/fcm');
  const transactionRoutes = require('./routes/transactions');
  const ingestRoutes = require('./routes/ingest');
  const externalRoutes = require('./routes/external');
  const dashboardRoutes = require('./routes/dashboard');
  const docsRoutes = require('./routes/docs');
  const pointCtrl = require('./controllers/pointController');

  const app = express();
  app.disable('x-powered-by');
  // Behind nginx on the same host: honour X-Forwarded-Proto/Host for absolute URLs.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  const uploadDir = path.resolve('./public/uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret'));
  if (!options.quiet) {
    app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
  }
  app.use(baseUrlMiddleware);

  const router = express.Router();
  const isProd = process.env.NODE_ENV === 'production';

  router.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));
  router.use('/uploads', express.static(uploadDir, { maxAge: isProd ? '7d' : 0 }));

  router.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

  router.get('/manifest.webmanifest', (req, res) => {
    const b = baseUrl();
    res.type('application/manifest+json');
    res.json({
      name: 'MyCashback 回饋管家',
      short_name: 'MyCashback',
      description: '信用卡回饋、刷卡建議與點數管理',
      id: (b || '') + '/',
      start_url: (b || '') + '/',
      scope: (b || '') + '/',
      display: 'standalone',
      background_color: '#f6f7fb',
      theme_color: '#1a76f5',
      orientation: 'portrait',
      lang: 'zh-Hant-TW',
      icons: [
        { src: b + '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: b + '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: b + '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ],
      shortcuts: [
        { name: '刷哪張', short_name: '刷哪張', url: b + '/recommend' },
        { name: '記一筆交易', short_name: '記一筆', url: b + '/transactions?new=1' },
        { name: '回饋活動', short_name: '回饋', url: b + '/cashback' },
        { name: '點數', short_name: '點數', url: b + '/points' }
      ]
    });
  });

  // Service worker (offline shell + FCM). Config is inlined so push works
  // even after the browser restarts the worker.
  const swSource = path.join(__dirname, 'public/firebase-messaging-sw.js');
  router.get(['/firebase-messaging-sw.js', '/sw.js'], (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'no-cache');
    res.set('Service-Worker-Allowed', (baseUrl() || '') + '/');
    const cfg = firebaseClientConfig();
    const head = `self.__FIREBASE_CONFIG = ${JSON.stringify(cfg.apiKey && cfg.messagingSenderId ? cfg : null)};\n`
      + `self.__BASE_URL = ${JSON.stringify(baseUrl())};\n`;
    res.send(head + fs.readFileSync(swSource, 'utf8'));
  });

  // OpenAPI spec (public, no secrets) — the docs page renders it.
  router.use('/api/docs', docsRoutes.publicRouter);

  router.use('/auth', authRoutes);

  router.get('/login', optionalAuth, (req, res) => {
    if (req.user) return res.redirect((baseUrl() || '') + '/');
    res.render('login', { title: '登入 - MyCashback', firebaseConfig: firebaseClientConfig() });
  });

  // API-key authenticated machine endpoints (before the session gate).
  router.use('/api/ingest', ingestRoutes);
  router.use('/api/external', externalRoutes);

  // Everything below requires a signed-in session.
  router.use(auth);

  router.use((req, res, next) => {
    res.locals.firebaseConfig = firebaseClientConfig();
    next();
  });
  router.use('/', pageRoutes);
  router.use('/api/dashboard', dashboardRoutes);
  router.use('/api/points', pointRoutes);
  router.use('/api/cashback', cashbackRoutes);
  router.use('/api/tags', tagRoutes);
  router.use('/api/ai', aiRoutes);
  router.use('/api/fcm', fcmRoutes);
  router.use('/api/transactions', transactionRoutes);
  router.get('/api/expiries/alerts', pointCtrl.listAlerts);

  const b = baseUrl();
  if (b) {
    app.use(b, router);
    app.get('/', (req, res) => res.redirect(b + '/'));
  } else {
    app.use('/', router);
  }

  const wantsJson = (req) => req.originalUrl.replace(b, '').startsWith('/api')
    || !req.accepts('html') || (req.get('accept') || '').includes('application/json');

  app.use((req, res) => {
    if (!wantsJson(req)) {
      return res.status(404).render('error', { title: '找不到頁面', status: 404, message: '找不到此頁面' });
    }
    res.status(404).json({ error: 'NOT_FOUND', message: '找不到此 API' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = err.message;
    if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = '請求 body 不是合法的 JSON'; }
    if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = '圖片不可超過 4MB'; }
    if (err.message === 'Only image files allowed') { status = 400; code = 'INVALID_FILE_TYPE'; message = '只能上傳圖片檔'; }
    if (err.name === 'SequelizeUniqueConstraintError') { status = 409; code = 'DUPLICATE'; message = '資料重複'; }
    if (status >= 500) {
      logger.error('Unhandled error', { err: err.stack || err.message, url: req.originalUrl });
      code = err.code && typeof err.code === 'string' && !/^ER_|^E[A-Z]+$/.test(err.code) ? err.code : 'INTERNAL_ERROR';
      message = isProd ? '伺服器發生錯誤，請稍後再試' : err.message;
    }
    if (!wantsJson(req)) {
      return res.status(status).render('error', { title: `${status} - 錯誤`, status, message });
    }
    res.status(status).json({ error: code, message, ...(err.extra || {}) });
  });

  return app;
}

module.exports = { createApp, firebaseClientConfig };
