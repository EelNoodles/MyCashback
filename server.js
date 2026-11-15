'use strict';

require('dotenv').config();
require('./config/timezone'); // must run before any Date math

const path = require('path');
const fs = require('fs');

const logger = require('./config/logger');
const { sequelize } = require('./models');
const { initFirebase } = require('./config/firebase');
const { runMigrations } = require('./services/schemaMigrations');
const { createApp } = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

const logDir = path.resolve(process.env.LOG_DIR || './logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

initFirebase();

async function boot() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected');

    // Additive, idempotent column upgrades for existing tables, then create
    // any missing tables. Development additionally lets Sequelize alter.
    const { added, backfilled } = await runMigrations(sequelize);
    if (added.length || backfilled.length) logger.info('Schema upgraded', { added, backfilled });
    await sequelize.sync(process.env.NODE_ENV === 'production' ? {} : { alter: true });
    logger.info('Database schema synced');

    const app = createApp();
    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT} (BASE_URL="${BASE_URL || '/'}", TZ=${process.env.TZ})`);
      try {
        const { startNotificationCron } = require('./services/notificationCron');
        startNotificationCron();
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
