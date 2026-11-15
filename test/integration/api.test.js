'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../support/harness');
const E = require('../../services/rewardEngine');

let srv;
let dbOk = false;
const today = () => E.formatDateOnly(new Date());
const dayOffset = (n) => E.formatDateOnly(E.addDays(E.startOfDay(new Date()), n));
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test.before(async () => {
  dbOk = await H.dbAvailable();
  if (dbOk) srv = await H.start();
});
test.after(async () => {
  if (srv) await srv.stop();
  await H.sequelize.close().catch(() => {});
});

function needDb(t) {
  if (!dbOk) { t.skip('database not available'); return false; }
  return true;
}

const ids = {};

test('unauthenticated API calls get 401 JSON; unknown API is 404 JSON', async (t) => {
  if (!needDb(t)) return;
  const r = await srv.get('/api/cashback', { user: null });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'UNAUTHORIZED');
  const nf = await srv.get('/api/nope');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, 'NOT_FOUND');
  const bad = await srv.call('POST', '/api/cashback', { body: '{"title":' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'INVALID_JSON');
  const health = await srv.get('/healthz', { user: null });
  assert.equal(health.body.ok, true);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
});

test('cards and payment methods with aliases and usage counts', async (t) => {
  if (!needDb(t)) return;
  const c1 = await srv.post('/api/tags/cards', { name: '玉山 Pi 卡', kind: 'credit', pan: '3560 1234 5678 1234', network: 'jcb', aliases: 'Pi卡\n玉山Pi拍錢包信用卡' });
  assert.equal(c1.status, 201, c1.text);
  assert.equal(c1.body.lastFour, '1234');
  assert.equal(c1.body.hasPan, true);
  assert.equal(c1.body.pan, undefined);
  ids.card1 = c1.body.id;
  const c2 = await srv.post('/api/tags/cards', { name: '國泰 CUBE', kind: 'credit' });
  ids.card2 = c2.body.id;
  const dup = await srv.post('/api/tags/cards', { name: '國泰 CUBE' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'DUPLICATE_NAME');
  const pm = await srv.post('/api/tags/payment-methods', { name: 'LINE Pay', aliases: 'LINEPAY' });
  assert.equal(pm.status, 201);
  ids.pm = pm.body.id;
  const pan = await srv.get(`/api/tags/cards/${ids.card1}/pan`);
  assert.equal(pan.body.pan, '3560123456781234');
  const other = await srv.get(`/api/tags/cards/${ids.card1}/pan`, { user: 'intruder' });
  assert.equal(other.status, 404);
  const list = await srv.get('/api/tags/cards');
  assert.equal(list.body.length, 2);
  assert.equal(list.body[0].transactionCount, 0);
});

test('event validation errors are clear 400s', async (t) => {
  if (!needDb(t)) return;
  const noTitle = await srv.post('/api/cashback', { title: '  ' });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.error, 'TITLE_REQUIRED');
  const badRange = await srv.post('/api/cashback', { title: 'x', startDate: '2026-12-01', endDate: '2026-11-01' });
  assert.equal(badRange.body.error, 'DATE_RANGE_INVALID');
  const badUrl = await srv.post('/api/cashback', { title: 'x', sourceUrl: 'javascript:alert(1)' });
  assert.equal(badUrl.body.error, 'INVALID_SOURCE_URL');
  const badPct = await srv.post('/api/cashback', { title: 'x', cashbackPercent: 150 });
  assert.equal(badPct.body.error, 'INVALID_CASHBACK_PERCENT');
  const badAnchor = await srv.post('/api/cashback', { title: 'x', cycleType: 'weekly', cycleAnchorDay: 9 });
  assert.equal(badAnchor.body.error, 'INVALID_CYCLE_ANCHOR_DAY');
});

