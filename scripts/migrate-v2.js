'use strict';

/**
 * Migration: Add new columns for v2 features
 *  - cards: imageUrl, lastFour, network
 *  - payment_methods: imageUrl
 *  - cashback_events: cycleType, cycleAnchorDay
 *
 * Usage:  node scripts/migrate-v2.js
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

async function addColumnIfNotExists(table, column, definition, after) {
  if (await columnExists(table, column)) {
    console.log(`⏭️  ${table}.${column} already exists, skipping`);
    return;
  }
  const sql = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}${after ? ` AFTER \`${after}\`` : ''}`;
  await sequelize.query(sql);
  console.log(`✅ Added ${table}.${column}`);
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // ── Cards ──
    await addColumnIfNotExists('cards', 'lastFour', "VARCHAR(4) DEFAULT NULL", 'issuer');
    await addColumnIfNotExists('cards', 'network', "ENUM('visa','mastercard','jcb','amex','unionpay','other') DEFAULT NULL", 'lastFour');
    await addColumnIfNotExists('cards', 'imageUrl', "VARCHAR(500) DEFAULT NULL", 'network');

    // ── Payment Methods ──
    await addColumnIfNotExists('payment_methods', 'imageUrl', "VARCHAR(500) DEFAULT NULL", 'name');

    // ── Cashback Events ──
    await addColumnIfNotExists('cashback_events', 'cycleType', "ENUM('none','weekly','biweekly','monthly') NOT NULL DEFAULT 'none'", 'sourceUrl');
    await addColumnIfNotExists('cashback_events', 'cycleAnchorDay', "TINYINT UNSIGNED DEFAULT NULL", 'cycleType');

    console.log('\n🎉 Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
