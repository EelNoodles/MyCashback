'use strict';

require('../../config/timezone');
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../services/rewardEngine');

const d = (s) => E.parseDateOnly(s);
const fmt = (x) => E.formatDateOnly(x);
const win = (w) => w && [fmt(w.start), fmt(w.end)];
const at = (s) => new Date(s); // ISO with offset

const card = (id, name = `Card${id}`) => ({ id, name });
const pm = (id, name = `PM${id}`) => ({ id, name });
let seq = 0;
const txn = (amount, when, extra = {}) => ({
  id: ++seq, cardId: 1, paymentMethodId: null, amount, transactionAt: at(when), note: '', ...extra
});

test('time zone is pinned to Asia/Taipei', () => {
  assert.equal(process.env.TZ, 'Asia/Taipei');
  assert.equal(new Date('2026-11-01T00:30:00+08:00').getDate(), 1);
});

test('monthly cycle from the 1st', () => {
  const ev = { cycleType: 'monthly', cycleAnchorDay: 1 };
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-11-15'))), ['2026-11-01', '2026-12-01']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-12-31'))), ['2026-12-01', '2027-01-01']);
});

test('monthly anchor 15 and month-end anchor 31 (was clamped to 28)', () => {
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'monthly', cycleAnchorDay: 15 }, d('2026-11-10'))), ['2026-10-15', '2026-11-15']);
  const ev31 = { cycleType: 'monthly', cycleAnchorDay: 31 };
  assert.deepEqual(win(E.cycleWindowAt(ev31, d('2026-02-15'))), ['2026-01-31', '2026-02-28']);
  assert.deepEqual(win(E.cycleWindowAt(ev31, d('2026-02-28'))), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(win(E.cycleWindowAt(ev31, d('2026-04-30'))), ['2026-04-30', '2026-05-31']);
  // leap year
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'monthly', cycleAnchorDay: 30 }, d('2028-02-29'))), ['2028-02-29', '2028-03-30']);
});

test('weekly cycle starts on the anchor weekday', () => {
  // 2026-11-15 is a Sunday
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'weekly', cycleAnchorDay: 1 }, d('2026-11-15'))), ['2026-11-09', '2026-11-16']);
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'weekly', cycleAnchorDay: 7 }, d('2026-11-15'))), ['2026-11-15', '2026-11-22']);
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'weekly', cycleAnchorDay: 3 }, d('2026-11-15'))), ['2026-11-11', '2026-11-18']);
});

test('biweekly cycles are stable 14-day blocks aligned to the campaign start', () => {
  const ev = { cycleType: 'biweekly', cycleAnchorDay: 1, startDate: '2026-11-02' };
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-11-02'))), ['2026-11-02', '2026-11-16']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-11-15'))), ['2026-11-02', '2026-11-16']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-11-16'))), ['2026-11-16', '2026-11-30']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-12-01'))), ['2026-11-30', '2026-12-14']);
});

test('cycle windows are clamped to the campaign period', () => {
  const ev = { cycleType: 'monthly', cycleAnchorDay: 1, startDate: '2026-11-10', endDate: '2026-12-20' };
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-11-15'))), ['2026-11-10', '2026-12-01']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-12-05'))), ['2026-12-01', '2026-12-21']);
  // before start → first cycle; after end → last cycle
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2026-10-01'))), ['2026-11-10', '2026-12-01']);
  assert.deepEqual(win(E.cycleWindowAt(ev, d('2027-03-01'))), ['2026-12-01', '2026-12-21']);
  // no cycle → whole period
  assert.deepEqual(win(E.cycleWindowAt({ cycleType: 'none', startDate: '2026-11-10', endDate: '2026-12-20' }, d('2026-11-15'))), ['2026-11-10', '2026-12-21']);
});

test('previous cycle window', () => {
  const ev = { cycleType: 'monthly', cycleAnchorDay: 1 };
  assert.deepEqual(win(E.previousCycleWindow(ev, d('2026-11-15'))), ['2026-10-01', '2026-11-01']);
  assert.equal(E.previousCycleWindow({ ...ev, startDate: '2026-11-05' }, d('2026-11-15')), null);
  assert.deepEqual(win(E.previousCycleWindow({ ...ev, startDate: '2026-10-05' }, d('2026-11-15'))), ['2026-10-05', '2026-11-01']);
  // ended campaign → its final cycle
  assert.deepEqual(win(E.previousCycleWindow({ ...ev, endDate: '2026-10-20' }, d('2026-11-15'))), ['2026-10-01', '2026-10-21']);
  assert.equal(E.previousCycleWindow({ cycleType: 'none' }, d('2026-11-15')), null);
  assert.equal(E.previousCycleWindow({ ...ev, startDate: '2026-12-01' }, d('2026-11-15')), null);
});

