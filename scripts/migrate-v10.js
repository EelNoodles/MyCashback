'use strict';

/**
 * Migration v10: "排除商家" (merchant exclusion) for cashback events. When
 * enabled, any transaction whose merchant text matches one of the exclusion
 * keywords is dropped from the campaign entirely — this gate is checked
 * before the minimum-spend / merchant-limit rules, so an excluded merchant
 * never counts regardless of amount. Most campaigns exclude non-general
 * spending (e.g. 全聯/超商/繳費).
 *  - excludeMerchantMatch: boolean (預設 false)
 *  - excludeMerchantKeywords: 排除商家關鍵字清單（換行或逗號分隔）
 *
 * Usage:  node scripts/migrate-v10.js
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

    if (await columnExists('cashback_events', 'excludeMerchantMatch')) {
      console.log('⏭️  cashback_events.excludeMerchantMatch already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cashback_events
        ADD COLUMN excludeMerchantMatch TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '「排除商家」：交易命中 excludeMerchantKeywords 其中一項即完全不符合此活動，優先於最低門檻' AFTER merchantKeywords,
        ADD COLUMN excludeMerchantKeywords TEXT NULL
        COMMENT '排除商家關鍵字清單（換行或逗號分隔），比對時忽略大小寫與空白' AFTER excludeMerchantMatch
      `);
      console.log('✅ Added cashback_events.excludeMerchantMatch / excludeMerchantKeywords columns');
    }

    console.log('\n🎉 Migration v10 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