test('create campaign, manual transactions → usage with cap math', async (t) => {
  if (!needDb(t)) return;
  const ev = await srv.post('/api/cashback', {
    title: 'Pi LINE Pay 5%', startDate: dayOffset(-10), endDate: dayOffset(30), cashbackPercent: 5, maxReward: 300,
    minimumSpend: 200, cycleType: 'none', cardIds: [ids.card1], paymentMethodIds: [ids.pm],
    excludeMerchantMatch: true, excludeMerchantKeywords: '繳費，儲值', requiresRegistration: true
  });
  assert.equal(ev.status, 201, ev.text);
  ids.ev1 = ev.body.id;
  assert.equal(ev.body.excludeMerchantKeywords, '繳費\n儲值');
  assert.equal(ev.body.needsRegistration, true);
  assert.equal(ev.body.timing.phase, 'active');
  assert.equal(ev.body.timing.daysLeft, 31);
  assert.equal(ev.body.usage.usedAmount, 0);
  assert.equal(ev.body.cards[0].pan, undefined);

  const add = (amount, note, extra = {}) => srv.post('/api/transactions', { cardId: ids.card1, paymentMethodId: ids.pm, amount, note, transactionAt: hoursAgo(2), ...extra });
  const t1 = await add(2000, '全聯');
  assert.equal(t1.status, 201, t1.text);
  assert.equal(t1.body.matchedEvents.length, 1);
  assert.equal(t1.body.matchedEvents[0].estimatedReward, 100);
  await add(3000, '家樂福');
  const t3 = await add(150, '小額'); // below minimum → not counted
  assert.equal(t3.body.matchedEvents.length, 0);
  const t4 = await add(5000, '電費繳費'); // excluded merchant
  assert.equal(t4.body.matchedEvents.length, 0);
  await add(999, '直接刷', { paymentMethodId: null }); // no LINE Pay → doesn't match

  const got = await srv.get(`/api/cashback/${ids.ev1}`);
  assert.equal(got.body.usage.usedAmount, 5000);
  assert.equal(got.body.usage.txnCount, 2);
  assert.equal(got.body.usage.excludedCount, 2);
  assert.equal(got.body.usage.estimatedReward, 250);
  assert.equal(got.body.usage.remainingReward, 50);
  assert.equal(got.body.usage.remainingCapAmount, 990);
  assert.equal(got.body.usage.capReached, false);
});

test('partial PUT keeps untouched fields; registration and duplicate', async (t) => {
  if (!needDb(t)) return;
  const up = await srv.put(`/api/cashback/${ids.ev1}`, { maxReward: 200 });
  assert.equal(up.status, 200, up.text);
  assert.equal(Number(up.body.maxReward), 200);
  assert.equal(Number(up.body.cashbackPercent), 5);
  assert.equal(up.body.cards.length, 1);
  assert.equal(up.body.usage.estimatedReward, 200);
  assert.equal(up.body.usage.capReached, true);

  const reg = await srv.put(`/api/cashback/${ids.ev1}/registration`, { registered: true });
  assert.equal(reg.body.registeredAt, today());
  assert.equal(reg.body.needsRegistration, false);

  const dup = await srv.post(`/api/cashback/${ids.ev1}/duplicate`, { startDate: dayOffset(31), endDate: dayOffset(60) });
  assert.equal(dup.status, 201, dup.text);
  assert.equal(dup.body.title, 'Pi LINE Pay 5%（複製）');
  assert.equal(dup.body.registeredAt, null);
  assert.equal(dup.body.timing.phase, 'upcoming');
  assert.equal(dup.body.cards[0].id, ids.card1);
  ids.evDup = dup.body.id;

  const ongoing = await srv.get('/api/cashback?status=ongoing');
  assert.ok(ongoing.body.every((e) => e.timing.phase === 'active'));
  const upcoming = await srv.get('/api/cashback?status=upcoming');
  assert.deepEqual(upcoming.body.map((e) => e.id), [ids.evDup]);
  const search = await srv.get('/api/cashback?q=line pay');
  assert.ok(search.body.some((e) => e.id === ids.ev1));
  const byCard = await srv.get(`/api/cashback?cardId=${ids.card2}`);
  assert.equal(byCard.body.length, 0);
});