test('timing: days left counts today, phases are right', () => {
  const now = at('2026-11-15T22:00:00+08:00');
  assert.equal(E.eventTiming({ endDate: '2026-11-15' }, now).daysLeft, 1);
  assert.equal(E.eventTiming({ endDate: '2026-11-15' }, now).phase, 'active');
  assert.equal(E.eventTiming({ endDate: '2026-11-16' }, now).daysLeft, 2);
  assert.equal(E.eventTiming({ endDate: '2026-11-14' }, now).phase, 'ended');
  const up = E.eventTiming({ startDate: '2026-11-20' }, now);
  assert.equal(up.phase, 'upcoming');
  assert.equal(up.daysUntilStart, 5);
  const t = E.eventTiming({ cycleType: 'monthly', cycleAnchorDay: 1, startDate: '2026-11-01', endDate: '2026-11-30' }, now);
  assert.equal(t.cycle.start, '2026-11-01');
  assert.equal(t.cycle.end, '2026-11-30');
  assert.equal(t.cycle.daysLeft, 16);
  assert.equal(t.cycle.endsWithEvent, false);
});

test('a purchase at 00:30 on the 1st (Taipei) belongs to the new month', () => {
  const ev = { cycleType: 'monthly', cycleAnchorDay: 1 };
  const w = E.cycleWindowAt(ev, at('2026-11-01T00:30:00+08:00'));
  assert.deepEqual(win(w), ['2026-11-01', '2026-12-01']);
  assert.equal(E.windowContains(w, at('2026-11-01T00:30:00+08:00')), true);
  assert.equal(E.windowContains(w, at('2026-10-31T23:59:59+08:00')), false);
});

test('exact decimal reward math (no float rounding errors)', () => {
  const r = (amount, pct, p, mode) => Number(E.percentRewardMicro(E.toCents(amount), E.toPctMilli(pct), p, mode)) / 1e6;
  assert.equal(r(1285, 3, 1, 'round'), 38.6);
  assert.equal(r(1285, 3, 0, 'round'), 39);
  assert.equal(r(1285, 3, 0, 'floor'), 38);
  assert.equal(r(1005, 0.1, 2, 'round'), 1.01); // float math (old code) gave 1.00
  assert.equal(r(99.99, 2.5, 2, 'floor'), 2.49);
  assert.equal(r(0, 5, 0, 'round'), 0);
  assert.equal(E.toCents('1280.00'), 128000n);
  assert.equal(E.toCents(19.999), 2000n);
  assert.equal(E.toPctMilli('3.125'), 3125n);
});

test('spendForRewardCents is the exact minimum spend', () => {
  for (const pct of ['1', '2.5', '3', '5', '7.777']) {
    for (const p of [0, 1, 2]) {
      for (const mode of ['round', 'floor']) {
        for (const cap of [1, 50, 300]) {
          const target = BigInt(cap) * 1000000n;
          const t = E.spendForRewardCents(target, E.toPctMilli(pct), p, mode);
          assert.ok(E.percentRewardMicro(t, E.toPctMilli(pct), p, mode) >= target);
          assert.ok(E.percentRewardMicro(t - 1n, E.toPctMilli(pct), p, mode) < target, `${pct} ${p} ${mode} ${cap}`);
        }
      }
    }
  }
});

const baseEv = (o = {}) => ({
  id: 1, title: 'T', cards: [card(1)], paymentMethods: [], cycleType: 'monthly', cycleAnchorDay: 1,
  rewardRounding: 'round', rewardCalcMode: 'aggregate', rewardPrecision: 0, ...o
});

