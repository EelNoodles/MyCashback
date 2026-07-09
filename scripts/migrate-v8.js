'use strict';

/**
 * Migration v8: reward rounding mode + calculation mode for cashback events,
 * used to independently verify how much cashback should have accrued each
 * cycle (catching a card issuer under-crediting rewards).
 *  - rewardRounding: round (預設) | floor
 *  - rewardCalcMode: aggregate (預設) | perTransaction
 *
 * Usage:  node scripts/migrate-v8.js
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

    if (await columnExists('cashback_events', 'rewardRounding')) {
      console.log('⏭️  cashback_events.rewardRounding already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cashback_events
        ADD COLUMN rewardRounding ENUM('round','floor') NOT NULL DEFAULT 'round'
        COMMENT '回饋金額捨入方式：round=四捨五入 (預設), floor=無條件捨去' AFTER merchantKeywords,
        ADD COLUMN rewardCalcMode ENUM('aggregate','perTransaction') NOT NULL DEFAULT 'aggregate'
        COMMENT '回饋計算方式：aggregate=加總後一次計算 (預設), perTransaction=逐筆計算後加總' AFTER rewardRounding
      `);
      console.log('✅ Added cashback_events.rewardRounding / rewardCalcMode columns');
    }

    console.log('\n🎉 Migration v8 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
