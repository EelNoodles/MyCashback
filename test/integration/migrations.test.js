'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../support/harness');
const { runMigrations } = require('../../services/schemaMigrations');

const quiet = { info() {}, warn() {}, error() {} };

test('migrations add missing columns to existing tables and backfill set rows', async (t) => {
  if (!(await H.dbAvailable())) return t.skip('database not available');
  const { sequelize } = H;
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await sequelize.sync({ force: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  // Fresh schema: nothing to do.
  let r = await runMigrations(sequelize, { log: quiet });
  assert.deepEqual(r.added, []);

  // Simulate the pre-upgrade production schema.
  await sequelize.query('ALTER TABLE cards DROP COLUMN aliases');
  await sequelize.query('ALTER TABLE cashback_events DROP COLUMN minimumSpendScope, DROP COLUMN requiresRegistration, DROP COLUMN registeredAt');
  await sequelize.query('ALTER TABLE point_histories DROP COLUMN targetBalance');
  const [u] = await sequelize.query("INSERT INTO users (firebaseUid, createdAt, updatedAt) VALUES ('m1', NOW(), NOW())");
  const [p] = await sequelize.query(`INSERT INTO points (userId, name, currentBalance, createdAt, updatedAt) VALUES (${u}, 'P', 500, NOW(), NOW())`);
  await sequelize.query(`INSERT INTO point_histories (pointId, changeType, delta, balanceAfter, occurredAt, createdAt, updatedAt) VALUES (${p}, 'set', 500, 500, NOW(), NOW(), NOW())`);
  await sequelize.query(`INSERT INTO cashback_events (userId, title, rewardType, cycleType, matchUnspecifiedPayment, requireMerchantMatch, excludeMerchantMatch, rewardRounding, rewardCalcMode, rewardPrecision, createdAt, updatedAt) VALUES (${u}, 'old', 'cash', 'none', 0, 0, 0, 'round', 'aggregate', 0, NOW(), NOW())`);

  r = await runMigrations(sequelize, { log: quiet });
  assert.deepEqual(r.added.sort(), [
    'cards.aliases', 'cashback_events.minimumSpendScope', 'cashback_events.registeredAt',
    'cashback_events.requiresRegistration', 'point_histories.targetBalance'
  ]);
  assert.equal(r.backfilled.length, 1);
  const [[ev]] = await sequelize.query("SELECT minimumSpendScope, requiresRegistration FROM cashback_events WHERE title = 'old'");
  assert.equal(ev.minimumSpendScope, 'perTransaction');
  assert.equal(Number(ev.requiresRegistration), 0);
  const [[h]] = await sequelize.query('SELECT targetBalance FROM point_histories');
  assert.equal(Number(h.targetBalance), 500);

  // Idempotent.
  r = await runMigrations(sequelize, { log: quiet });
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.backfilled, []);
  await sequelize.close();
});