test('aggregate percent with cap: estimated, remaining spend respects rounding', () => {
  const ev = baseEv({ cashbackPercent: '5.000', maxReward: '300.00' });
  const u = E.evaluateCycle(ev, [txn(2000, '2026-11-02T10:00:00+08:00'), txn(3000, '2026-11-03T10:00:00+08:00')]);
  assert.equal(u.usedAmount, 5000);
  assert.equal(u.estimatedReward, 250);
  assert.equal(u.capReached, false);
  assert.equal(u.remainingReward, 50);
  assert.equal(u.remainingCapAmount, 990); // 5990 × 5% = 299.5 → rounds to 300
  const uf = E.evaluateCycle({ ...ev, rewardRounding: 'floor' }, [txn(5000, '2026-11-02T10:00:00+08:00')]);
  assert.equal(uf.remainingCapAmount, 1000);
  const full = E.evaluateCycle(ev, [txn(9000, '2026-11-02T10:00:00+08:00')]);
  assert.equal(full.estimatedReward, 300);
  assert.equal(full.capReached, true);
  assert.equal(full.remainingCapAmount, 0);
  assert.equal(full.capUsedPercent, 100);
});

test('per-transaction vs aggregate calculation', () => {
  const t3 = [txn(333, '2026-11-02T10:00:00+08:00'), txn(333, '2026-11-03T10:00:00+08:00'), txn(333, '2026-11-04T10:00:00+08:00')];
  const agg = E.evaluateCycle(baseEv({ cashbackPercent: 5 }), t3);
  const per = E.evaluateCycle(baseEv({ cashbackPercent: 5, rewardCalcMode: 'perTransaction' }), t3);
  assert.equal(agg.estimatedReward, 50); // 999 × 5% = 49.95 → 50
  assert.equal(per.estimatedReward, 51); // 16.65 → 17, ×3
  assert.equal(per.txnRewards.length, 3);
  assert.equal(per.txnRewards[0].reward, 17);
});

test('per-transaction minimum spend excludes small purchases', () => {
  const ev = baseEv({ cashbackPercent: 10, minimumSpend: 200 });
  const u = E.evaluateCycle(ev, [txn(150, '2026-11-02T10:00:00+08:00'), txn(200, '2026-11-03T10:00:00+08:00')], null, { includeTransactions: true });
  assert.equal(u.txnCount, 1);
  assert.equal(u.usedAmount, 200);
  assert.equal(u.estimatedReward, 20);
  assert.equal(u.excludedTransactions[0].reason, 'belowMinimum');
});

test('cycle-total minimum spend gates the whole cycle', () => {
  const ev = baseEv({ cashbackPercent: 3, minimumSpend: 3000, minimumSpendScope: 'cycleTotal' });
  const a = [txn(1000, '2026-11-02T10:00:00+08:00'), txn(1500, '2026-11-03T10:00:00+08:00')];
  const u1 = E.evaluateCycle(ev, a);
  assert.equal(u1.thresholdMet, false);
  assert.equal(u1.estimatedReward, 0);
  assert.equal(u1.remainingToThreshold, 500);
  assert.equal(u1.potentialReward, 75);
  const u2 = E.evaluateCycle(ev, a.concat([txn(600, '2026-11-04T10:00:00+08:00')]));
  assert.equal(u2.thresholdMet, true);
  assert.equal(u2.estimatedReward, 93);
  // fixed reward with cycle total threshold is earned once
  const fx = baseEv({ cashbackFixed: 100, minimumSpend: 3000, minimumSpendScope: 'cycleTotal' });
  assert.equal(E.evaluateCycle(fx, a).estimatedReward, 0);
  assert.equal(E.evaluateCycle(fx, a.concat([txn(5000, '2026-11-04T10:00:00+08:00')])).estimatedReward, 100);
});

test('fixed reward per qualifying transaction with cap', () => {
  const ev = baseEv({ cashbackFixed: 50, maxReward: 120, minimumSpend: 500 });
  const u = E.evaluateCycle(ev, [
    txn(600, '2026-11-02T10:00:00+08:00'), txn(100, '2026-11-02T11:00:00+08:00'), txn(700, '2026-11-03T10:00:00+08:00')
  ]);
  assert.equal(u.qualifyingCount, 2);
  assert.equal(u.estimatedReward, 100);
  assert.equal(u.remainingCapTransactions, 0); // next one only gets a partial 20
  assert.equal(u.remainingReward, 20);
});

