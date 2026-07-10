'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Op } = require('sequelize');
const { CashbackEvent, Card, PaymentMethod } = require('../models');
const aiKeys = require('./aiKeyController');
const logger = require('../config/logger');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MODEL_NAME_RE = /^[a-z0-9][a-z0-9.\-]{1,80}$/i;

// Per-key client + model caches so multiple users (each with their own key)
// don't keep re-instantiating SDK objects.
const clientCache = new Map();
const modelCache = new Map();

function notConfigured() {
  return Object.assign(new Error('No Gemini API key configured (set one in settings or GEMINI_API_KEY)'),
    { status: 503, code: 'GEMINI_NOT_CONFIGURED' });
}

function getClientForKey(apiKey) {
  if (!apiKey) throw notConfigured();
  let c = clientCache.get(apiKey);
  if (c) return c;
  c = new GoogleGenerativeAI(apiKey);
  clientCache.set(apiKey, c);
  return c;
}

function getModelForKey(apiKey, modelName) {
  const name = (typeof modelName === 'string' && MODEL_NAME_RE.test(modelName))
    ? modelName : DEFAULT_MODEL;
  const cacheKey = apiKey + '|' + name;
  let inst = modelCache.get(cacheKey);
  if (inst) return inst;
  inst = getClientForKey(apiKey).getGenerativeModel({ model: name });
  modelCache.set(cacheKey, inst);
  return inst;
}

function resolveModelName(body) {
  const raw = body && body.model;
  if (typeof raw === 'string' && MODEL_NAME_RE.test(raw)) return raw;
  return DEFAULT_MODEL;
}

const SYSTEM_PROMPT = `你是一個專門解析中文「信用卡 / 支付回饋活動」說明文字的工程助手。
請從輸入的純文字中萃取結構化資訊，並嚴格回傳「合法 JSON」。
務必遵守：
  1. 只輸出 JSON 物件，禁止 Markdown、禁止解釋、禁止程式碼框。
  2. 缺漏的欄位請填 null。
  3. 日期使用 YYYY-MM-DD。
  4. 百分比請給數字（例如 "10%" -> 10）。
  5. 金額請給整數或浮點數，不要包含貨幣符號或文字。
  6. cardNames / paymentMethodNames 為字串陣列；找不到請回空陣列 []。
  7. rewardType 只能是 "point" / "cash" / "coupon" / "other"。
  8. cycleType 依文字描述判斷：提到「每週」「每周」用 weekly；「雙週」「兩週」用 biweekly；
     「每月」「月」用 monthly；完全沒提到重置週期（例如只有活動期間內總上限）就用 none。
  9. cycleAnchorDay 只在 cycleType 不是 none 時才需要：weekly/biweekly 填「星期幾重置」
     (1=一 ~ 7=日，沒提到星期幾就填 1)；monthly 填「每月幾號重置」(沒提到就填 1)；
     cycleType 為 none 時固定填 null。
  10. matchUnspecifiedPayment 為布林值：只有當文字明確指出「不論是否使用電子支付」「刷實體卡
      或用 OO 支付都算」這類「除了指定的電子支付外，純刷卡也算」的描述時才填 true，其餘一律 false。
  11. requireMerchantMatch 為布林值：只有當文字明確指出「僅限特定商家/店家/通路才有回饋」時才填
      true，其餘一律 false；若為 false，merchantKeywords 固定回空陣列 []。
  12. merchantKeywords 為字串陣列：當 requireMerchantMatch 為 true 時，從文字中列出的適用商家
      各萃取一個能唯一辨識該商家的核心關鍵字，去除地址、分店、標點與多餘敘述（例如「CAMA café
      台南夏都店」-> "CAMA"；「全家便利商店（信義店）」-> "全家"）；同一商家只保留一個最短又可
      辨識的關鍵字，不要重複列出同義詞。
  13. rewardRounding 只能是 "round" 或 "floor"：文字提到「無條件捨去」「捨去」「無條件去尾數」
      時填 "floor"；提到「四捨五入」時填 "round"；完全沒提到捨入方式時，一律預設填 "round"。
  14. rewardCalcMode 只能是 "aggregate" 或 "perTransaction"：文字提到「每筆消費分別計算」「單筆
      計算」「逐筆計算」時填 "perTransaction"；提到「期間內累積消費後計算」「加總後計算」「合併
      計算」時填 "aggregate"；完全沒提到計算方式時，一律預設填 "aggregate"。
  15. rewardPrecision 為 0-6 的整數，代表回饋金額捨入時要保留到小數點後幾位：完全沒提到、或文字
      顯示回饋是算到整數才捨入時填 0（預設）；文字提到「取到小數點後兩位」「保留小數點後2位」
      「四捨五入至小數第二位」這類描述時，依文字中提到的位數填入對應數字（例如小數點後兩位填 2）。
  16. excludeMerchantMatch 為布林值：只有當文字明確指出「排除／不含／不適用某些商家或通路」時才填
      true，其餘一律 false；若為 false，excludeMerchantKeywords 固定回空陣列 []。
  17. excludeMerchantKeywords 為字串陣列：當 excludeMerchantMatch 為 true 時，把文字中「被排除」的
      商家或消費類型各萃取一個能唯一辨識的核心關鍵字（規則同 merchantKeywords，去除地址／分店／
      標點），例如「不含全聯、超商、水電瓦斯繳費」-> ["全聯","超商","繳費"]。注意這是「命中即排除」，
      與 merchantKeywords（命中才計入）方向相反，兩者不要混用。

JSON Schema：
{
  "title": string,
  "description": string,
  "startDate": string|null,
  "endDate": string|null,
  "cashbackPercent": number|null,
  "cashbackFixed": number|null,
  "rewardType": "point"|"cash"|"coupon"|"other",
  "maxReward": number|null,
  "minimumSpend": number|null,
  "cardNames": string[],
  "paymentMethodNames": string[],
  "cycleType": "none"|"weekly"|"biweekly"|"monthly",
  "cycleAnchorDay": number|null,
  "matchUnspecifiedPayment": boolean,
  "requireMerchantMatch": boolean,
  "merchantKeywords": string[],
  "excludeMerchantMatch": boolean,
  "excludeMerchantKeywords": string[],
  "rewardRounding": "round"|"floor",
  "rewardCalcMode": "aggregate"|"perTransaction",
  "rewardPrecision": number,
  "sourceUrl": string|null,
  "note": string|null
}`;

