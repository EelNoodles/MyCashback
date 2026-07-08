'use strict';

/**
 * Migration v7: "商家限定" (merchant match) option for cashback events —
 * restricts a campaign to transactions whose note/card/payment method
 * mentions one of a configured list of merchant keywords.
 *
 * Usage:  node scripts/migrate-v7.js
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

    if (await columnExists('cashback_events', 'requireMerchantMatch')) {
      console.log('⏭️  cashback_events.requireMerchantMatch already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cashback_events
        ADD COLUMN requireMerchantMatch TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '「商家限定」：交易需包含 merchantKeywords 其中一項才算入' AFTER matchUnspecifiedPayment,
        ADD COLUMN merchantKeywords TEXT NULL
        COMMENT '商家關鍵字清單（換行或逗號分隔），比對時忽略大小寫與空白' AFTER requireMerchantMatch
      `);
      console.log('✅ Added cashback_events.requireMerchantMatch / merchantKeywords columns');
    }

    console.log('\n🎉 Migration v7 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
