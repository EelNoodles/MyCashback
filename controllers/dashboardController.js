'use strict';

const { Op, fn, col } = require('sequelize');
const { CardTransaction, Point, PointExpiry, RewardReceipt } = require('../models');
const svc = require('../services/cashbackCycleService');
const E = require('../services/rewardEngine');
const V = require('../utils/validate');
const cashback = require('./cashbackController');
const points = require('./pointController');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

async function spendBetween(userId, start, end) {
  const row = await CardTransaction.findOne({
    where: { userId, transactionAt: { [Op.gte]: start, [Op.lt]: end } },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total'], [fn('COUNT', col('id')), 'count']],
    raw: true
  });
  return { total: round2(row && row.total), count: Number((row && row.count) || 0) };
}

async function receivedBetween(userId, start, end) {
  const total = await RewardReceipt.sum('receivedAmount', {
    where: { userId, receivedDate: { [Op.gte]: E.formatDateOnly(start), [Op.lt]: E.formatDateOnly(end) } }
  });
  return round2(total);
}

function compactEvent(ev) {
  const u = ev.usage || {};
  return {
    id: ev.id,
    title: ev.title,
    rewardType: ev.rewardType,
    cashbackPercent: ev.cashbackPercent != null ? Number(ev.cashbackPercent) : null,
    cashbackFixed: ev.cashbackFixed != null ? Number(ev.cashbackFixed) : null,
    cards: (ev.cards || []).map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl, color: c.color })),
    paymentMethods: (ev.paymentMethods || []).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl })),
    needsRegistration: E.needsRegistration(ev),
    timing: ev.timing,
    usage: ev.usage ? {
      usedAmount: u.usedAmount,
      estimatedReward: u.estimatedReward,
      cap: u.cap,
      capReached: u.capReached,
      capUsedPercent: u.capUsedPercent,
      remainingReward: u.remainingReward,
      remainingCapAmount: u.remainingCapAmount,
      thresholdMet: u.thresholdMet,
      remainingToThreshold: u.remainingToThreshold
    } : null
  };
}

/** Builds the dashboard payload; shared with the external API. */
async function buildSummary(userId, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const today = E.startOfDay(now);

  const [events, monthSpend, lastMonthSpend, receivedMonth, receivedYear, pointRows, expiries, flows] = await Promise.all([
    cashback.findEvents(userId, { status: 'active' }).then((evs) => svc.withUsage(evs, { now })),
    spendBetween(userId, monthStart, nextMonth),
    spendBetween(userId, lastMonthStart, monthStart),
    receivedBetween(userId, monthStart, nextMonth),
    receivedBetween(userId, yearStart, new Date(now.getFullYear() + 1, 0, 1)),
    Point.findAll({ where: { userId } }),
    PointExpiry.findAll({
      where: { userId, status: 'active', expiryDate: { [Op.lte]: E.formatDateOnly(E.addDays(today, 30)) } },
      include: [{ model: Point, as: 'point', attributes: ['id', 'name'] }],
      order: [['expiryDate', 'ASC']]
    }),
    points.monthFlows(userId, now)
  ]);

  const ongoing = events.filter((e) => e.timing.phase === 'active');
  const upcoming = events.filter((e) => e.timing.phase === 'upcoming');

  const attention = [];
  for (const ev of events) {
    const u = ev.usage || {};
    const t = ev.timing;
    if (E.needsRegistration(ev)) {
      attention.push({ type: 'registration_needed', severity: 'high', eventId: ev.id, title: ev.title, daysLeft: t.daysLeft, phase: t.phase });
    }
    if (t.phase === 'upcoming' && t.daysUntilStart <= 3) {
      attention.push({ type: 'event_starting', severity: 'low', eventId: ev.id, title: ev.title, daysUntilStart: t.daysUntilStart });
    }
    if (t.phase !== 'active') continue;
    const unclaimed = u.capReached === false && u.remainingReward > 0;
    if (t.daysLeft != null && t.daysLeft <= 7 && (unclaimed || u.cap == null)) {
      attention.push({
        type: 'event_ending', severity: t.daysLeft <= 3 ? 'high' : 'medium', eventId: ev.id, title: ev.title,
        daysLeft: t.daysLeft, remainingReward: u.remainingReward ?? null, remainingCapAmount: u.remainingCapAmount ?? null
      });
    } else if (t.cycle && t.cycle.daysLeft != null && t.cycle.daysLeft <= 3 && unclaimed && !t.cycle.endsWithEvent) {
      attention.push({
        type: 'cycle_ending', severity: 'medium', eventId: ev.id, title: ev.title,
        daysLeft: t.cycle.daysLeft, resetDate: t.cycle.resetDate, remainingReward: u.remainingReward, remainingCapAmount: u.remainingCapAmount
      });
    }
    if (u.thresholdMet === false && u.usedAmount > 0) {
      attention.push({
        type: 'threshold_pending', severity: 'medium', eventId: ev.id, title: ev.title,
        remainingToThreshold: u.remainingToThreshold, minimumSpend: u.minimumSpend
      });
    }
  }
  for (const x of expiries) {
    const daysLeft = E.daysBetween(today, E.parseDateOnly(x.expiryDate));
    attention.push({
      type: 'point_expiring', severity: daysLeft <= 7 ? 'high' : 'low', pointId: x.pointId, expiryId: x.id,
      title: x.point ? x.point.name : '點數', amount: Number(x.amount), expiryDate: x.expiryDate, daysLeft
    });
  }
  const sevRank = { high: 0, medium: 1, low: 2 };
  attention.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || ((a.daysLeft ?? 99) - (b.daysLeft ?? 99)));

  const sum = (arr, f) => round2(arr.reduce((s, x) => s + (f(x) || 0), 0));
  const totalValue = sum(pointRows.filter((p) => p.valuePerPoint != null), (p) => Number(p.currentBalance) * Number(p.valuePerPoint));

  return {
    generatedAt: now.toISOString(),
    today: E.formatDateOnly(today),
    month: {
      key: E.formatDateOnly(monthStart).slice(0, 7),
      spend: monthSpend.total,
      txnCount: monthSpend.count,
      lastMonthSpend: lastMonthSpend.total
    },
    rewards: {
      estimatedThisCycle: sum(ongoing, (e) => e.usage && e.usage.estimatedReward),
      estimatedPointsThisCycle: sum(ongoing.filter((e) => e.rewardType === 'point'), (e) => e.usage && e.usage.estimatedReward),
      remainingThisCycle: sum(ongoing, (e) => e.usage && e.usage.remainingReward),
      receivedThisMonth: receivedMonth,
      receivedThisYear: receivedYear
    },
    events: {
      ongoing: ongoing.length,
      upcoming: upcoming.length,
      capReached: ongoing.filter((e) => e.usage && e.usage.capReached).length,
      needsRegistration: events.filter((e) => E.needsRegistration(e)).length
    },
    points: {
      count: pointRows.length,
      totalValue,
      valuedCount: pointRows.filter((p) => p.valuePerPoint != null).length,
      monthEarned: flows.earned,
      monthSpent: flows.spent
    },
    attention: attention.slice(0, 30),
    ongoingEvents: ongoing
      .map(compactEvent)
      .sort((a, b) => ((b.usage && b.usage.remainingReward) || 0) - ((a.usage && a.usage.remainingReward) || 0))
  };
}

// GET /api/dashboard/summary
exports.summary = V.ah(async (req, res) => {
  res.json(await buildSummary(req.user.id));
});

exports.buildSummary = buildSummary;