const MERCHANT_SYSTEM_PROMPT = `你是台灣「信用卡 / 支付回饋活動」商家清單整理助手。
使用者會給一段文字（可能是條列的商家名稱清單、或活動說明中提到適用商家的段落）。
請從中萃取出「適用商家關鍵字」清單，規則：
  1. 每個關鍵字應該是能唯一辨識該商家的核心名稱片段，去除地址、分店細節、標點符號。
     例如「CAMA café 台南夏都店」-> "CAMA"；「全家便利商店（信義店）」-> "全家"。
  2. 同一商家如果同時出現簡稱與全名，只需保留最短、仍可辨識的一個，不要重複列出。
  3. 忽略跟商家無關的敘述文字（例如回饋 %、日期、金額、活動規則等）。
  4. 找不到任何商家名稱時回傳空陣列 []。
  5. 嚴格只輸出 JSON 物件，禁止 Markdown、禁止解釋、禁止程式碼框。

輸出 JSON：{ "keywords": string[] }`;

function safeJsonParse(text) {
  // Strip code fences if the model still ignored instructions.
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  // Find the first { and last } as a fallback.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

// POST /api/ai/parse-event  body: { text }
exports.parseEvent = async (req, res, next) => {
  try {
    const text = (req.body && req.body.text || '').toString().trim();
    if (!text) return res.status(400).json({ error: 'TEXT_REQUIRED' });
    if (text.length > 8000) return res.status(413).json({ error: 'TEXT_TOO_LONG' });

    const apiKey = await aiKeys.resolveActiveKey(req.user.id);
    const model = getModelForKey(apiKey, resolveModelName(req.body));
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\n=== 活動原文 ===\n${text}` }]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });

    const raw = result.response && result.response.text ? result.response.text() : '';
    let parsed;
    try {
      parsed = safeJsonParse(raw);
    } catch (e) {
      logger.warn('Gemini returned non-JSON', { raw });
      return res.status(502).json({ error: 'AI_PARSE_FAILED', raw });
    }

    res.json(parsed);
  } catch (err) {
    if (err.code === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: err.code, message: err.message });
    }
    logger.error('Gemini parseEvent error', { err: err.message });
    next(err);
  }
};

// POST /api/ai/parse-merchants  body: { text }
// Follow-up analysis used from the event edit form's "商家限定" section: lets
// the user paste extra raw text (a merchant list copied from a promo page,
// more of the original announcement, etc.) at any time — not just once at
// creation via parseEvent — and get back a clean merchantKeywords array to
// merge into the field.
exports.parseMerchants = async (req, res, next) => {
  try {
    const text = (req.body && req.body.text || '').toString().trim();
    if (!text) return res.status(400).json({ error: 'TEXT_REQUIRED' });
    if (text.length > 4000) return res.status(413).json({ error: 'TEXT_TOO_LONG' });

    const apiKey = await aiKeys.resolveActiveKey(req.user.id);
    const model = getModelForKey(apiKey, resolveModelName(req.body));
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `${MERCHANT_SYSTEM_PROMPT}\n\n=== 輸入文字 ===\n${text}` }]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });

    const raw = result.response && result.response.text ? result.response.text() : '';
    let parsed;
    try {
      parsed = safeJsonParse(raw);
    } catch (e) {
      logger.warn('Gemini returned non-JSON for parseMerchants', { raw });
      return res.status(502).json({ error: 'AI_PARSE_FAILED', raw });
    }

    const keywords = Array.isArray(parsed && parsed.keywords)
      ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 50)
      : [];
    res.json({ keywords });
  } catch (err) {
    if (err.code === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: err.code, message: err.message });
    }
    logger.error('Gemini parseMerchants error', { err: err.message });
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// AI 回饋搜尋  POST /api/ai/search-rewards   body: { query, web }
//
// Token 節省策略：
//  1. 只送「進行中」活動，且每筆壓縮成單行精簡格式（不送冗長的原文
//     description，只保留注意事項 note）。
//  2. 結果以 (使用者 + 語料雜湊 + 查詢) 為鍵做記憶體快取，相同資料下
//     重複查詢直接命中，不再呼叫 Gemini。
//  3. 預設純本地分析（responseMimeType=JSON，最省）；聯網查詢為選用，
//     由使用者勾選後才掛上 Google 搜尋工具。
// ─────────────────────────────────────────────────────────────

const SEARCH_SYSTEM_PROMPT = `你是台灣「信用卡 / 行動支付」回饋分析顧問。
使用者會給一個查詢關鍵字（消費場景 / 通路 / 商家）與一份「已記錄的回饋活動清單」。
請推薦該查詢回饋最高的方案。

清單每行格式：#id|活動名稱|卡:..|付:..|回饋:%|固定:..|類型:..|上限:..|門檻:..|期間:..|注意:..|url:..

規則：
1. 僅能依清單推薦，禁止虛構清單以外的活動、數字或卡片。
2. 找出與查詢相關的活動，同義詞也算（例如「外送」涵蓋 Foodpanda / Uber Eats；「超商」涵蓋 7-11 / 全家）。
3. 最多 3 筆推薦，依實際回饋高低排序；可推薦單一方案或可同時成立的組合（例如「CUBE卡 + icash Pay」）。
4. 每筆需說明推薦原因，並整理注意事項（回饋上限、需登錄、單筆門檻、名額、期限將到等）。
5. 若活動有 url 且具「總額 / 名額上限」風險，注意事項須提醒使用者先點連結確認是否額滿。
6. 找不到相關方案時，recommendations 回 []、noData 設為 true，summary 說明原因。
7. 嚴格只輸出 JSON，禁止 Markdown、程式碼框或多餘文字。

輸出 JSON：
{
  "summary": string,
  "noData": boolean,
  "recommendations": [{
    "title": string,
    "rewardText": string,
    "reason": string,
    "eventIds": number[],
    "cautions": string[],
    "checkUrl": string|null
  }]
}`;

const SEARCH_WEB_SUFFIX = `
若清單資訊不足以回答，可使用 Google 搜尋補充台灣最新回饋資訊；引用網路資訊時請在 reason 註明「（網路資訊）」，並盡量提供來源連結作為 checkUrl。`;

const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 分鐘
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map(); // key -> { at, data }

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function compactEvent(ev) {
  const parts = [`#${ev.id}`, String(ev.title || '').replace(/\s+/g, ' ').trim()];
  const cards = (ev.cards || []).map((c) => c.name).filter(Boolean).join('/');
  const pms = (ev.paymentMethods || []).map((p) => p.name).filter(Boolean).join('/');
  if (cards) parts.push(`卡:${cards}`);
  if (pms) parts.push(`付:${pms}`);
  if (ev.cashbackPercent != null) parts.push(`回饋:${ev.cashbackPercent}%`);
  if (ev.cashbackFixed != null) parts.push(`固定:${ev.cashbackFixed}`);
  if (ev.rewardType && ev.rewardType !== 'cash') parts.push(`類型:${ev.rewardType}`);
  if (ev.maxReward != null) parts.push(`上限:${ev.maxReward}`);
  if (ev.minimumSpend != null) parts.push(`門檻:${ev.minimumSpend}`);
  parts.push(`期間:${ev.startDate || '?'}~${ev.endDate || '無期限'}`);
  if (ev.note) parts.push(`注意:${String(ev.note).replace(/\s+/g, ' ').trim().slice(0, 140)}`);
  if (ev.sourceUrl) parts.push(`url:${ev.sourceUrl}`);
  return parts.join('|');
}

async function buildCorpus(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const events = await CashbackEvent.findAll({
    where: {
      userId,
      [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }]
    },
    include: [
      { model: Card, as: 'cards', through: { attributes: [] }, attributes: ['name'] },
      { model: PaymentMethod, as: 'paymentMethods', through: { attributes: [] }, attributes: ['name'] }
    ],
    order: [['endDate', 'ASC'], ['id', 'DESC']],
    limit: 150
  });
  const lines = [];
  const eventMap = new Map();
  for (const ev of events) {
    lines.push(compactEvent(ev));
    eventMap.set(ev.id, { id: ev.id, title: ev.title, sourceUrl: ev.sourceUrl || null });
  }
  return { lines, eventMap };
}

function shapeResult(parsed, eventMap) {
  const recs = Array.isArray(parsed && parsed.recommendations) ? parsed.recommendations : [];
  const recommendations = recs.slice(0, 3).map((r) => {
    const ids = Array.isArray(r && r.eventIds)
      ? r.eventIds.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && eventMap.has(n))
      : [];
    return {
      title: String((r && r.title) || '').slice(0, 120),
      rewardText: String((r && r.rewardText) || '').slice(0, 80),
      reason: String((r && r.reason) || '').slice(0, 600),
      eventIds: ids,
      cautions: Array.isArray(r && r.cautions)
        ? r.cautions.map((c) => String(c).slice(0, 300)).filter(Boolean).slice(0, 6)
        : [],
      checkUrl: typeof (r && r.checkUrl) === 'string' && /^https?:\/\//i.test(r.checkUrl)
        ? r.checkUrl
        : null
    };
  });
  const referenced = new Set();
  recommendations.forEach((r) => r.eventIds.forEach((id) => referenced.add(id)));
  return {
    summary: String((parsed && parsed.summary) || '').slice(0, 400),
    noData: !!(parsed && parsed.noData) || recommendations.length === 0,
    recommendations,
    refs: Array.from(referenced).map((id) => eventMap.get(id))
  };
}

