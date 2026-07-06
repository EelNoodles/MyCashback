'use strict';

/**
 * Migration v6: add optional consumption location (latitude/longitude) to
 * reported credit card transactions, for the transaction map/heatmap view.
 *
 * Usage:  node scripts/migrate-v6.js
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

    if (await columnExists('card_transactions', 'latitude')) {
      console.log('⏭️  card_transactions.latitude already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE card_transactions
        ADD COLUMN latitude DECIMAL(10,7) NULL COMMENT '消費位置緯度' AFTER note,
        ADD COLUMN longitude DECIMAL(10,7) NULL COMMENT '消費位置經度' AFTER latitude
      `);
      console.log('✅ Added card_transactions.latitude / longitude columns');
    }

    console.log('\n🎉 Migration v6 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
