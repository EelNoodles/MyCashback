'use strict';

/**
 * Migration v4: add `pan` column to `cards` for encrypted 16-digit PAN storage.
 * Safe to run multiple times (checks column existence first).
 *
 * Usage:  node scripts/migrate-v4.js
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

    if (await columnExists('cards', 'pan')) {
      console.log('⏭️  cards.pan already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cards
        ADD COLUMN pan TEXT NULL
        COMMENT 'AES-256-GCM 加密後的完整卡號 (base64)，供複製使用'
        AFTER lastFour
      `);
      console.log('✅ Added cards.pan column');
    }

    console.log('\n🎉 Migration v4 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