exports.searchRewards = async (req, res, next) => {
  try {
    const query = (req.body && req.body.query || '').toString().trim();
    if (!query) return res.status(400).json({ error: 'QUERY_REQUIRED' });
    if (query.length > 100) return res.status(413).json({ error: 'QUERY_TOO_LONG' });
    const useWeb = !!(req.body && req.body.web);
    const modelName = resolveModelName(req.body);

    const { lines, eventMap } = await buildCorpus(req.user.id);
    if (!lines.length) {
      return res.json({
        summary: '你尚未記錄任何進行中的回饋活動，請先新增活動再使用 AI 搜尋。',
        noData: true,
        recommendations: [],
        refs: [],
        cached: false
      });
    }

    const corpus = lines.join('\n');
    const cacheKey = `${req.user.id}|${modelName}|${useWeb ? 'w' : 'l'}|${hashStr(corpus)}|${query.toLowerCase()}`;
    const hit = searchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL) {
      return res.json({ ...hit.data, cached: true });
    }

    const apiKey = await aiKeys.resolveActiveKey(req.user.id);
    const model = getModelForKey(apiKey, modelName);
    const buildPrompt = (sys) => `${sys}\n\n=== 查詢關鍵字 ===\n${query}\n\n=== 已記錄的回饋活動清單 ===\n${corpus}`;

    let raw = '';
    try {
      const request = {
        contents: [{ role: 'user', parts: [{ text: buildPrompt(SEARCH_SYSTEM_PROMPT + (useWeb ? SEARCH_WEB_SUFFIX : '')) }] }],
        generationConfig: { temperature: 0.3 }
      };
      if (useWeb) {
        request.tools = [{ googleSearch: {} }];
      } else {
        request.generationConfig.responseMimeType = 'application/json';
      }
      const result = await model.generateContent(request);
      raw = result.response && result.response.text ? result.response.text() : '';
    } catch (e) {
      if (!useWeb) throw e;
      // 聯網工具不可用時，自動退回純本地分析
      logger.warn('googleSearch tool failed, fallback to local', { err: e.message });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(SEARCH_SYSTEM_PROMPT) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
      });
      raw = result.response && result.response.text ? result.response.text() : '';
    }

    let parsed;
    try {
      parsed = safeJsonParse(raw);
    } catch (e) {
      logger.warn('Gemini search returned non-JSON', { raw });
      return res.status(502).json({ error: 'AI_SEARCH_FAILED', raw });
    }

    const data = shapeResult(parsed, eventMap);

    if (searchCache.size >= SEARCH_CACHE_MAX) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    searchCache.set(cacheKey, { at: Date.now(), data });

    res.json({ ...data, cached: false });
  } catch (err) {
    if (err.code === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: err.code, message: err.message });
    }
    logger.error('Gemini searchRewards error', { err: err.message });
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// 列出可用 Gemini 模型  GET /api/ai/models
//
// 動態查詢 Google Generative Language API，過濾出支援
// generateContent 的「正式」Gemini 模型（排除 embedding / tuning /
// experimental / 數字 revision 等雜訊），並依世代、等級排序。
// 結果在記憶體快取 1 小時；若未設定金鑰或上游失敗，回傳一份保底
// 清單，讓前端仍可顯示。
// ─────────────────────────────────────────────────────────────

