'use strict';

/**
 * Integration-test harness: boots the real Express app against a real MySQL
 * / MariaDB test database, with the Firebase session check replaced by a
 * header-based stub (`x-test-user: <uid>`). Nothing here is reachable in
 * production — server.js always uses the real authMiddleware.
 *
 * DB settings: TEST_DB_HOST / TEST_DB_PORT / TEST_DB_NAME / TEST_DB_USER /
 * TEST_DB_PASSWORD (defaults: 127.0.0.1:3306, mycashback_test, mcb/mcb).
 * When the database is unreachable the integration tests are skipped.
 */

const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.LOG_DIR = process.env.LOG_DIR || path.join(os.tmpdir(), 'mycashback-test-logs');
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'mycashback_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'mcb';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD !== undefined ? process.env.TEST_DB_PASSWORD : 'mcb';
process.env.BASE_URL = process.env.TEST_BASE_URL || '';
require('../../config/timezone');

const models = require('../../models');
const { createApp } = require('../../app');

const { sequelize, User } = models;

async function stubAuth(req, res, next) {
  const uid = req.get('x-test-user') || (req.cookies && req.cookies.testuser);
  if (!uid) {
    if (req.path.startsWith('/api') || (req.get('accept') || '').includes('application/json')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '請重新登入' });
    }
    return res.redirect((process.env.BASE_URL || '') + '/login');
  }
  try {
    const [user] = await User.findOrCreate({ where: { firebaseUid: uid }, defaults: { firebaseUid: uid, email: `${uid}@test.local`, displayName: uid } });
    req.user = user;
    res.locals.currentUser = { id: user.id, email: user.email, displayName: user.displayName };
    next();
  } catch (err) { next(err); }
}

async function ensureDatabase() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

async function dbAvailable() {
  try {
    await ensureDatabase();
    await sequelize.authenticate();
    return true;
  } catch (_) {
    return false;
  }
}

async function start({ reset = true } = {}) {
  if (reset) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.sync({ force: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  const app = createApp({ auth: stubAuth, optionalAuth: (req, res, next) => next(), quiet: true });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}${process.env.BASE_URL || ''}`;

  async function call(method, url, { user = 'u1', body, headers = {}, raw = false } = {}) {
    const h = { Accept: 'application/json', ...headers };
    if (user) h['x-test-user'] = user;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: res.status, body: raw ? text : json, text, headers: res.headers };
  }

  return {
    app,
    server,
    base,
    call,
    get: (u, o) => call('GET', u, o),
    post: (u, body, o = {}) => call('POST', u, { ...o, body }),
    put: (u, body, o = {}) => call('PUT', u, { ...o, body }),
    del: (u, o = {}) => call('DELETE', u, o),
    async stop() {
      await new Promise((r) => server.close(r));
    }
  };
}

module.exports = { start, dbAvailable, models, sequelize, stubAuth };
