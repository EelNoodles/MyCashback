'use strict';

/**
 * Migration v9: reward rounding precision for cashback events — how many
 * decimal places to round/floor to before treating the reward as final.
 *  - rewardPrecision: 0 (預設，捨入至整數) ~ 6
 *
 * Usage:  node scripts/migrate-v9.js
 * Safe to run multiple times (checks column existence first).
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0].cnt > 0;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    if (await columnExists('cashback_events', 'rewardPrecision')) {
      console.log('⏭️  cashback_events.rewardPrecision already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cashback_events
        ADD COLUMN rewardPrecision TINYINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '回饋金額捨入的小數位數 (0-6)：0=捨入至整數 (預設)' AFTER rewardCalcMode
      `);
      console.log('✅ Added cashback_events.rewardPrecision column');
    }

    console.log('\n🎉 Migration v9 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
