'use strict';

/**
 * Realistic demo data for UI tests / screenshots. Dates are relative to now
 * so the dashboard always has something current to show.
 */
const E = require('../../services/rewardEngine');

async function seed(call, user = 'demo') {
  const o = { user };
  const post = async (url, body) => {
    const r = await call('POST', url, { ...o, body });
    if (r.status >= 300) throw new Error(`${url} ${r.status} ${r.text}`);
    return r.body;
  };
  const day = (n) => E.formatDateOnly(E.addDays(E.startOfDay(new Date()), n));
  const at = (daysAgo, h = 12) => {
    const d = E.addDays(E.startOfDay(new Date()), -daysAgo);
    d.setHours(h, 15);
    return d.toISOString();
  };

  const pi = await post('/api/tags/cards', { name: '玉山 Pi 卡', kind: 'credit', issuer: '玉山銀行', network: 'jcb', pan: '3560111122223333', aliases: 'Pi卡' });
  const cube = await post('/api/tags/cards', { name: '國泰 CUBE', kind: 'credit', issuer: '國泰世華', network: 'visa', pan: '4000111122224444' });
  const gogo = await post('/api/tags/cards', { name: '台新 @GoGo', kind: 'credit', issuer: '台新銀行', network: 'visa' });
  const richart = await post('/api/tags/cards', { name: '台新 Richart', kind: 'bank', issuer: '台新銀行' });
  const linepay = await post('/api/tags/payment-methods', { name: 'LINE Pay' });
  const jko = await post('/api/tags/payment-methods', { name: '街口支付' });
  const pxpay = await post('/api/tags/payment-methods', { name: '全支付' });

  const monthStartDay = 1;
  const ev1 = await post('/api/cashback', {
    title: '玉山 Pi 卡綁 LINE Pay 5%', startDate: day(-40), endDate: day(50), cashbackPercent: 5, maxReward: 300, minimumSpend: 200,
    cycleType: 'monthly', cycleAnchorDay: monthStartDay, cardIds: [pi.id], paymentMethodIds: [linepay.id],
    excludeMerchantMatch: true, excludeMerchantKeywords: '繳費\n儲值', requiresRegistration: true, registeredAt: day(-38),
    sourceUrl: 'https://www.esunbank.com/', note: '每月 1 號重置，需登錄'
  });
  const ev2 = await post('/api/cashback', {
    title: 'CUBE 玩數位 3%', startDate: day(-60), endDate: day(120), cashbackPercent: 3, rewardType: 'point', cycleType: 'none',
    cardIds: [cube.id], paymentMethodIds: [], matchUnspecifiedPayment: false
  });
  await post('/api/cashback', {
    title: '@GoGo 街口支付 3.5%', startDate: day(-20), endDate: day(3), cashbackPercent: 3.5, maxReward: 500,
    cycleType: 'none', cardIds: [gogo.id], paymentMethodIds: [jko.id], requiresRegistration: true
  });
  await post('/api/cashback', {
    title: '全支付 週末超商 10%', startDate: day(-30), endDate: day(60), cashbackPercent: 10, maxReward: 50,
    cycleType: 'weekly', cycleAnchorDay: 1, cardIds: [pi.id, cube.id], paymentMethodIds: [pxpay.id],
    requireMerchantMatch: true, merchantKeywords: '7-ELEVEN\n全家\n萊爾富'
  });
  await post('/api/cashback', {
    title: 'Richart 月累積滿 3000 送 100', startDate: day(-10), endDate: day(80), cashbackFixed: 100, minimumSpend: 3000,
    minimumSpendScope: 'cycleTotal', cycleType: 'monthly', cycleAnchorDay: 1, cardIds: [richart.id]
  });
  await post('/api/cashback', {
    title: '年終百貨加碼 8%', startDate: day(5), endDate: day(40), cashbackPercent: 8, maxReward: 800,
    cardIds: [cube.id], requiresRegistration: true
  });

  const txns = [
    [pi.id, linepay.id, 1280, '全聯 信義店', 1], [pi.id, linepay.id, 860, '家樂福', 2], [pi.id, linepay.id, 3200, 'momo 購物', 4],
    [pi.id, linepay.id, 1500, '台電 繳費', 5], [cube.id, null, 499, 'Netflix', 0], [cube.id, null, 2380, 'Apple', 3],
    [gogo.id, jko.id, 650, '麥當勞', 1], [gogo.id, jko.id, 1820, '屈臣氏', 6], [cube.id, pxpay.id, 128, '7-ELEVEN 敦化', 2],
    [richart.id, null, 1200, '水電', 7], [pi.id, null, 350, '星巴克', 0], [cube.id, null, 15800, '機票', 35]
  ];
  for (const [cardId, paymentMethodId, amount, note, daysAgo] of txns) {
    await post('/api/transactions', { cardId, paymentMethodId, amount, note, transactionAt: at(daysAgo, 9 + (amount % 10)), latitude: 25.03 + amount / 1e6, longitude: 121.56 });
  }

  const pts = await post('/api/points', { name: '全聯福利點', issuer: '全聯', currentBalance: 1230, valuePerPoint: 1 });
  await post(`/api/points/${pts.id}/histories`, { changeType: 'earn', amount: 120, occurredAt: at(2), note: '購物累積' });
  await post(`/api/points/${pts.id}/expiries`, { amount: 215, expiryDate: day(5) });
  const lp = await post('/api/points', { name: 'LINE Points', issuer: 'LINE', currentBalance: 860, valuePerPoint: 1 });
  await post(`/api/points/${lp.id}/histories`, { changeType: 'spend', amount: 200, occurredAt: at(1), note: '折抵' });
  await post('/api/points', { name: '亞洲萬里通', issuer: '國泰航空', currentBalance: 12500, valuePerPoint: 0.3 });

  await post(`/api/cashback/${ev1.id}/receipts`, { periodStart: day(-40), periodEnd: day(-10), receivedAmount: 280, receivedDate: day(-3), note: '帳單回饋' });
  await post(`/api/cashback/${ev2.id}/receipts`, { periodStart: day(-60), periodEnd: day(-1), receivedAmount: 70, receivedDate: day(-1) });

  return { pi, cube, gogo, linepay, jko, pxpay, ev1, ev2 };
}

module.exports = { seed };
