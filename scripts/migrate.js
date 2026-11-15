'use strict';

/**
 * Applies all pending additive schema upgrades, then creates any missing
 * tables. Safe to run repeatedly; the server also runs this at boot.
 *
 * Usage:  npm run db:migrate
 */
require('dotenv').config();
require('../config/timezone');

const { sequelize } = require('../models');
const { runMigrations } = require('../services/schemaMigrations');

(async () => {
  try {
    await sequelize.authenticate();
    const { added, backfilled } = await runMigrations(sequelize, { log: console });
    await sequelize.sync();
    console.log(`✅ Migration complete. Added ${added.length} column(s), ${backfilled.length} backfill(s).`);
    added.forEach((c) => console.log('  + ' + c));
    backfilled.forEach((b) => console.log('  ~ ' + b));
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
})();