test('API key ingest: alias / case-insensitive / last-four matching, idempotency, update, delete', async (t) => {
  if (!needDb(t)) return;
  const k = await srv.post('/api/transactions/api-keys', { name: '記帳 App' });
  assert.equal(k.status, 201);
  assert.match(k.body.token, /^mcb_/);
  ids.token = k.body.token;
  const auth = { user: null, headers: { Authorization: `Bearer ${ids.token}` } };

  const noKey = await srv.post('/api/ingest/card-transactions', { cardName: 'x', amount: 1 }, { user: null });
  assert.equal(noKey.status, 401);
  const badKey = await srv.post('/api/ingest/card-transactions', { cardName: 'x', amount: 1 }, { user: null, headers: { Authorization: 'Bearer nope' } });
  assert.equal(badKey.body.error, 'INVALID_API_KEY');

  const r1 = await srv.post('/api/ingest/card-transactions', { cardName: '玉山Pi拍錢包信用卡', paymentMethodName: 'linepay', amount: 100, note: '全家', externalRef: 'L-1', transactionAt: hoursAgo(1) }, auth);
  assert.equal(r1.status, 201, r1.text);
  assert.equal(r1.body.card.id, ids.card1);
  assert.equal(r1.body.paymentMethod.id, ids.pm);
  assert.equal(r1.body.rawCardName, '玉山Pi拍錢包信用卡');
  const again = await srv.post('/api/ingest/card-transactions', { cardName: '玉山 Pi 卡', amount: 100, externalRef: 'L-1' }, auth);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, r1.body.id);
  const upper = await srv.post('/api/ingest/card-transactions', { cardName: '國泰cube', amount: 50 }, { ...auth, headers: { 'X-API-Key': ids.token } });
  assert.equal(upper.status, 201);
  assert.equal(upper.body.card.id, ids.card2);
  const byLast4 = await srv.post('/api/ingest/card-transactions', { cardName: '某個不認得的名字', cardLastFour: '1234', amount: 10 }, auth);
  assert.equal(byLast4.body.card.id, ids.card1);
  const unknown = await srv.post('/api/ingest/card-transactions', { cardName: '不存在', amount: 10 }, auth);
  assert.equal(unknown.status, 422);
  assert.equal(unknown.body.error, 'CARD_NOT_FOUND');
  assert.deepEqual(unknown.body.knownCards.sort(), ['國泰 CUBE', '玉山 Pi 卡'].sort());
  const badAmt = await srv.post('/api/ingest/card-transactions', { cardName: '國泰 CUBE', amount: -5 }, auth);
  assert.equal(badAmt.body.error, 'AMOUNT_INVALID');
  const halfLoc = await srv.post('/api/ingest/card-transactions', { cardName: '國泰 CUBE', amount: 5, latitude: 25 }, auth);
  assert.equal(halfLoc.body.error, 'LOCATION_INCOMPLETE');

  const getRef = await srv.get('/api/ingest/card-transactions/L-1', auth);
  assert.equal(getRef.body.id, r1.body.id);
  const upd = await srv.put('/api/ingest/card-transactions/L-1', { amount: 120, note: '全家（修正）' }, auth);
  assert.equal(upd.status, 200, upd.text);
  assert.equal(Number(upd.body.amount), 120);
  assert.equal(upd.body.card.id, ids.card1);
  const del = await srv.del('/api/ingest/card-transactions/L-1', auth);
  assert.equal(del.body.ok, true);
  const gone = await srv.get('/api/ingest/card-transactions/L-1', auth);
  assert.equal(gone.status, 404);

  const batch = await srv.post('/api/ingest/card-transactions/batch', {
    transactions: [
      { cardName: '國泰 CUBE', amount: 300, externalRef: 'B-1', transactionAt: hoursAgo(3) },
      { cardName: '國泰 CUBE', amount: 300, externalRef: 'B-1' },
      { cardName: '???', amount: 1 }
    ]
  }, auth);
  assert.equal(batch.status, 200, batch.text);
  assert.deepEqual([batch.body.created, batch.body.duplicates, batch.body.errors], [1, 1, 1]);
  assert.equal(batch.body.results[2].error, 'CARD_NOT_FOUND');
  const notArr = await srv.post('/api/ingest/card-transactions/batch', { nope: 1 }, auth);
  assert.equal(notArr.body.error, 'TRANSACTIONS_REQUIRED');

  // Disabled keys stop working.
  await srv.put(`/api/transactions/api-keys/${k.body.id}`, { isActive: false });
  const off = await srv.get('/api/external/summary', auth);
  assert.equal(off.status, 401);
  await srv.put(`/api/transactions/api-keys/${k.body.id}`, { isActive: true });
});