const MODELS_TTL = 60 * 60 * 1000;
const modelsListCacheByKey = new Map(); // apiKey -> { at, list }

const FALLBACK_MODELS = [
  { name: 'gemini-3.5-pro',   displayName: 'Gemini 3.5 Pro',   description: '最強推理' },
  { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', description: '新世代均衡' },
  { name: 'gemini-2.5-pro',   displayName: 'Gemini 2.5 Pro',   description: '經典強力' },
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: '經典輕量' }
];

function modelScore(name) {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name);
  const version = m ? parseFloat(m[1]) : 0;
  let tier = 0;
  if (/-pro\b/.test(name)) tier = 3;
  else if (/-flash-lite\b/.test(name)) tier = 1;
  else if (/-flash\b/.test(name)) tier = 2;
  // Sort canonical names above preview / latest aliases.
  const penalty = /(preview|latest)/i.test(name) ? -25 : 0;
  return version * 10 + tier + penalty;
}

function isUsableGeminiModel(name) {
  return /^gemini-/.test(name)
    && !/(embedding|aqa|tuning|gecko|experimental)/i.test(name)
    && !/-exp(-|$)/i.test(name)
    // Skip per-revision dumps like gemini-2.5-flash-001; the canonical alias is enough.
    && !/-\d{3,}$/.test(name);
}

exports.listModels = async (req, res) => {
  const apiKey = await aiKeys.resolveActiveKey(req.user.id);
  if (!apiKey) {
    return res.json({ models: FALLBACK_MODELS, default: DEFAULT_MODEL, fallback: true });
  }
  const hit = modelsListCacheByKey.get(apiKey);
  if (hit && Date.now() - hit.at < MODELS_TTL) {
    return res.json({ models: hit.list, default: DEFAULT_MODEL, cached: true });
  }
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(apiKey)
    );
    if (!r.ok) throw new Error('upstream ' + r.status);
    const j = await r.json();
    const list = (j.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods)
        && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => ({
        name: String(m.name || '').replace(/^models\//, ''),
        displayName: m.displayName || '',
        description: m.description || ''
      }))
      .filter((m) => isUsableGeminiModel(m.name))
      .sort((a, b) => modelScore(b.name) - modelScore(a.name));
    modelsListCacheByKey.set(apiKey, { at: Date.now(), list });
    res.json({ models: list, default: DEFAULT_MODEL });
  } catch (err) {
    logger.warn('listModels failed, returning fallback', { err: err.message });
    res.json({ models: FALLBACK_MODELS, default: DEFAULT_MODEL, fallback: true });
  }
};
