'use strict';

/**
 * Idempotent, additive schema upgrades — run automatically at boot (and via
 * `npm run db:migrate`) so a deploy never needs a manual migration step.
 *
 * Production boots with sequelize.sync() *without* alter, which creates
 * missing tables but never adds columns to existing ones. This runner fills
 * that gap generically: for every model whose table already exists, any
 * attribute missing from the table is added with the model's own definition
 * (type, default, nullability). Data backfills that a new column needs are
 * listed in BACKFILLS and are written to be safe to re-run.
 *
 * It only ever ADDs — it never drops or changes existing columns.
 */

const logger = require('../config/logger');

const BACKFILLS = [
  {
    name: 'point_histories.targetBalance from balanceAfter for existing set rows',
    table: 'point_histories',
    column: 'targetBalance',
    sql: "UPDATE point_histories SET targetBalance = balanceAfter WHERE changeType = 'set' AND targetBalance IS NULL"
  }
];

async function tableExists(sequelize, table) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    { replacements: [table] }
  );
  return Number(rows[0].cnt) > 0;
}

async function existingColumns(sequelize, table) {
  const [rows] = await sequelize.query(
    'SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    { replacements: [table] }
  );
  return new Set(rows.map((r) => r.name));
}

/**
 * @returns {Promise<{added: string[], backfilled: string[]}>}
 */
async function runMigrations(sequelize, { log = logger } = {}) {
  const qi = sequelize.getQueryInterface();
  const added = [];
  const backfilled = [];

  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const tableName = typeof table === 'string' ? table : table.tableName;
    if (!(await tableExists(sequelize, tableName))) continue; // sync() will create it whole

    const cols = await existingColumns(sequelize, tableName);
    for (const [attrName, attr] of Object.entries(model.rawAttributes)) {
      const field = attr.field || attrName;
      if (cols.has(field)) continue;
      const def = {
        type: attr.type,
        allowNull: attr.allowNull !== false,
        defaultValue: attr.defaultValue,
        comment: attr.comment
      };
      if (attr.defaultValue !== undefined && typeof attr.defaultValue === 'object'
        && attr.defaultValue && attr.defaultValue.constructor && attr.defaultValue.constructor.name === 'NOW') {
        def.defaultValue = sequelize.literal('CURRENT_TIMESTAMP');
      }
      await qi.addColumn(tableName, field, def);
      added.push(`${tableName}.${field}`);
      log.info(`[migrate] added column ${tableName}.${field}`);
    }
  }

  for (const b of BACKFILLS) {
    if (!(await tableExists(sequelize, b.table))) continue;
    const cols = await existingColumns(sequelize, b.table);
    if (!cols.has(b.column)) continue;
    const [res] = await sequelize.query(b.sql);
    const n = res && typeof res.affectedRows === 'number' ? res.affectedRows : 0;
    if (n > 0) {
      backfilled.push(`${b.name} (${n})`);
      log.info(`[migrate] backfill: ${b.name} — ${n} rows`);
    }
  }

  return { added, backfilled };
}

module.exports = { runMigrations };