test('transactions list: search by card name, totals, stats', async (t) => {
  if (!needDb(t)) return;
  const all = await srv.get('/api/transactions?pageSize=5');
  assert.equal(all.status, 200);
  assert.equal(all.body.items.length, 5);
  assert.ok(all.body.total >= 8);
  const sum = all.body.summary.totalAmount;
  assert.ok(sum > 10000);
  const cube = await srv.get('/api/transactions?q=cube');
  assert.ok(cube.body.items.length >= 2);
  assert.ok(cube.body.items.every((x) => x.card.name === '國泰 CUBE'));
  assert.equal(cube.body.summary.totalAmount, 350);
  const none = await srv.get('/api/transactions?paymentMethodId=none&cardId=' + ids.card1);
  assert.ok(none.body.items.every((x) => x.paymentMethodId === null));
  const stats = await srv.get('/api/transactions/stats');
  assert.equal(stats.status, 200, stats.text);
  assert.equal(stats.body.totalAmount, sum);
  assert.ok(stats.body.byCard.length === 2);
  assert.ok(stats.body.byDay.length >= 1);
  const pct = await srv.get('/api/transactions?q=100%25');
  assert.equal(pct.status, 200);
});

test('recommend: session + external API, cap-aware ranking', async (t) => {
  if (!needDb(t)) return;
  await srv.post('/api/cashback', { title: 'CUBE 3% 無上限', startDate: dayOffset(-5), endDate: dayOffset(20), cashbackPercent: 3, cardIds: [ids.card2] });
  await srv.post('/api/cashback', { title: 'CAMA 限定 10%', startDate: dayOffset(-5), endDate: dayOffset(20), cashbackPercent: 10, cardIds: [ids.card2], requireMerchantMatch: true, merchantKeywords: 'CAMA' });
  const r = await srv.get('/api/cashback/recommend?amount=1000&merchant=全聯');
  assert.equal(r.status, 200, r.text);
  // Pi 5% is already capped (200) → CUBE 3% (30) wins
  assert.equal(r.body.options[0].card.name, '國泰 CUBE');
  assert.equal(r.body.options[0].totalReward, 30);
  const pi = r.body.options.find((o) => o.cardId === ids.card1);
  assert.equal(pi.totalReward, 0);
  const cama = await srv.get('/api/cashback/recommend?amount=1000&merchant=cama 咖啡');
  assert.equal(cama.body.options[0].totalReward, 130);
  const missing = await srv.get('/api/cashback/recommend');
  assert.equal(missing.body.error, 'AMOUNT_REQUIRED');

  const ext = await srv.get('/api/external/recommend?amount=1000&merchant=CAMA', { user: null, headers: { Authorization: `Bearer ${ids.token}` } });
  assert.equal(ext.status, 200, ext.text);
  assert.match(ext.body.best.text, /國泰 CUBE/);
});

