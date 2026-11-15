'use strict';

/**
 * Database-facing side of the reward calculation: loads the transactions a
 * set of campaigns needs (one query for all of them, instead of one per
 * campaign) and hands them to the pure rewardEngine.
 */

const { Op } = require('sequelize');
const { CardTransaction } = require('../models');
const E = require('./rewardEngine');

const TXN_ATTRS = ['id', 'cardId', 'paymentMethodId', 'amount', 'transactionAt', 'note', 'rawCardName', 'rawPaymentMethodName'];

function toPlain(ev) {
  return ev && typeof ev.toJSON === 'function' ? ev.toJSON() : ev;
}

function eventCardIds(ev) {
  return (ev.cards || []).map((c) => Number(c.id)).filter(Number.isFinite);
}

/**
 * One query covering every (event, window) pair: the union of their cards
 * and the hull of their windows. Callers filter per event in memory.
 */
async function loadTransactionsFor(userId, pairs) {
  const cardIds = new Set();
  let minStart = null;
  let maxEnd = null;
  let openStart = false;
  let openEnd = false;
  for (const { ev, win } of pairs) {
    const ids = eventCardIds(ev);
    if (!ids.length || !win) continue;
    ids.forEach((id) => cardIds.add(id));
    if (!win.start) openStart = true;
    else if (!minStart || win.start < minStart) minStart = win.start;
    if (!win.end) openEnd = true;
    else if (!maxEnd || win.end > maxEnd) maxEnd = win.end;
  }
  if (!cardIds.size) return [];

  const where = { userId, cardId: { [Op.in]: Array.from(cardIds) } };
  const range = {};
  if (!openStart && minStart) range[Op.gte] = minStart;
  if (!openEnd && maxEnd) range[Op.lt] = maxEnd;
  if (Object.getOwnPropertySymbols(range).length) where.transactionAt = range;

  return CardTransaction.findAll({
    where,
    attributes: TXN_ATTRS,
    order: [['transactionAt', 'ASC'], ['id', 'ASC']],
    raw: true
  });
}

/**
 * Returns plain event objects with `timing` and `usage` attached.
 *   opts.now                 reference instant (default: now)
 *   opts.windowFor(ev)       custom window per event; return null to skip the
 *                            event (it's omitted from the result)
 *   opts.includeTransactions include matching / excluded transaction lists
 */
async function withUsage(events, opts = {}) {
  const list = (Array.isArray(events) ? events : [events]).map(toPlain).filter(Boolean);
  if (!list.length) return [];
  const now = opts.now || new Date();
  const pairs = [];
  for (const ev of list) {
    const win = opts.windowFor ? opts.windowFor(ev) : E.cycleWindowAt(ev, now);
    if (opts.windowFor && !win) continue;
    pairs.push({ ev, win });
  }
  const txns = await loadTransactionsFor(list[0].userId, pairs);
  return pairs.map(({ ev, win }) => ({
    ...ev,
    timing: E.eventTiming(ev, now),
    usage: win ? E.computeUsage(ev, txns, win, { includeTransactions: !!opts.includeTransactions }) : null
  }));
}

/** Current-cycle usage for a single event (legacy API). */
async function computeEventUsage(event, now = new Date()) {
  const [out] = await withUsage([event], { now });
  return out ? out.usage : null;
}

/** Usage over an explicit window, including the transaction list (legacy API). */
async function computeEventUsageInWindow(event, window) {
  const [out] = await withUsage([event], { windowFor: () => window, includeTransactions: true });
  return out ? out.usage : null;
}

/** Transactions needed to evaluate `events` at instant `at` (for recommendations). */
async function loadCurrentCycleTransactions(userId, events, at = new Date()) {
  const pairs = events.map(toPlain).map((ev) => ({ ev, win: E.cycleWindowAt(ev, at) }));
  return loadTransactionsFor(userId, pairs);
}

module.exports = {
  withUsage,
  loadTransactionsFor,
  loadCurrentCycleTransactions,
  computeEventUsage,
  computeEventUsageInWindow,
  // re-exported engine helpers (kept for existing imports)
  getNextResetDate: E.getNextResetDate,
  getCurrentCycleWindow: E.cycleWindowAt,
  getPreviousCycleWindow: E.previousCycleWindow,
  eventMatchesTransaction: E.eventMatchesTransaction,
  matchMerchantKeyword: E.matchMerchantKeyword,
  matchExcludeMerchantKeyword: E.matchExcludeMerchantKeyword,
  parseMerchantKeywords: E.parseMerchantKeywords
};
