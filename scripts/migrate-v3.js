'use strict';

/**
 * Migration v3: Add tables for point expiry tracking and FCM push notifications.
 *  - point_expiries: tracks per-point expiration deadlines
 *  - fcm_tokens: stores user device FCM tokens
 *
 * Usage:  node scripts/migrate-v3.js
 * Safe to run multiple times (checks table existence first).
 */

require('dotenv').config();
const sequelize = require('../config/database');

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

    // ── point_expiries ──
    if (await tableExists('point_expiries')) {
      console.log('⏭️  point_expiries already exists, skipping');
    } else {
      await sequelize.query(`
        CREATE TABLE point_expiries (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          pointId INT UNSIGNED NOT NULL,
          userId INT UNSIGNED NOT NULL,
          amount DECIMAL(18,2) NOT NULL,
          expiryDate DATE NOT NULL COMMENT '到期日期',
          status ENUM('active','dismissed') NOT NULL DEFAULT 'active' COMMENT 'active=警報中, dismissed=已使用',
          note VARCHAR(500) DEFAULT NULL,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          INDEX idx_point_expiries_pointId (pointId),
          INDEX idx_point_expiries_user_status (userId, status),
          INDEX idx_point_expiries_user_date (userId, expiryDate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Created point_expiries table');
    }

    // ── fcm_tokens ──
    if (await tableExists('fcm_tokens')) {
      console.log('⏭️  fcm_tokens already exists, skipping');
    } else {
      await sequelize.query(`
        CREATE TABLE fcm_tokens (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          userId INT UNSIGNED NOT NULL,
          token VARCHAR(500) NOT NULL,
          deviceInfo VARCHAR(500) DEFAULT NULL,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          UNIQUE KEY fcm_tokens_token_unique (token),
          INDEX idx_fcm_tokens_userId (userId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Created fcm_tokens table');
    }

    console.log('\n🎉 Migration v3 complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