test('merchant include / exclude rules (exclude wins)', () => {
  const ev = baseEv({
    cashbackPercent: 5,
    requireMerchantMatch: true, merchantKeywords: 'CAMA\n全家',
    excludeMerchantMatch: true, excludeMerchantKeywords: '全家 繳費'
  });
  assert.equal(E.disqualifyReason(ev, { amount: 100, note: 'cama café 夏都' }), null);
  assert.equal(E.disqualifyReason(ev, { amount: 100, note: '星巴克' }).reason, 'merchantNotMatched');
  assert.equal(E.disqualifyReason(ev, { amount: 100, note: '全家 繳費 電費' }).reason, 'excludedMerchant');
  assert.deepEqual(E.parseMerchantKeywords('A，B、C\nD,E'), ['A', 'B', 'C', 'D', 'E']);
});

test('payment-method rules', () => {
  const noPm = baseEv({ paymentMethods: [] });
  assert.equal(E.paymentMatches(noPm, null), true);
  assert.equal(E.paymentMatches(noPm, 3), false);
  const withPm = baseEv({ paymentMethods: [pm(3)] });
  assert.equal(E.paymentMatches(withPm, 3), true);
  assert.equal(E.paymentMatches(withPm, null), false);
  assert.equal(E.paymentMatches({ ...withPm, matchUnspecifiedPayment: true }, null), true);
  assert.equal(E.paymentMatches(withPm, '3'), true);
});

test('eventMatchesTransaction uses the whole campaign period', () => {
  const ev = baseEv({ startDate: '2026-11-01', endDate: '2026-11-30', cashbackPercent: 3 });
  assert.equal(E.eventMatchesTransaction(ev, txn(100, '2026-11-30T23:59:00+08:00')), true);
  assert.equal(E.eventMatchesTransaction(ev, txn(100, '2026-12-01T00:00:00+08:00')), false);
  assert.equal(E.eventMatchesTransaction(ev, txn(100, '2026-10-31T23:59:00+08:00')), false);
  assert.equal(E.eventMatchesTransaction(ev, txn(100, '2026-11-10T10:00:00+08:00', { cardId: 2 })), false);
});

test('recommend ranks combos by the marginal reward, cap-aware and stacking', () => {
  const now = at('2026-11-15T12:00:00+08:00');
  const events = [
    // card 1: 5% capped at 100 — already 1900 spent → only 5 left
    baseEv({ id: 1, title: 'A 5%', cards: [card(1, '玉山')], cashbackPercent: 5, maxReward: 100 }),
    // card 2 + LINE Pay: 3% uncapped
    baseEv({ id: 2, title: 'B 3% LINE Pay', cards: [card(2, '國泰')], paymentMethods: [pm(9, 'LINE Pay')], cashbackPercent: 3 }),
    // card 2 any spend: 1% base, stacks with B only for no-epay (B requires LINE Pay so not stacked)
    baseEv({ id: 3, title: 'C 1%', cards: [card(2, '國泰')], cashbackPercent: 1, matchUnspecifiedPayment: true }),
    // card 3: CAMA only 10%
    baseEv({ id: 4, title: 'D CAMA 10%', cards: [card(3, '台新')], cashbackPercent: 10, requireMerchantMatch: true, merchantKeywords: 'CAMA' }),
    // ended campaign ignored
    baseEv({ id: 5, title: 'old', cards: [card(1)], cashbackPercent: 50, endDate: '2026-10-01' })
  ];
  const txns = [txn(1900, '2026-11-05T12:00:00+08:00', { cardId: 1 })];
  const r = E.recommend({ events, txns, amount: 1000, merchant: '全聯', at: now });
  assert.equal(r.consideredEvents, 4);
  assert.equal(r.options[0].card.name, '國泰');
  assert.equal(r.options[0].paymentMethod.name, 'LINE Pay');
  assert.equal(r.options[0].totalReward, 30);
  const yushan = r.options.find((o) => o.cardId === 1);
  assert.equal(yushan.totalReward, 5); // 1900→2900 at 5%: 95→100 (cap)
  const taishin = r.options.find((o) => o.cardId === 3);
  assert.equal(taishin.totalReward, 0);
  assert.equal(taishin.missed[0].reason, 'merchantNotMatched');
  const cama = E.recommend({ events, txns, amount: 1000, merchant: 'CAMA 咖啡', at: now });
  assert.equal(cama.options[0].cardId, 3);
  assert.equal(cama.options[0].totalReward, 100);
  // filters
  const onlyNoEpay = E.recommend({ events, txns, amount: 1000, at: now, paymentMethodId: 'none' });
  assert.ok(onlyNoEpay.options.every((o) => o.paymentMethodId === null));
});
