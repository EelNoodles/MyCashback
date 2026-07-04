'use strict';

/**
 * Migration v5: credit card transaction ingestion feature.
 *  - cashback_events: add matchUnspecifiedPayment ("無指定") flag
 *  - card_transactions: stores reported credit card transactions
 *  - card_transaction_api_keys: API keys for the ingest endpoint
 *
 * Usage:  node scripts/migrate-v5.js
 * Safe to run multiple times (checks column/table existence first).
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

async function tableExists(table) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  );
  return rows[0].cnt > 0;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // ── cashback_events.matchUnspecifiedPayment ──
    if (await columnExists('cashback_events', 'matchUnspecifiedPayment')) {
      console.log('⏭️  cashback_events.matchUnspecifiedPayment already exists, skipping');
    } else {
      await sequelize.query(`
        ALTER TABLE cashback_events
        ADD COLUMN matchUnspecifiedPayment TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '「無指定」：除了 paymentMethods 指定的支付方式外，未使用電子支付的交易也一併累計'
        AFTER cycleAnchorDay
      `);
      console.log('✅ Added cashback_events.matchUnspecifiedPayment column');
    }

    // ── card_transactions ──
    if (await tableExists('card_transactions')) {
      console.log('⏭️  card_transactions already exists, skipping');
    } else {
      await sequelize.query(`
        CREATE TABLE card_transactions (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          userId INT UNSIGNED NOT NULL,
          cardId INT UNSIGNED NOT NULL,
          paymentMethodId INT UNSIGNED NULL,
          rawCardName VARCHAR(120) NULL COMMENT '外部系統回報當下的信用卡名稱原文',
          rawPaymentMethodName VARCHAR(120) NULL COMMENT '外部系統回報當下的電子支付名稱原文',
          amount DECIMAL(18,2) NOT NULL,
          transactionAt DATETIME NOT NULL COMMENT '實際交易時間',
          note VARCHAR(255) NULL,
          externalRef VARCHAR(120) NULL COMMENT '呼叫端交易識別碼，供重送判斷重複',
          source ENUM('api','manual') NOT NULL DEFAULT 'api',
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          KEY card_transactions_userId (userId),
          KEY card_transactions_userId_cardId_transactionAt (userId, cardId, transactionAt),
          UNIQUE KEY card_transactions_user_externalref_unique (userId, externalRef),
          CONSTRAINT card_transactions_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT card_transactions_cardId_fk FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE,
          CONSTRAINT card_transactions_paymentMethodId_fk FOREIGN KEY (paymentMethodId) REFERENCES payment_methods(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Created card_transactions table');
    }

    // ── card_transaction_api_keys ──
    if (await tableExists('card_transaction_api_keys')) {
      console.log('⏭️  card_transaction_api_keys already exists, skipping');
    } else {
      await sequelize.query(`
        CREATE TABLE card_transaction_api_keys (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          userId INT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          keyHash VARCHAR(64) NOT NULL COMMENT 'SHA-256(token) 十六進位',
          keyMask VARCHAR(40) NOT NULL,
          isActive TINYINT(1) NOT NULL DEFAULT 1,
          lastUsedAt DATETIME NULL,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          KEY card_transaction_api_keys_userId (userId),
          UNIQUE KEY card_transaction_api_keys_hash_unique (keyHash),
          CONSTRAINT card_transaction_api_keys_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Created card_transaction_api_keys table');
    }

    console.log('\n🎉 Migration v5 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
