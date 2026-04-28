'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../config/logger');

let genai = null;
function getModel() {
  if (genai) return genai;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY not configured'), {
    status: 503, code: 'GEMINI_NOT_CONFIGURED'
  });
  const client = new GoogleGenerativeAI(key);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  genai = client.getGenerativeModel({ model: modelName });
  return genai;
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
  "sourceUrl": string|null,
  "note": string|null
}`;

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

    const model = getModel();
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