test('external read API: cards, events, summary, transactions, points', async (t) => {
  if (!needDb(t)) return;
  const auth = { user: null, headers: { Authorization: `Bearer ${ids.token}` } };
  const cards = await srv.get('/api/external/cards', auth);
  assert.equal(cards.status, 200);
  const pi = cards.body.cards.find((c) => c.id === ids.card1);
  assert.ok(pi.events.some((e) => e.id === ids.ev1));
  assert.deepEqual(pi.events.find((e) => e.id === ids.ev1).excludeMerchantKeywords, ['繳費', '儲值']);
  const events = await srv.get('/api/external/events?status=all', auth);
  assert.ok(events.body.events.length >= 4);
  assert.ok(events.body.events[0].timing);
  const summary = await srv.get('/api/external/summary', auth);
  assert.ok(summary.body.month.spend > 0);
  const txns = await srv.get('/api/external/transactions?pageSize=2', auth);
  assert.equal(txns.body.items.length, 2);
  const pts = await srv.get('/api/external/points', auth);
  assert.ok(Array.isArray(pts.body.points));
  assert.ok(Number(cards.headers.get('x-ratelimit-remaining')) > 0);
});

test('rewards audit + receipts: expected snapshot and difference', async (t) => {
  if (!needDb(t)) return;
  const audit = await srv.get('/api/cashback/rewards-audit?status=all');
  assert.equal(audit.status, 200, audit.text);
  const ev = audit.body.events.find((e) => e.id === ids.ev1);
  assert.equal(ev.usage.estimatedReward, 200);
  assert.equal(ev.usage.transactions.length, 2);
  assert.equal(ev.usage.excludedTransactions.length, 2);
  assert.ok(ev.usage.excludedTransactions.some((x) => x.reason === 'excludedMerchant' && x.keyword === '繳費'));
  assert.equal(ev.reconciliation.received, null);

  const rc = await srv.post(`/api/cashback/${ids.ev1}/receipts`, { periodStart: dayOffset(-10), periodEnd: dayOffset(30), receivedAmount: 180, note: '帳單回饋' });
  assert.equal(rc.status, 201, rc.text);
  assert.equal(rc.body.expectedAmount, 200);
  assert.equal(rc.body.difference, -20);
  assert.equal(rc.body.receivedDate, today());
  const audit2 = await srv.get('/api/cashback/rewards-audit?status=all');
  const ev2 = audit2.body.events.find((e) => e.id === ids.ev1);
  assert.equal(ev2.reconciliation.received, 180);
  assert.equal(ev2.reconciliation.difference, -20);
  const list = await srv.get('/api/cashback/receipts');
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.totals.received, 180);
  const upd = await srv.put(`/api/cashback/${ids.ev1}/receipts/${rc.body.id}`, { receivedAmount: 200 });
  assert.equal(upd.body.difference, 0);
  const noAmt = await srv.post(`/api/cashback/${ids.ev1}/receipts`, {});
  assert.equal(noAmt.body.error, 'RECEIVED_AMOUNT_REQUIRED');
  const custom = await srv.get(`/api/cashback/rewards-audit?status=all&range=range&from=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`);
  assert.equal(custom.body.range, 'range');
  const prev = await srv.get('/api/cashback/rewards-audit?status=all&range=prevCycle');
  assert.equal(prev.status, 200);
  const bad = await srv.get('/api/cashback/rewards-audit?range=range&from=2026-12-01&to=2026-11-01');
  assert.equal(bad.body.error, 'RANGE_INVALID');
});

