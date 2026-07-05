'use strict';

const { Op, fn, col } = require('sequelize');
const { CardTransaction } = require('../models');

/**
 * Mirrors public/js/cashback.js:getNextResetDate() so the server-computed
 * usage window lines up with the countdown shown in the UI.
 */
function getNextResetDate(today, cycleType, anchorDay) {
  const d = new Date(today);
  if (cycleType === 'monthly') {
    const anchor = Math.min(anchorDay || 1, 28);
    let nextReset = new Date(d.getFullYear(), d.getMonth(), anchor);
    if (nextReset <= d) {
      nextReset = new Date(d.getFullYear(), d.getMonth() + 1, anchor);
    }
    return nextReset;
  }
  if (cycleType === 'weekly' || cycleType === 'biweekly') {
    const anchor = anchorDay || 1; // 1=Mon
    const currentDay = d.getDay() || 7; // Sunday=7
    let daysUntil = anchor - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    if (cycleType === 'biweekly' && daysUntil <= 7) daysUntil += 7; // rough approx, matches frontend
    const next = new Date(d);
    next.setDate(next.getDate() + daysUntil);
    return next;
  }
  return null;
}

function endOfDay(dateOnly) {
  const d = new Date(dateOnly);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Returns the [start, end) window that "the current cycle" covers for this
 * event, clamped to the event's own startDate/endDate. `end` is exclusive.
 * cycleType 'none' means the whole event period counts as a single cycle.
 */
function getCurrentCycleWindow(event, now = new Date()) {
  const eventStart = event.startDate ? new Date(`${event.startDate}T00:00:00`) : null;
  const eventEnd = event.endDate ? endOfDay(`${event.endDate}T00:00:00`) : null;

  if (!event.cycleType || event.cycleType === 'none') {
    return { start: eventStart, end: eventEnd };
  }

  const nextReset = getNextResetDate(now, event.cycleType, event.cycleAnchorDay);
  if (!nextReset) return { start: eventStart, end: eventEnd };

  let start;
  if (event.cycleType === 'monthly') {
    start = new Date(nextReset.getFullYear(), nextReset.getMonth() - 1, nextReset.getDate());
  } else {
    const days = event.cycleType === 'weekly' ? 7 : 14;
    start = new Date(nextReset.getTime() - days * 86400000);
  }

  if (eventStart && start < eventStart) start = eventStart;
  const end = eventEnd && nextReset > eventEnd ? eventEnd : nextReset;

  return { start, end };
}

/**
 * Builds the Sequelize where-clause for transactions counted towards `event`,
 * per the matching rules:
 *  - card must be one of event.cards
 *  - if event.paymentMethods is empty: only txns with no e-payment count
 *  - if non-empty: only txns whose paymentMethodId is in that set count,
 *    UNLESS matchUnspecifiedPayment is set, in which case no-e-payment txns
 *    are *also* counted alongside the selected set.
 */
function buildMatchWhere(event, window) {
  const cardIds = (event.cards || []).map((c) => c.id);
  if (!cardIds.length) return null;

  const pmIds = (event.paymentMethods || []).map((p) => p.id);
  const paymentWhere = pmIds.length === 0
    ? { paymentMethodId: null }
    : (event.matchUnspecifiedPayment
      ? { [Op.or]: [{ paymentMethodId: null }, { paymentMethodId: { [Op.in]: pmIds } }] }
      : { paymentMethodId: { [Op.in]: pmIds } });

  const where = {
    userId: event.userId,
    cardId: { [Op.in]: cardIds },
    ...paymentWhere
  };
  if (window.start || window.end) {
    where.transactionAt = {};
    if (window.start) where.transactionAt[Op.gte] = window.start;
    if (window.end) where.transactionAt[Op.lt] = window.end;
  }
  return where;
}

/**
 * Same payment-method matching rule as buildMatchWhere(), applied in JS to a
 * single already-loaded transaction instead of a SQL where-clause.
 */
function paymentMatches(event, paymentMethodId) {
  const pmIds = (event.paymentMethods || []).map((p) => p.id);
  if (pmIds.length === 0) return paymentMethodId == null;
  if (paymentMethodId == null) return !!event.matchUnspecifiedPayment;
  return pmIds.includes(paymentMethodId);
}

/**
 * Whether `txn` (a { cardId, paymentMethodId, transactionAt }-shaped record)
 * counts towards `event` at all — i.e. card + payment method rule match, and
 * the transaction date falls within the event's overall active period. This
 * ignores the current-cycle window used by computeEventUsage() since it's
 * meant to label a single transaction ("which campaigns does this count
 * towards"), including ones from past cycles.
 */
function eventMatchesTransaction(event, txn) {
  const cardIds = (event.cards || []).map((c) => c.id);
  if (!cardIds.includes(txn.cardId)) return false;
  if (!paymentMatches(event, txn.paymentMethodId)) return false;

  const txnAt = new Date(txn.transactionAt);
  if (event.startDate && txnAt < new Date(`${event.startDate}T00:00:00`)) return false;
  if (event.endDate && txnAt > endOfDay(`${event.endDate}T00:00:00`)) return false;
  return true;
}

/**
 * Computes actual accumulated spend for the event's current cycle and, from
 * that, whether the reward cap has been reached and how much more can still
 * be spent (or how many more qualifying transactions remain) before it does.
 * Returns null when the event has no linked cards (nothing to match against).
 */
async function computeEventUsage(event, now = new Date()) {
  const window = getCurrentCycleWindow(event, now);
  const where = buildMatchWhere(event, window);
  if (!where) return null;

  const totals = await CardTransaction.findOne({
    where,
    attributes: [
      [fn('COALESCE', fn('SUM', col('amount')), 0), 'usedAmount'],
      [fn('COUNT', col('id')), 'txnCount']
    ],
    raw: true
  });
  const usedAmount = Number(totals && totals.usedAmount) || 0;
  const txnCount = Number(totals && totals.txnCount) || 0;

  const cap = event.maxReward != null ? Number(event.maxReward) : null;
  const pct = event.cashbackPercent != null ? Number(event.cashbackPercent) : null;
  const fixed = event.cashbackFixed != null ? Number(event.cashbackFixed) : null;

  let estimatedReward = null;
  let capReached = null;
  let remainingCapAmount = null; // percent-based: more spend before hitting the cap
  let remainingCapTransactions = null; // fixed-based: more qualifying txns before hitting the cap
  let qualifyingCount = null;

  if (pct && pct > 0) {
    estimatedReward = usedAmount * pct / 100;
    if (cap != null) {
      capReached = estimatedReward >= cap;
      remainingCapAmount = Math.max(0, Math.ceil((cap * 100 / pct - usedAmount) * 100) / 100);
      estimatedReward = Math.min(estimatedReward, cap);
    }
  } else if (fixed && fixed > 0) {
    const minSpend = event.minimumSpend != null ? Number(event.minimumSpend) : 0;
    const qualifyingWhere = { ...where };
    if (minSpend > 0) qualifyingWhere.amount = { [Op.gte]: minSpend };
    qualifyingCount = await CardTransaction.count({ where: qualifyingWhere });
    estimatedReward = qualifyingCount * fixed;
    if (cap != null) {
      capReached = estimatedReward >= cap;
      remainingCapTransactions = Math.max(0, Math.floor((cap - estimatedReward) / fixed));
      estimatedReward = Math.min(estimatedReward, cap);
    }
  }

  return {
    cycleStart: window.start,
    cycleEnd: window.end,
    usedAmount,
    txnCount,
    qualifyingCount,
    estimatedReward,
    cap,
    capReached,
    remainingCapAmount,
    remainingCapTransactions
  };
}

module.exports = {
  getNextResetDate,
  getCurrentCycleWindow,
  buildMatchWhere,
  eventMatchesTransaction,
  computeEventUsage
};