test('points: a "set" entry keeps its stated balance when earlier rows change', async (t) => {
  if (!needDb(t)) return;
  const p = await srv.post('/api/points', { name: '全聯福利點', issuer: '全聯', currentBalance: 0, valuePerPoint: 1 });
  assert.equal(p.status, 201, p.text);
  ids.point = p.body.id;
  const base = `/api/points/${ids.point}/histories`;
  const t1 = new Date(Date.now() - 3 * 86400000).toISOString();
  const t2 = new Date(Date.now() - 2 * 86400000).toISOString();
  const t3 = new Date(Date.now() - 1 * 86400000).toISOString();
  const s = await srv.post(base, { changeType: 'set', amount: 500, occurredAt: t2 });
  assert.equal(s.body.currentBalance, 500);
  const e = await srv.post(base, { changeType: 'earn', amount: 100, occurredAt: t1 }); // inserted BEFORE the set
  assert.equal(e.body.currentBalance, 500);
  const sp = await srv.post(base, { changeType: 'spend', amount: 50, occurredAt: t3 });
  assert.equal(sp.body.currentBalance, 450);
  const h = await srv.get(base);
  const setRow = h.body.histories.find((x) => x.changeType === 'set');
  assert.equal(setRow.balanceAfter, 500);
  assert.equal(setRow.targetBalance, 500);
  assert.equal(setRow.delta, 400);
  // editing the earlier row still doesn't move the stated balance
  const earn = h.body.histories.find((x) => x.changeType === 'earn');
  const ed = await srv.put(`${base}/${earn.id}`, { amount: 300 });
  assert.equal(ed.body.currentBalance, 450);
  const dl = await srv.del(`${base}/${setRow.id}`);
  assert.equal(dl.body.currentBalance, 250);
  const bad = await srv.post(base, { changeType: 'nope', amount: 1 });
  assert.equal(bad.body.error, 'INVALID_CHANGE_TYPE');

  const ex = await srv.post(`/api/points/${ids.point}/expiries`, { amount: 100, expiryDate: dayOffset(5) });
  assert.equal(ex.status, 201);
  assert.equal(ex.body.daysLeft, 5);
  const alerts = await srv.get('/api/expiries/alerts');
  assert.equal(alerts.body[0].point.name, '全聯福利點');
  const list = await srv.get('/api/points');
  assert.equal(list.body[0].value, 250);
  assert.equal(list.body[0].nextExpiry.daysLeft, 5);
  const noDate = await srv.post(`/api/points/${ids.point}/expiries`, { amount: 1 });
  assert.equal(noDate.body.error, 'AMOUNT_AND_DATE_REQUIRED');
});

test('dashboard summary: attention items and totals', async (t) => {
  if (!needDb(t)) return;
  await srv.post('/api/cashback', { title: '待登錄活動', startDate: dayOffset(-1), endDate: dayOffset(2), cashbackPercent: 2, maxReward: 100, cardIds: [ids.card2], requiresRegistration: true });
  const s = await srv.get('/api/dashboard/summary');
  assert.equal(s.status, 200, s.text);
  const types = s.body.attention.map((a) => a.type);
  assert.ok(types.includes('registration_needed'));
  assert.ok(types.includes('event_ending'));
  assert.ok(types.includes('point_expiring'));
  assert.equal(s.body.attention[0].severity, 'high');
  assert.ok(s.body.events.ongoing >= 3);
  assert.equal(s.body.events.upcoming, 1);
  assert.equal(s.body.points.totalValue, 250);
  assert.ok(s.body.rewards.estimatedThisCycle >= 200);
  assert.equal(s.body.rewards.receivedThisMonth, 200);
});

test('users cannot see or touch each other\'s data', async (t) => {
  if (!needDb(t)) return;
  const other = { user: 'u2' };
  assert.equal((await srv.get(`/api/cashback/${ids.ev1}`, other)).status, 404);
  assert.equal((await srv.put(`/api/cashback/${ids.ev1}`, { title: 'hack' }, other)).status, 404);
  assert.equal((await srv.del(`/api/points/${ids.point}`, other)).status, 404);
  assert.equal((await srv.get('/api/transactions', other)).body.total, 0);
  const sneaky = await srv.post('/api/transactions', { cardId: ids.card1, amount: 1 }, other);
  assert.equal(sneaky.body.error, 'CARD_NOT_FOUND');
  // linking someone else's card to your event silently ignores it
  const ev = await srv.post('/api/cashback', { title: 'mine', cardIds: [ids.card1] }, other);
  assert.equal(ev.body.cards.length, 0);
});

test('deleting a campaign removes its receipts', async (t) => {
  if (!needDb(t)) return;
  const r = await srv.del(`/api/cashback/${ids.ev1}`);
  assert.equal(r.body.ok, true);
  const list = await srv.get('/api/cashback/receipts');
  assert.equal(list.body.items.length, 0);
  assert.equal((await srv.get(`/api/cashback/${ids.ev1}`)).status, 404);
});
