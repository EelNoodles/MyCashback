'use strict';

/**
 * OpenAPI 3.0 description of every HTTP endpoint the server exposes.
 *
 * This is the single source of truth for the API docs: it's served at
 * GET /api/docs/openapi.json, rendered by the in-app「API 串接文件」page
 * (/developers), and exported to docs/API.md by `npm run docs:api`.
 * test/integration/apiDocs.test.js fails if any Express route is missing here.
 */

// ─────────────────────────────────────────────────────────────
// Shared schemas
// ─────────────────────────────────────────────────────────────

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const arr = (items) => ({ type: 'array', items });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const bool = (description, extra = {}) => ({ type: 'boolean', description, ...extra });
const date = (description) => ({ type: 'string', format: 'date', description, example: '2026-11-30' });
const dateTime = (description) => ({ type: 'string', format: 'date-time', description });
const nullable = (s) => ({ ...s, nullable: true });
const obj = (properties, required, description) => ({ type: 'object', description, properties, ...(required ? { required } : {}) });

const schemas = {
  Error: obj({
    error: str('錯誤代碼（大寫英文，程式判斷用）', { example: 'AMOUNT_INVALID' }),
    message: str('給人看的中文錯誤說明', { example: 'amount 必須是大於 0 的數字' })
  }, ['error'], '所有 4xx/5xx 錯誤的共同格式；部分錯誤會附帶額外欄位（例如 knownCards）'),

  Ok: obj({ ok: bool('固定為 true', { example: true }) }),

  CardRef: obj({
    id: int('卡片 ID'), name: str('卡片名稱'), imageUrl: nullable(str('卡面圖片相對路徑')), color: nullable(str('代表色')),
    network: nullable(str('發卡組織', { enum: ['visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'] }))
  }),
  PaymentMethodRef: obj({ id: int('支付方式 ID'), name: str('名稱'), imageUrl: nullable(str('圖片相對路徑')) }),

  Card: obj({
    id: int('卡片 ID'),
    name: str('名稱（同一使用者不可重複）', { example: '玉山 Pi 卡' }),
    kind: str('類型', { enum: ['credit', 'debit', 'bank', 'other'] }),
    issuer: nullable(str('發卡銀行')),
    lastFour: nullable(str('卡號末四碼（由完整卡號自動擷取）')),
    hasPan: bool('是否已儲存加密的完整卡號'),
    network: nullable(str('發卡組織', { enum: ['visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'] })),
    imageUrl: nullable(str('卡面圖片路徑')),
    color: nullable(str('代表色')),
    aliases: nullable(str('別名（換行分隔）；外部回報的卡片名稱符合任一別名也能對應')),
    note: nullable(str('備註')),
    transactionCount: int('此卡的交易筆數（列表時提供）'),
    eventCount: int('綁定此卡的活動數（列表時提供）')
  }),

  PaymentMethod: obj({
    id: int('支付方式 ID'),
    name: str('名稱（同一使用者不可重複）', { example: 'LINE Pay' }),
    imageUrl: nullable(str('圖片路徑')),
    color: nullable(str('代表色')),
    aliases: nullable(str('別名（換行分隔）')),
    note: nullable(str('備註')),
    transactionCount: int('使用此支付方式的交易筆數（列表時提供）'),
    eventCount: int('綁定此支付方式的活動數（列表時提供）')
  }),

  Timing: obj({
    phase: str('活動階段', { enum: ['upcoming', 'active', 'ended'] }),
    daysUntilStart: int('距離開始還有幾天（upcoming 時）'),
    daysLeft: nullable(int('含今天在內剩幾天；1 代表今天是最後一天；無結束日為 null')),
    progress: nullable(num('活動期間已經過的百分比')),
    cycle: nullable(obj({
      start: date('本期第一天'),
      end: date('本期最後一天（含）'),
      resetDate: date('下次重置日（本期結束後的第一天）'),
      length: int('本期天數'),
      daysLeft: nullable(int('本期含今天剩幾天')),
      progress: num('本期已經過的百分比'),
      endsWithEvent: bool('本期是否因活動結束而提前截止')
    }, null, '有週期的活動才有；所有日期皆以伺服器時區（預設 Asia/Taipei）計算'))
  }, null, '伺服器計算的時間資訊，前端直接顯示即可'),

  Usage: obj({
    cycleStart: nullable(dateTime('計算區間起（含）')),
    cycleEnd: nullable(dateTime('計算區間迄（不含）')),
    rewardKind: nullable(str('回饋型式', { enum: ['percent', 'fixed'] })),
    usedAmount: num('區間內符合條件的消費總額'),
    txnCount: int('符合條件的交易筆數'),
    excludedCount: int('卡片/支付方式相符但被排除（排除商家、非限定商家、未達單筆門檻）的筆數'),
    qualifyingCount: nullable(int('固定回饋活動：符合條件的筆數')),
    estimatedReward: nullable(num('應得回饋（已套用門檻與上限）')),
    potentialReward: nullable(num('若已達累積門檻可得的回饋（未達門檻時用來提示）')),
    cap: nullable(num('回饋上限')),
    capReached: nullable(bool('是否已達上限')),
    capUsedPercent: nullable(num('上限已用百分比')),
    remainingReward: nullable(num('距離上限還可拿多少回饋')),
    remainingCapAmount: nullable(num('百分比活動：再刷多少即達上限（已考慮捨入方式與累積門檻）')),
    remainingCapTransactions: nullable(int('固定回饋活動：還可拿幾筆完整回饋')),
    minimumSpend: nullable(num('門檻金額')),
    minimumSpendScope: str('門檻計算方式', { enum: ['perTransaction', 'cycleTotal'] }),
    thresholdMet: bool('累積門檻是否已達成（perTransaction 時恆為 true）'),
    remainingToThreshold: num('距離累積門檻還差多少'),
    effectiveRate: nullable(num('實際回饋率 %（回饋 ÷ 消費）')),
    rewardRounding: str('捨入方式', { enum: ['round', 'floor'] }),
    rewardCalcMode: str('計算方式', { enum: ['aggregate', 'perTransaction'] }),
    rewardPrecision: int('捨入到小數點後幾位'),
    txnRewards: nullable(arr(obj({
      transactionId: int('交易 ID'), transactionAt: dateTime('交易時間'), amount: num('金額'), note: nullable(str('備註')), reward: num('此筆回饋')
    }))),
    transactions: arr(obj({ id: int('交易 ID'), transactionAt: dateTime('時間'), amount: num('金額'), note: nullable(str('備註')) }, null, '（僅回饋核對）計入的交易')),
    excludedTransactions: arr(obj({
      id: int('交易 ID'), transactionAt: dateTime('時間'), amount: num('金額'), note: nullable(str('備註')),
      reason: str('排除原因', { enum: ['excludedMerchant', 'merchantNotMatched', 'belowMinimum'] }), keyword: nullable(str('命中的排除關鍵字'))
    }, null, '（僅回饋核對）卡片相符但未計入的交易'))
  }, null, '依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null'),

  EventInput: obj({
    title: str('活動名稱（必填）', { example: '玉山 Pi 卡 LINE Pay 5%' }),
    description: nullable(str('活動原文 / 說明')),
    note: nullable(str('備註 / 注意事項')),
    startDate: nullable(date('開始日（含）')),
    endDate: nullable(date('結束日（含）')),
    cashbackPercent: nullable(num('回饋 %（0-100，可到小數點後三位）', { example: 5 })),
    cashbackFixed: nullable(num('固定回饋金額 / 點數（與 % 二擇一，% 優先）')),
    rewardType: str('回饋類型', { enum: ['cash', 'point', 'coupon', 'other'], example: 'cash' }),
    maxReward: nullable(num('每週期回饋上限', { example: 300 })),
    minimumSpend: nullable(num('門檻金額', { example: 200 })),
    minimumSpendScope: str('perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋', { enum: ['perTransaction', 'cycleTotal'] }),
    cycleType: str('重置週期', { enum: ['none', 'weekly', 'biweekly', 'monthly'], example: 'monthly' }),
    cycleAnchorDay: nullable(int('weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底）', { example: 1 })),
    cardIds: arr(int('綁定的卡片 ID')),
    paymentMethodIds: arr(int('綁定的支付方式 ID；空陣列=只算未使用電子支付的交易')),
    matchUnspecifiedPayment: bool('有指定支付方式時，未使用電子支付的交易也一併計入'),
    requireMerchantMatch: bool('商家限定：交易文字需包含 merchantKeywords 其一'),
    merchantKeywords: nullable(str('限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白）', { example: 'CAMA\n全家' })),
    excludeMerchantMatch: bool('排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件）'),
    excludeMerchantKeywords: nullable(str('排除商家關鍵字')),
    rewardRounding: str('捨入方式', { enum: ['round', 'floor'] }),
    rewardCalcMode: str('aggregate=週期內加總後計算；perTransaction=逐筆計算後加總', { enum: ['aggregate', 'perTransaction'] }),
    rewardPrecision: int('捨入到小數點後幾位（0-6）', { example: 0 }),
    requiresRegistration: bool('活動需要登錄'),
    registeredAt: nullable(date('完成登錄的日期（null=尚未登錄）')),
    sourceUrl: nullable(str('活動網址（僅接受 http/https）'))
  }, ['title']),

  Event: {
    allOf: [ref('EventInput'), obj({
      id: int('活動 ID'),
      userId: int('擁有者'),
      cards: arr(ref('CardRef')),
      paymentMethods: arr(ref('PaymentMethodRef')),
      needsRegistration: bool('需要登錄但尚未登錄'),
      timing: ref('Timing'),
      usage: nullable(ref('Usage')),
      createdAt: dateTime('建立時間'),
      updatedAt: dateTime('更新時間')
    })]
  },

  Transaction: obj({
    id: int('交易 ID'),
    cardId: int('卡片 ID'),
    card: nullable(ref('CardRef')),
    paymentMethodId: nullable(int('支付方式 ID；null=未使用電子支付')),
    paymentMethod: nullable(ref('PaymentMethodRef')),
    amount: str('金額（DECIMAL 字串）', { example: '1280.00' }),
    transactionAt: dateTime('交易時間'),
    note: nullable(str('備註 / 商家名稱（商家限定與排除比對的主要依據）')),
    latitude: nullable(num('緯度')),
    longitude: nullable(num('經度')),
    externalRef: nullable(str('外部系統交易 ID')),
    source: str('來源', { enum: ['api', 'manual'] }),
    rawCardName: nullable(str('回報當下的卡片名稱原文')),
    rawPaymentMethodName: nullable(str('回報當下的支付方式名稱原文')),
    matchedEvents: arr(obj({
      id: int('活動 ID'), title: str('活動名稱'), cashbackPercent: nullable(str('%')), cashbackFixed: nullable(str('固定回饋')),
      rewardType: str('回饋類型'), maxReward: nullable(str('上限')),
      estimatedReward: nullable(num('此筆單獨計算的回饋（未套用上限，僅供參考）')),
      matchedKeyword: nullable(str('商家限定命中的關鍵字'))
    }, null, '這筆交易會計入的回饋活動')),
    createdAt: dateTime('建立時間'),
    updatedAt: dateTime('更新時間')
  }),

  IngestTransaction: obj({
    cardName: str('卡片名稱；比對順序：完全相同 → 忽略大小寫/空白的名稱或別名', { example: '玉山 Pi 卡' }),
    cardLastFour: str('（選填）卡號末四碼；名稱對不到時改用末四碼比對', { example: '1234' }),
    paymentMethodName: nullable(str('（選填）支付方式名稱或別名；沒用電子支付就省略或傳 null / ""', { example: 'LINE Pay' })),
    amount: num('金額，大於 0', { example: 1280 }),
    transactionAt: str('交易時間，ISO 8601 建議帶時區；省略=現在', { example: '2026-11-15T13:05:00+08:00' }),
    note: nullable(str('商家 / 備註（最多 255 字）', { example: '全聯 信義店' })),
    latitude: nullable(num('緯度 -90~90，需與 longitude 一起提供', { example: 25.033 })),
    longitude: nullable(num('經度 -180~180', { example: 121.5654 })),
    externalRef: nullable(str('記帳系統自己的交易 ID（最多 120 字）；重送同一筆不會重複建立，也可用來更新/刪除', { example: 'ledger-8831' }))
  }, ['amount'], 'cardName 與 cardLastFour 至少要有一個'),

  Point: obj({
    id: int('點數 ID'),
    name: str('名稱', { example: '全聯福利點' }),
    issuer: nullable(str('發行單位')),
    imageUrl: nullable(str('圖片路徑')),
    color: nullable(str('代表色')),
    currentBalance: num('目前餘額（由歷史紀錄重算）'),
    valuePerPoint: nullable(num('每點約值多少新台幣')),
    value: nullable(num('換算新台幣價值 = 餘額 × valuePerPoint')),
    note: nullable(str('備註')),
    monthEarned: num('本月獲得（列表時提供）'),
    monthSpent: num('本月使用（列表時提供）'),
    nextExpiry: nullable(obj({ id: int('提醒 ID'), amount: num('到期數量'), expiryDate: date('到期日'), daysLeft: int('剩幾天') }, null, '最近一筆啟用中的到期提醒（列表時提供）'))
  }),

  PointHistory: obj({
    id: int('紀錄 ID'),
    pointId: int('點數 ID'),
    changeType: str('set=直接設定當下餘額；earn=獲得；spend=使用', { enum: ['set', 'earn', 'spend'] }),
    delta: num('變動量（set 會依前一筆自動推算）'),
    targetBalance: nullable(num('set 宣告的絕對餘額')),
    balanceAfter: num('此筆後的餘額'),
    occurredAt: dateTime('發生時間'),
    note: nullable(str('備註'))
  }),

  PointExpiry: obj({
    id: int('提醒 ID'), pointId: int('點數 ID'), amount: num('到期數量'), expiryDate: date('到期日'),
    status: str('active=提醒中；dismissed=已使用/解除', { enum: ['active', 'dismissed'] }),
    daysLeft: int('距到期天數（負數=已過期）'), note: nullable(str('備註'))
  }),

  Receipt: obj({
    id: int('入帳紀錄 ID'),
    eventId: int('活動 ID'),
    eventTitle: nullable(str('活動名稱')),
    periodStart: nullable(date('核對期間起日（含）')),
    periodEnd: nullable(date('核對期間迄日（含）')),
    expectedAmount: nullable(num('建立時系統計算的應得回饋')),
    receivedAmount: num('實際入帳'),
    difference: nullable(num('實際 − 應得；負數代表少給')),
    receivedDate: date('入帳日'),
    note: nullable(str('備註'))
  }),

  Recommendation: obj({
    amount: num('消費金額'),
    merchant: str('商家'),
    at: dateTime('以哪個時間點計算'),
    consideredEvents: int('納入評估的進行中活動數'),
    options: arr(obj({
      cardId: int('卡片 ID'),
      card: ref('CardRef'),
      paymentMethodId: nullable(int('支付方式 ID；null=直接刷卡')),
      paymentMethod: nullable(ref('PaymentMethodRef')),
      totalReward: num('這筆消費可多拿的回饋（各活動疊加、已扣除上限）'),
      effectiveRate: num('實際回饋率 %'),
      contributions: arr(obj({
        eventId: int('活動 ID'), title: str('活動名稱'), rewardType: str('回饋類型'), reward: num('此活動貢獻的回饋'),
        cashbackPercent: nullable(num('%')), cashbackFixed: nullable(num('固定回饋')),
        capBefore: nullable(bool('刷之前是否已滿額')), capReachedAfter: nullable(bool('刷之後是否滿額')),
        remainingRewardAfter: nullable(num('刷之後此活動本期還可拿')),
        thresholdMetAfter: bool('刷之後是否達累積門檻'), remainingToThresholdAfter: num('刷之後距累積門檻還差'),
        needsRegistration: bool('此活動需登錄但尚未登錄'), merchantKeyword: nullable(str('商家限定命中的關鍵字'))
      })),
      missed: arr(obj({
        eventId: int('活動 ID'), title: str('活動名稱'),
        reason: str('不適用原因', { enum: ['excludedMerchant', 'merchantNotMatched', 'belowMinimum'] }),
        keyword: nullable(str('命中的排除關鍵字')), minimumSpend: nullable(num('單筆門檻'))
      }, null, '卡片/支付相符但這筆不適用的活動'))
    }, null, '依 totalReward 由高到低排序'))
  }),

  DashboardSummary: obj({
    generatedAt: dateTime('產生時間'),
    today: date('伺服器時區的今天'),
    month: obj({ key: str('YYYY-MM'), spend: num('本月刷卡總額'), txnCount: int('本月交易筆數'), lastMonthSpend: num('上月刷卡總額') }),
    rewards: obj({
      estimatedThisCycle: num('進行中活動本期應得回饋合計（點數型回饋以 1 點計 1）'),
      estimatedPointsThisCycle: num('其中屬於點數型回饋的部分'),
      remainingThisCycle: num('進行中活動本期還可拿的回饋合計（有上限的活動）'),
      receivedThisMonth: num('本月已記錄入帳'),
      receivedThisYear: num('今年已記錄入帳')
    }),
    events: obj({ ongoing: int('進行中'), upcoming: int('即將開始'), capReached: int('已滿額'), needsRegistration: int('待登錄') }),
    points: obj({
      count: int('點數種類'), totalValue: num('可換算的點數總價值'), valuedCount: int('有設定換算的點數數'),
      monthEarned: num('本月獲得點數'), monthSpent: num('本月使用點數'),
      items: arr(obj({
        id: int('點數 ID'), name: str('名稱'), issuer: nullable(str('發行單位')), imageUrl: nullable(str('圖片')), color: nullable(str('代表色')),
        currentBalance: num('目前餘額'), valuePerPoint: nullable(num('每點價值')), value: nullable(num('換算新台幣')),
        monthEarned: num('本月獲得'), monthSpent: num('本月使用'),
        nextExpiry: nullable(obj({ amount: num('到期數量'), expiryDate: date('到期日'), daysLeft: int('剩幾天') }, null, '30 天內最近一筆到期'))
      }, null, '各點數目前的量，依價值由高到低'))
    }),
    attention: arr(obj({
      type: str('提醒類型', { enum: ['registration_needed', 'event_starting', 'event_ending', 'cycle_ending', 'threshold_pending', 'point_expiring'] }),
      severity: str('嚴重度', { enum: ['high', 'medium', 'low'] }),
      eventId: int('相關活動'), pointId: int('相關點數'), title: str('標題'), daysLeft: int('剩餘天數'),
      remainingReward: nullable(num('還可拿的回饋')), remainingCapAmount: nullable(num('再刷多少滿額')),
      remainingToThreshold: num('距累積門檻還差'), amount: num('到期點數'), expiryDate: date('到期日')
    }, null, '依嚴重度與剩餘天數排序，欄位依 type 而定')),
    ongoingEvents: arr(obj({}, null, '進行中活動精簡資料（id、title、cards、paymentMethods、timing、usage 摘要），依剩餘可拿回饋排序'))
  }),

  ApiKey: obj({
    id: int('金鑰 ID'), name: str('名稱'), keyMask: str('遮罩後的金鑰（頭尾片段）', { example: 'mcb_…x9Zk' }),
    isActive: bool('是否啟用'), lastUsedAt: nullable(dateTime('最後使用時間')), createdAt: dateTime('建立時間')
  }),

  AiKey: obj({ id: int('金鑰 ID'), name: str('名稱'), keyMask: str('遮罩後的金鑰'), isActive: bool('是否為使用中的金鑰'), createdAt: dateTime('建立時間') })
};

// ─────────────────────────────────────────────────────────────
// Examples
// ─────────────────────────────────────────────────────────────

const EX = {
  usage: {
    cycleStart: '2026-10-31T16:00:00.000Z', cycleEnd: '2026-11-30T16:00:00.000Z', rewardKind: 'percent',
    usedAmount: 5000, txnCount: 3, excludedCount: 1, qualifyingCount: null, estimatedReward: 250, potentialReward: 250,
    cap: 300, capReached: false, capUsedPercent: 83.33, remainingReward: 50, remainingCapAmount: 990,
    remainingCapTransactions: null, minimumSpend: 200, minimumSpendScope: 'perTransaction', thresholdMet: true,
    remainingToThreshold: 0, effectiveRate: 5, rewardRounding: 'round', rewardCalcMode: 'aggregate', rewardPrecision: 0, txnRewards: null
  },
  timing: {
    phase: 'active', daysUntilStart: 0, daysLeft: 46, progress: 49.5,
    cycle: { start: '2026-11-01', end: '2026-11-30', resetDate: '2026-12-01', length: 30, daysLeft: 16, progress: 46.7, endsWithEvent: false }
  }
};
EX.event = {
  id: 12, userId: 1, title: '玉山 Pi 卡 LINE Pay 5%', description: null, note: '需登錄，名額 10 萬名',
  startDate: '2026-10-01', endDate: '2026-12-31', cashbackPercent: '5.000', cashbackFixed: null, rewardType: 'cash',
  maxReward: '300.00', minimumSpend: '200.00', minimumSpendScope: 'perTransaction', cycleType: 'monthly', cycleAnchorDay: 1,
  matchUnspecifiedPayment: false, requireMerchantMatch: false, merchantKeywords: null, excludeMerchantMatch: true,
  excludeMerchantKeywords: '繳費\n儲值', rewardRounding: 'round', rewardCalcMode: 'aggregate', rewardPrecision: 0,
  requiresRegistration: true, registeredAt: '2026-10-02', sourceUrl: 'https://example.com/promo',
  cards: [{ id: 1, name: '玉山 Pi 卡', imageUrl: null, color: 'hsl(210,70%,55%)', network: 'jcb' }],
  paymentMethods: [{ id: 3, name: 'LINE Pay', imageUrl: null }],
  needsRegistration: false, timing: EX.timing, usage: EX.usage,
  createdAt: '2026-10-01T02:00:00.000Z', updatedAt: '2026-10-02T02:00:00.000Z'
};
EX.txn = {
  id: 501, cardId: 1, card: { id: 1, name: '玉山 Pi 卡', imageUrl: null, network: 'jcb', color: 'hsl(210,70%,55%)', lastFour: '1234' },
  paymentMethodId: 3, paymentMethod: { id: 3, name: 'LINE Pay', imageUrl: null },
  amount: '1280.00', transactionAt: '2026-11-15T05:05:00.000Z', note: '全聯 信義店', latitude: 25.033, longitude: 121.5654,
  externalRef: 'ledger-8831', source: 'api', rawCardName: '玉山 Pi 卡', rawPaymentMethodName: 'LINE Pay',
  matchedEvents: [{ id: 12, title: '玉山 Pi 卡 LINE Pay 5%', cashbackPercent: '5.000', cashbackFixed: null, rewardType: 'cash', maxReward: '300.00', estimatedReward: 64, matchedKeyword: null }],
  createdAt: '2026-11-15T05:05:01.000Z', updatedAt: '2026-11-15T05:05:01.000Z'
};
EX.card = { id: 1, name: '玉山 Pi 卡', kind: 'credit', issuer: '玉山銀行', lastFour: '1234', hasPan: true, network: 'jcb', imageUrl: null, color: 'hsl(210,70%,55%)', aliases: 'Pi卡\n玉山Pi拍錢包信用卡', note: null, transactionCount: 42, eventCount: 3 };
EX.pm = { id: 3, name: 'LINE Pay', imageUrl: null, color: 'hsl(140,70%,55%)', aliases: 'LINEPAY', note: null, transactionCount: 18, eventCount: 2 };
EX.point = { id: 4, name: '全聯福利點', issuer: '全聯', imageUrl: null, color: 'hsl(20,70%,55%)', currentBalance: 1350, valuePerPoint: 1, value: 1350, note: null, monthEarned: 120, monthSpent: 0, nextExpiry: { id: 9, amount: 215, expiryDate: '2026-12-31', daysLeft: 46 } };
EX.history = { id: 77, pointId: 4, changeType: 'earn', delta: 120, targetBalance: null, balanceAfter: 1350, occurredAt: '2026-11-15T05:00:00.000Z', note: '購物累積' };
EX.expiry = { id: 9, pointId: 4, userId: 1, amount: 215, expiryDate: '2026-12-31', status: 'active', daysLeft: 46, note: null };
EX.receipt = { id: 5, eventId: 12, eventTitle: '玉山 Pi 卡 LINE Pay 5%', periodStart: '2026-10-01', periodEnd: '2026-10-31', expectedAmount: 300, receivedAmount: 280, difference: -20, receivedDate: '2026-11-20', note: '帳單回饋' };
EX.recommend = {
  amount: 1000, merchant: '全聯', at: '2026-11-15T05:00:00.000Z', consideredEvents: 6,
  options: [{
    cardId: 2, card: { id: 2, name: '國泰 CUBE', imageUrl: null, color: null, network: 'visa' },
    paymentMethodId: 3, paymentMethod: { id: 3, name: 'LINE Pay', imageUrl: null },
    totalReward: 30, effectiveRate: 3,
    contributions: [{ eventId: 7, title: 'CUBE LINE Pay 3%', rewardType: 'point', reward: 30, cashbackPercent: 3, cashbackFixed: null, capBefore: null, capReachedAfter: null, remainingRewardAfter: null, thresholdMetAfter: true, remainingToThresholdAfter: 0, needsRegistration: false, merchantKeyword: null }],
    missed: []
  }, {
    cardId: 1, card: { id: 1, name: '玉山 Pi 卡', imageUrl: null, color: null, network: 'jcb' },
    paymentMethodId: null, paymentMethod: null, totalReward: 5, effectiveRate: 0.5,
    contributions: [{ eventId: 12, title: '玉山 5%', rewardType: 'cash', reward: 5, cashbackPercent: 5, cashbackFixed: null, capBefore: false, capReachedAfter: true, remainingRewardAfter: 0, thresholdMetAfter: true, remainingToThresholdAfter: 0, needsRegistration: false, merchantKeyword: null }],
    missed: [{ eventId: 15, title: '全聯不回饋活動', reason: 'excludedMerchant', keyword: '全聯', minimumSpend: null }]
  }]
};
EX.summary = {
  generatedAt: '2026-11-15T05:00:00.000Z', today: '2026-11-15',
  month: { key: '2026-11', spend: 18320, txnCount: 27, lastMonthSpend: 25110 },
  rewards: { estimatedThisCycle: 612, estimatedPointsThisCycle: 120, remainingThisCycle: 388, receivedThisMonth: 280, receivedThisYear: 4120 },
  events: { ongoing: 8, upcoming: 1, capReached: 2, needsRegistration: 1 },
  points: {
    count: 3, totalValue: 2150, valuedCount: 2, monthEarned: 160, monthSpent: 0,
    items: [{ id: 4, name: '全聯福利點', issuer: '全聯', imageUrl: null, color: 'hsl(20,70%,55%)', currentBalance: 1350, valuePerPoint: 1, value: 1350, monthEarned: 120, monthSpent: 0, nextExpiry: { amount: 215, expiryDate: '2026-11-20', daysLeft: 5 } }]
  },
  attention: [
    { type: 'registration_needed', severity: 'high', eventId: 14, title: '台新 GoGo 雙11', daysLeft: 16, phase: 'active' },
    { type: 'event_ending', severity: 'high', eventId: 9, title: '永豐 DAWHO 加碼', daysLeft: 2, remainingReward: 120, remainingCapAmount: 2400 },
    { type: 'point_expiring', severity: 'high', pointId: 4, expiryId: 9, title: '全聯福利點', amount: 215, expiryDate: '2026-11-20', daysLeft: 5 }
  ],
  ongoingEvents: []
};

// ─────────────────────────────────────────────────────────────
// Operation builder
// ─────────────────────────────────────────────────────────────

const AUTH = {
  session: [{ sessionCookie: [] }],
  apiKey: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  none: []
};

const COMMON_ERRORS = {
  session: [[401, 'UNAUTHORIZED', '未登入或 Session 過期（請重新登入）']],
  apiKey: [
    [401, 'UNAUTHORIZED', '沒有帶 API 金鑰'],
    [401, 'INVALID_API_KEY', '金鑰錯誤或已停用'],
    [429, 'RATE_LIMITED', '超過每分鐘請求上限（預設 300 次，見 Retry-After）']
  ],
  none: []
};

function pathParam(name, description) {
  return { name, in: 'path', required: true, description, schema: { type: name === 'externalRef' ? 'string' : 'integer' } };
}

function q(name, description, schema = { type: 'string' }, extra = {}) {
  return { name, in: 'query', required: false, description, schema, ...extra };
}

/**
 * op({ tag, summary, description, auth, params, query, body, bodyExample,
 *      multipart, response, example, status, errors })
 */
function op(o) {
  const auth = o.auth || 'session';
  const errors = (o.errors || []).concat(COMMON_ERRORS[auth]);
  const responses = {
    [String(o.status || 200)]: {
      description: o.responseDescription || '成功',
      content: { 'application/json': { schema: o.response || ref('Ok'), example: o.example !== undefined ? o.example : { ok: true } } }
    }
  };
  for (const [status, code, desc] of errors) {
    const key = String(status);
    if (!responses[key]) {
      responses[key] = { description: '', content: { 'application/json': { schema: ref('Error'), examples: {} } } };
    }
    responses[key].description = responses[key].description ? `${responses[key].description}；${code}` : code;
    responses[key].content['application/json'].examples[code] = { summary: desc, value: { error: code, message: desc } };
  }
  const out = {
    tags: [o.tag],
    summary: o.summary,
    description: o.description,
    security: AUTH[auth],
    'x-auth': auth,
    parameters: [...(o.params || []), ...(o.query || [])],
    responses
  };
  if (o.body) {
    const media = o.multipart ? 'multipart/form-data' : 'application/json';
    out.requestBody = {
      required: o.bodyRequired !== false,
      content: { [media]: { schema: o.body, ...(o.bodyExample !== undefined ? { example: o.bodyExample } : {}) } }
    };
    if (o.multipart) out.requestBody.content['application/json'] = { schema: o.body, example: o.bodyExample };
  }
  return out;
}

const statusQuery = q('status', 'active=未結束（含即將開始，預設）、ongoing=進行中、upcoming=即將開始、expired=已結束、all=全部',
  { type: 'string', enum: ['active', 'ongoing', 'upcoming', 'expired', 'all'], default: 'active' });
const pagingQuery = [
  q('page', '頁碼（從 1 開始）', { type: 'integer', default: 1 }),
  q('pageSize', '每頁筆數', { type: 'integer', default: 20, maximum: 200 })
];
const txnFilterQuery = [
  q('q', '關鍵字（比對備註、卡片名稱、支付方式名稱）'),
  q('cardId', '卡片 ID', { type: 'integer' }),
  q('paymentMethodId', '支付方式 ID；none=未使用電子支付'),
  q('from', '交易時間起（ISO 8601，含）', { type: 'string', format: 'date-time' }),
  q('to', '交易時間迄（ISO 8601，含）', { type: 'string', format: 'date-time' }),
  q('minAmount', '金額下限', { type: 'number' }),
  q('maxAmount', '金額上限', { type: 'number' }),
  q('source', '來源', { type: 'string', enum: ['api', 'manual'] })
];
const recommendQuery = [
  q('amount', '消費金額（必填）', { type: 'number' }, { required: true }),
  q('merchant', '商家名稱，用來比對商家限定 / 排除商家（例如「全聯」「CAMA」）'),
  q('cardId', '只考慮這張卡', { type: 'integer' }),
  q('paymentMethodId', '只考慮這個支付方式；none=直接刷卡'),
  q('at', '以這個時間點計算（ISO 8601，預設現在）', { type: 'string', format: 'date-time' }),
  q('limit', '最多回傳幾個組合（1-50，預設 10）', { type: 'integer', default: 10 })
];
const eventFilterQuery = [
  statusQuery,
  q('q', '關鍵字（標題、說明、備註、商家關鍵字、卡片 / 支付方式名稱，不分大小寫與空白）'),
  q('cardId', '只列綁定此卡的活動', { type: 'integer' }),
  q('paymentMethodId', '只列綁定此支付方式的活動；none=適用直接刷卡的活動')
];

const cardFormBody = obj({
  name: str('名稱（必填）'), kind: str('類型', { enum: ['credit', 'debit', 'bank', 'other'] }), issuer: str('發卡銀行'),
  pan: str('完整卡號 13-19 碼（AES-256-GCM 加密儲存；更新時留空=不變）'), removePan: bool('true=刪除已儲存的完整卡號'),
  network: str('發卡組織', { enum: ['visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'] }),
  aliases: str('別名（換行分隔）'), note: str('備註'), image: str('卡面圖片檔（multipart，最大 4MB）', { format: 'binary' }),
  removeImage: bool('true=移除圖片')
});
const pmFormBody = obj({
  name: str('名稱（必填）'), aliases: str('別名（換行分隔）'), note: str('備註'),
  image: str('圖片檔（multipart，最大 4MB）', { format: 'binary' }), removeImage: bool('true=移除圖片')
});
const pointFormBody = obj({
  name: str('名稱（必填）'), issuer: str('發行單位'), currentBalance: num('建立時的初始餘額（僅新增時）'),
  valuePerPoint: num('每點約值多少新台幣'), note: str('備註'), image: str('圖片（multipart）', { format: 'binary' }), removeImage: bool('true=移除圖片')
});
const historyBody = obj({
  changeType: str('set / earn / spend', { enum: ['set', 'earn', 'spend'] }), amount: num('數量（set 時為當下餘額）'),
  occurredAt: str('發生時間 ISO 8601（預設現在）', { format: 'date-time' }), note: str('備註')
}, ['changeType', 'amount']);
const receiptBody = obj({
  periodStart: nullable(date('核對期間起日')), periodEnd: nullable(date('核對期間迄日（含）')),
  receivedAmount: num('實際入帳金額（必填）'), receivedDate: date('入帳日（預設今天）'),
  expectedAmount: nullable(num('應得回饋；省略時系統依期間自動計算並存為快照')), note: nullable(str('備註'))
}, ['receivedAmount']);

// ─────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────

function buildPaths() {
  const P = {};
  const add = (path, method, operation) => {
    P[path] = P[path] || {};
    P[path][method] = operation;
  };

  // ── System ──
  add('/healthz', 'get', op({
    tag: '系統', auth: 'none', summary: '健康檢查', description: '確認服務存活（監控用）。',
    response: obj({ ok: bool('true'), ts: int('伺服器時間 epoch ms') }), example: { ok: true, ts: 1763182800000 }
  }));
  add('/manifest.webmanifest', 'get', op({
    tag: '系統', auth: 'none', summary: 'PWA Manifest', description: '安裝為 App 用的 Web App Manifest，start_url / scope 會依 BASE_URL 自動調整。',
    response: obj({}, null, 'Web App Manifest'), example: { name: 'MyCashback 回饋管家', short_name: 'MyCashback', start_url: '/' }
  }));
  add('/firebase-messaging-sw.js', 'get', op({
    tag: '系統', auth: 'none', summary: 'Service Worker', description: '離線快取與 FCM 推播的 Service Worker（JavaScript）。`/sw.js` 為同一檔案的別名。',
    response: str('JavaScript 原始碼'), example: '/* service worker */'
  }));
  add('/sw.js', 'get', op({
    tag: '系統', auth: 'none', summary: 'Service Worker（別名）', description: '同 `/firebase-messaging-sw.js`。',
    response: str('JavaScript 原始碼'), example: '/* service worker */'
  }));
  add('/api/docs/openapi.json', 'get', op({
    tag: '系統', auth: 'none', summary: '取得 OpenAPI 規格', description: '本文件的機器可讀版本（OpenAPI 3.0），可匯入 Postman / Insomnia / Swagger Editor 產生程式碼。',
    response: obj({}, null, 'OpenAPI 3.0 文件'), example: { openapi: '3.0.3', info: { title: 'MyCashback API' } }
  }));

  // ── Auth ──
  add('/auth/sessionLogin', 'post', op({
    tag: '登入', auth: 'none', summary: '以 Firebase ID Token 換取 Session Cookie',
    description: '前端用 Firebase Web SDK 登入後，把 5 分鐘內取得的 ID Token 傳來，伺服器回寫 HttpOnly `session` Cookie（預設 5 天）。之後所有 Session 類 API 都靠這個 Cookie 認證。',
    body: obj({ idToken: str('Firebase ID Token') }, ['idToken']), bodyExample: { idToken: 'eyJhbGciOiJSUzI1NiIs...' },
    example: { ok: true },
    errors: [[400, 'MISSING_ID_TOKEN', '沒有帶 idToken'], [401, 'INVALID_ID_TOKEN', 'Token 無效'], [401, 'RECENT_LOGIN_REQUIRED', 'Token 超過 5 分鐘，請重新登入'], [500, 'FIREBASE_NOT_CONFIGURED', '伺服器未設定 Firebase']]
  }));
  add('/auth/logout', 'post', op({
    tag: '登入', auth: 'none', summary: '登出', description: '清除 Session Cookie 並撤銷 Firebase refresh token。'
  }));
  add('/auth/me', 'get', op({
    tag: '登入', summary: '目前登入者', description: '回傳目前 Session 對應的本地使用者。',
    response: obj({ id: int('使用者 ID'), email: nullable(str('Email')), displayName: nullable(str('顯示名稱')) }),
    example: { id: 1, email: 'me@example.com', displayName: 'me@example.com' }
  }));

  // ── Ingest (API key) ──
  const ingestErrors = [
    [400, 'CARD_NAME_REQUIRED', '沒有 cardName 也沒有 cardLastFour'],
    [400, 'AMOUNT_INVALID', 'amount 不是大於 0 的數字'],
    [400, 'TRANSACTION_AT_INVALID', 'transactionAt 無法解析'],
    [400, 'LOCATION_INCOMPLETE', '只給了 latitude 或 longitude 其中一個'],
    [400, 'LOCATION_INVALID', '經緯度超出範圍'],
    [422, 'CARD_NOT_FOUND', '對不到卡片（回應附 knownCards 清單）'],
    [422, 'PAYMENT_METHOD_NOT_FOUND', '對不到支付方式（回應附 knownPaymentMethods 清單）']
  ];
  add('/api/ingest/card-transactions', 'post', op({
    tag: '外部串接：回報交易', auth: 'apiKey', status: 201,
    summary: '回報一筆刷卡交易',
    description: '記帳系統每發生一筆交易就呼叫一次，系統會自動累計各回饋活動當期消費。\n\n'
      + '- **卡片對應**：cardName 完全相同 → 忽略大小寫/空白後比對名稱與「別名」 → cardLastFour 末四碼。\n'
      + '- **冪等**：帶 externalRef 時，重送同一筆會回 **200** 與原紀錄，不會重複建立；網路逾時可放心重試。\n'
      + '- **回應**會附上 matchedEvents（這筆會計入哪些活動）。',
    body: ref('IngestTransaction'),
    bodyExample: { cardName: '玉山 Pi 卡', paymentMethodName: 'LINE Pay', amount: 1280, transactionAt: '2026-11-15T13:05:00+08:00', note: '全聯 信義店', latitude: 25.033, longitude: 121.5654, externalRef: 'ledger-8831' },
    response: ref('Transaction'), example: EX.txn, responseDescription: '201 新增成功；200 代表 externalRef 已存在（回傳原紀錄）',
    errors: ingestErrors
  }));
  add('/api/ingest/card-transactions/batch', 'post', op({
    tag: '外部串接：回報交易', auth: 'apiKey',
    summary: '批次回報交易（最多 200 筆）',
    description: '一次回報多筆（例如補登歷史資料）。每筆獨立處理，單筆失敗不影響其他筆；用 results[].status 判斷每筆結果。',
    body: obj({ transactions: arr(ref('IngestTransaction')) }, ['transactions']),
    bodyExample: { transactions: [{ cardName: '玉山 Pi 卡', amount: 1280, transactionAt: '2026-11-15T13:05:00+08:00', note: '全聯', externalRef: 'ledger-8831' }, { cardName: '不存在的卡', amount: 50, externalRef: 'ledger-8832' }] },
    response: obj({
      created: int('新增筆數'), duplicates: int('externalRef 已存在而略過的筆數'), errors: int('失敗筆數'),
      results: arr(obj({ index: int('對應 transactions 陣列索引'), status: str('created / duplicate / error'), id: int('交易 ID'), externalRef: nullable(str('externalRef')), error: str('錯誤代碼'), message: str('錯誤說明') }))
    }),
    example: { created: 1, duplicates: 0, errors: 1, results: [{ index: 0, status: 'created', id: 501, externalRef: 'ledger-8831' }, { index: 1, status: 'error', error: 'CARD_NOT_FOUND', message: '找不到名稱為「不存在的卡」的卡片…', knownCards: ['玉山 Pi 卡'] }] },
    errors: [[400, 'TRANSACTIONS_REQUIRED', 'body 不是 { transactions: [...] }'], [413, 'BATCH_TOO_LARGE', '超過 200 筆']]
  }));
  const refParam = pathParam('externalRef', '回報時帶的 externalRef（URL encode）');
  add('/api/ingest/card-transactions/{externalRef}', 'get', op({
    tag: '外部串接：回報交易', auth: 'apiKey', summary: '依 externalRef 查詢交易', description: '確認某筆是否已回報成功。',
    params: [refParam], response: ref('Transaction'), example: EX.txn, errors: [[404, 'NOT_FOUND', '查無此 externalRef']]
  }));
  add('/api/ingest/card-transactions/{externalRef}', 'put', op({
    tag: '外部串接：回報交易', auth: 'apiKey', summary: '依 externalRef 更新交易',
    description: '部分更新：只會修改 body 有帶的欄位（例如記帳系統修正了金額或商家）。欄位定義同回報 API。',
    params: [refParam], body: ref('IngestTransaction'), bodyExample: { amount: 1180, note: '全聯 信義店（修正）' },
    response: ref('Transaction'), example: EX.txn, errors: [[404, 'NOT_FOUND', '查無此 externalRef']].concat(ingestErrors.slice(1))
  }));
  add('/api/ingest/card-transactions/{externalRef}', 'delete', op({
    tag: '外部串接：回報交易', auth: 'apiKey', summary: '依 externalRef 刪除交易',
    description: '交易被取消或全額退款時呼叫，該筆將不再計入任何活動。',
    params: [refParam], response: obj({ ok: bool('true'), id: int('被刪除的交易 ID'), externalRef: str('externalRef') }),
    example: { ok: true, id: 501, externalRef: 'ledger-8831' }, errors: [[404, 'NOT_FOUND', '查無此 externalRef']]
  }));

  // ── External read (API key) ──
  add('/api/external/recommend', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '刷哪張最划算',
    description: '輸入金額（與商家），依每個進行中活動「本期已刷金額、上限、門檻、商家限定/排除」計算這筆消費能多拿多少回饋，回傳排序後的卡片 × 支付方式組合。\n\n'
      + '額外提供 `best.text` 一行文字，方便 iOS 捷徑 / Android Tasker 直接朗讀或顯示。',
    query: recommendQuery,
    response: { allOf: [ref('Recommendation'), obj({ best: nullable(obj({ text: str('一行建議'), cardName: str('卡片'), paymentMethodName: nullable(str('支付方式')), totalReward: num('回饋'), effectiveRate: num('%') })) })] },
    example: { ...EX.recommend, best: { text: '國泰 CUBE + LINE Pay：約回饋 30（3%）', cardName: '國泰 CUBE', paymentMethodName: 'LINE Pay', totalReward: 30, effectiveRate: 3 } },
    errors: [[400, 'AMOUNT_REQUIRED', '沒有帶 amount'], [400, 'INVALID_AMOUNT', 'amount 不合法']]
  }));
  add('/api/external/summary', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '總覽（同 App 首頁）',
    description: '本月刷卡、本期應得 / 還可拿回饋、待辦提醒（待登錄、即將結束、點數到期…）。',
    response: ref('DashboardSummary'), example: EX.summary
  }));
  add('/api/external/cards', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '卡片與其回饋活動（含本期使用量）',
    description: '每張卡附上綁定的活動、完整條件與本期使用量；圖片為絕對網址。',
    query: [statusQuery],
    response: obj({ generatedAt: dateTime('產生時間'), cards: arr(obj({ id: int('卡片 ID'), name: str('名稱'), kind: str('類型'), issuer: nullable(str('銀行')), network: nullable(str('組織')), lastFour: nullable(str('末四碼')), color: nullable(str('顏色')), imageUrl: nullable(str('絕對網址')), events: arr(ref('Event')) })) }),
    example: { generatedAt: '2026-11-15T05:00:00.000Z', cards: [{ id: 1, name: '玉山 Pi 卡', kind: 'credit', issuer: '玉山銀行', network: 'jcb', lastFour: '1234', color: 'hsl(210,70%,55%)', imageUrl: null, events: [EX.event] }] }
  }));
  add('/api/external/events', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '回饋活動列表（含本期使用量）',
    description: '與 App 回饋頁相同的篩選條件。merchantKeywords / excludeMerchantKeywords 在此以字串陣列回傳。',
    query: eventFilterQuery,
    response: obj({ generatedAt: dateTime('產生時間'), events: arr(ref('Event')) }),
    example: { generatedAt: '2026-11-15T05:00:00.000Z', events: [{ ...EX.event, merchantKeywords: [], excludeMerchantKeywords: ['繳費', '儲值'] }] }
  }));
  add('/api/external/transactions', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '交易紀錄', description: '分頁列出交易（預設每頁 50，最多 500）。',
    query: [...txnFilterQuery, q('page', '頁碼', { type: 'integer', default: 1 }), q('pageSize', '每頁筆數（最多 500）', { type: 'integer', default: 50 })],
    response: obj({ items: arr(ref('Transaction')), total: int('總筆數'), page: int('頁碼'), pageSize: int('每頁筆數') }),
    example: { items: [EX.txn], total: 1, page: 1, pageSize: 50 }
  }));
  add('/api/external/points', 'get', op({
    tag: '外部串接：查詢', auth: 'apiKey', summary: '點數餘額與到期', description: '各點數餘額、換算價值與尚未到期的到期提醒。',
    response: obj({ generatedAt: dateTime('產生時間'), points: arr(obj({ id: int('ID'), name: str('名稱'), issuer: nullable(str('發行')), currentBalance: num('餘額'), valuePerPoint: nullable(num('每點價值')), value: nullable(num('價值')), imageUrl: nullable(str('絕對網址')), expiries: arr(obj({ amount: num('數量'), expiryDate: date('到期日'), note: nullable(str('備註')) })) })) }),
    example: { generatedAt: '2026-11-15T05:00:00.000Z', points: [{ id: 4, name: '全聯福利點', issuer: '全聯', currentBalance: 1350, valuePerPoint: 1, value: 1350, imageUrl: null, expiries: [{ amount: 215, expiryDate: '2026-12-31', note: null }] }] }
  }));

  // ── Dashboard ──
  add('/api/dashboard/summary', 'get', op({
    tag: '首頁', summary: '首頁總覽', description: 'App 首頁一次取得所有統計與提醒（取代逐一抓取各點數歷史）。',
    response: ref('DashboardSummary'), example: EX.summary
  }));

  // ── Cashback ──
  const evIdParam = pathParam('id', '活動 ID');
  const evNotFound = [404, 'NOT_FOUND', '找不到此回饋活動'];
  const evValidation = [
    [400, 'TITLE_REQUIRED', '沒有活動名稱'], [400, 'DATE_RANGE_INVALID', '結束日早於開始日'],
    [400, 'INVALID_CASHBACK_PERCENT', '回饋 % 不在 0-100'], [400, 'INVALID_START_DATE', '日期格式錯誤'],
    [400, 'INVALID_CYCLE_ANCHOR_DAY', '重置日超出範圍'], [400, 'INVALID_SOURCE_URL', '網址不是 http/https']
  ];
  add('/api/cashback', 'get', op({
    tag: '回饋活動', summary: '列出回饋活動',
    description: '每筆附 timing（剩餘天數、本期區間）與 usage（本期已刷、應得回饋、距上限）。預設依結束日排序（沒有結束日的排最後）。',
    query: eventFilterQuery, response: arr(ref('Event')), example: [EX.event]
  }));
  add('/api/cashback', 'post', op({
    tag: '回饋活動', status: 201, summary: '新增回饋活動', description: '只有 title 必填，其餘欄位見 EventInput。',
    body: ref('EventInput'),
    bodyExample: { title: '玉山 Pi 卡 LINE Pay 5%', startDate: '2026-10-01', endDate: '2026-12-31', cashbackPercent: 5, maxReward: 300, minimumSpend: 200, cycleType: 'monthly', cycleAnchorDay: 1, cardIds: [1], paymentMethodIds: [3], requiresRegistration: true, excludeMerchantMatch: true, excludeMerchantKeywords: '繳費\n儲值' },
    response: ref('Event'), example: EX.event, errors: evValidation
  }));
  add('/api/cashback/{id}', 'get', op({ tag: '回饋活動', summary: '取得單一活動', params: [evIdParam], response: ref('Event'), example: EX.event, errors: [evNotFound] }));
  add('/api/cashback/{id}', 'put', op({
    tag: '回饋活動', summary: '更新活動（部分更新）', description: '只更新 body 有帶的欄位；cardIds / paymentMethodIds 有帶時整組取代。',
    params: [evIdParam], body: ref('EventInput'), bodyExample: { maxReward: 500, endDate: '2027-01-31' },
    response: ref('Event'), example: EX.event, errors: [evNotFound, ...evValidation]
  }));
  add('/api/cashback/{id}', 'delete', op({ tag: '回饋活動', summary: '刪除活動', description: '同時刪除此活動的入帳紀錄；交易紀錄不受影響。', params: [evIdParam], errors: [evNotFound] }));
  add('/api/cashback/{id}/duplicate', 'post', op({
    tag: '回饋活動', status: 201, summary: '複製活動', description: '常用於銀行換季重新公告的活動：複製所有條件與綁定，可順便指定新的名稱與期間；登錄狀態會清空。',
    params: [evIdParam], bodyRequired: false,
    body: obj({ title: str('新名稱（預設「原名稱（複製）」）'), startDate: nullable(date('新開始日')), endDate: nullable(date('新結束日')) }),
    bodyExample: { startDate: '2027-01-01', endDate: '2027-03-31' }, response: ref('Event'), example: EX.event, errors: [evNotFound]
  }));
  add('/api/cashback/{id}/registration', 'put', op({
    tag: '回饋活動', summary: '標記已登錄 / 取消登錄', description: '會自動把活動設為「需要登錄」。',
    params: [evIdParam], body: obj({ registered: bool('true=已登錄'), date: nullable(date('登錄日（預設今天）')) }, ['registered']),
    bodyExample: { registered: true }, response: ref('Event'), example: EX.event, errors: [evNotFound]
  }));
  add('/api/cashback/recommend', 'get', op({
    tag: '回饋活動', summary: '刷哪張最划算', description: '同外部 API `/api/external/recommend`（不含 best 欄位），供 App「刷哪張」頁使用。',
    query: recommendQuery, response: ref('Recommendation'), example: EX.recommend,
    errors: [[400, 'AMOUNT_REQUIRED', '沒有帶 amount']]
  }));
  add('/api/cashback/rewards-audit', 'get', op({
    tag: '回饋核對', summary: '回饋核對（應得 vs 實際入帳）',
    description: '依交易紀錄計算每個活動在指定區間「應得」的回饋，附上計入 / 排除的交易明細，以及與該區間重疊的入帳紀錄，用來核對銀行有沒有少給。\n\n'
      + '- range=cycle（預設）：各活動本期\n- range=prevCycle：各活動上一個已結束的週期（無週期或尚未滿一期的活動會略過）\n- range=range：自訂 from / to（to 不含）',
    query: [...eventFilterQuery, q('range', '計算區間', { type: 'string', enum: ['cycle', 'prevCycle', 'range'], default: 'cycle' }),
      q('from', 'range=range 時的起點 ISO 8601（含）', { type: 'string', format: 'date-time' }), q('to', 'range=range 時的終點 ISO 8601（不含）', { type: 'string', format: 'date-time' })],
    response: obj({
      range: str('cycle / prevCycle / range'), from: nullable(dateTime('自訂起')), to: nullable(dateTime('自訂迄')),
      totals: obj({ expected: num('應得合計'), received: num('已記錄入帳合計'), spend: num('消費合計') }),
      events: arr({ allOf: [ref('Event'), obj({ period: obj({ start: nullable(date('起')), end: nullable(date('迄（含）')) }), receipts: arr(ref('Receipt')), reconciliation: obj({ expected: nullable(num('應得')), received: nullable(num('實際（無紀錄為 null）')), difference: nullable(num('差額')) }) })] })
    }),
    example: { range: 'prevCycle', from: null, to: null, totals: { expected: 300, received: 280, spend: 6400 }, events: [{ ...EX.event, period: { start: '2026-10-01', end: '2026-10-31' }, receipts: [EX.receipt], reconciliation: { expected: 300, received: 280, difference: -20 } }] },
    errors: [[400, 'RANGE_INVALID', 'from 不早於 to']]
  }));
  add('/api/cashback/receipts', 'get', op({
    tag: '回饋核對', summary: '列出入帳紀錄', description: '所有活動的實際入帳紀錄，依入帳日新到舊。',
    query: [q('eventId', '只看某個活動', { type: 'integer' }), q('from', '入帳日起 YYYY-MM-DD', { type: 'string', format: 'date' }), q('to', '入帳日迄 YYYY-MM-DD（含）', { type: 'string', format: 'date' })],
    response: obj({ items: arr(ref('Receipt')), totals: obj({ received: num('實際合計'), expected: num('應得合計') }) }),
    example: { items: [EX.receipt], totals: { received: 280, expected: 300 } }
  }));
  add('/api/cashback/{id}/receipts', 'post', op({
    tag: '回饋核對', status: 201, summary: '記錄實際入帳', description: '沒帶 expectedAmount 時，系統依 periodStart~periodEnd 計算應得回饋並存成快照，之後交易變動不會改到這筆紀錄。',
    params: [evIdParam], body: receiptBody, bodyExample: { periodStart: '2026-10-01', periodEnd: '2026-10-31', receivedAmount: 280, receivedDate: '2026-11-20', note: '帳單回饋' },
    response: ref('Receipt'), example: EX.receipt, errors: [evNotFound, [400, 'RECEIVED_AMOUNT_REQUIRED', '沒有實際入帳金額'], [400, 'DATE_RANGE_INVALID', '迄日早於起日']]
  }));
  const ridParam = pathParam('rid', '入帳紀錄 ID');
  add('/api/cashback/{id}/receipts/{rid}', 'put', op({
    tag: '回饋核對', summary: '修改入帳紀錄（部分更新）', description: '修改期間且沒帶 expectedAmount 時會重新計算應得回饋。',
    params: [evIdParam, ridParam], body: receiptBody, bodyExample: { receivedAmount: 300 }, response: ref('Receipt'), example: EX.receipt,
    errors: [evNotFound, [404, 'RECEIPT_NOT_FOUND', '找不到此入帳紀錄']]
  }));
  add('/api/cashback/{id}/receipts/{rid}', 'delete', op({
    tag: '回饋核對', summary: '刪除入帳紀錄', params: [evIdParam, ridParam], errors: [evNotFound, [404, 'RECEIPT_NOT_FOUND', '找不到此入帳紀錄']]
  }));

  // ── Transactions ──
  const txnIdParam = pathParam('id', '交易 ID');
  add('/api/transactions', 'get', op({
    tag: '交易紀錄', summary: '列出交易（分頁）', description: '每筆附 matchedEvents；summary 為整個篩選結果（非僅本頁）的筆數與金額合計。',
    query: [...txnFilterQuery, ...pagingQuery],
    response: obj({ items: arr(ref('Transaction')), total: int('總筆數'), page: int('頁碼'), pageSize: int('每頁'), summary: obj({ count: int('筆數'), totalAmount: num('金額合計') }) }),
    example: { items: [EX.txn], total: 1, page: 1, pageSize: 20, summary: { count: 1, totalAmount: 1280 } },
    errors: [[400, 'INVALID_FROM', 'from 無法解析']]
  }));
  const txnBody = obj({
    cardId: int('卡片 ID（新增必填）'), paymentMethodId: nullable(int('支付方式 ID；null=未使用電子支付')), amount: num('金額 > 0（新增必填）'),
    transactionAt: str('交易時間 ISO 8601（預設現在）', { format: 'date-time' }), note: nullable(str('備註 / 商家')),
    latitude: nullable(num('緯度')), longitude: nullable(num('經度'))
  });
  add('/api/transactions', 'post', op({
    tag: '交易紀錄', status: 201, summary: '手動新增交易', body: txnBody,
    bodyExample: { cardId: 1, paymentMethodId: 3, amount: 1280, transactionAt: '2026-11-15T13:05:00+08:00', note: '全聯' },
    response: ref('Transaction'), example: { ...EX.txn, source: 'manual', externalRef: null },
    errors: [[400, 'CARD_ID_REQUIRED', '沒有選卡片'], [400, 'CARD_NOT_FOUND', '卡片不存在'], [400, 'PAYMENT_METHOD_NOT_FOUND', '支付方式不存在'], [400, 'AMOUNT_INVALID', '金額不合法'], [400, 'LOCATION_INCOMPLETE', '經緯度只給一個']]
  }));
  add('/api/transactions/stats', 'get', op({
    tag: '交易紀錄', summary: '消費統計', description: '依卡片、支付方式、日期分組的金額與筆數（篩選條件同列表）。',
    query: txnFilterQuery,
    response: obj({ totalAmount: num('合計'), count: int('筆數'), byCard: arr(obj({ cardId: int('卡片'), name: str('名稱'), total: num('金額'), count: int('筆數') })), byPaymentMethod: arr(obj({ paymentMethodId: nullable(int('支付方式；null=直接刷卡')), name: nullable(str('名稱')), total: num('金額'), count: int('筆數') })), byDay: arr(obj({ date: date('日期'), total: num('金額'), count: int('筆數') })) }),
    example: { totalAmount: 18320, count: 27, byCard: [{ cardId: 1, name: '玉山 Pi 卡', total: 12000, count: 15 }], byPaymentMethod: [{ paymentMethodId: null, name: null, total: 9000, count: 10 }], byDay: [{ date: '2026-11-15', total: 1280, count: 1 }] }
  }));
  add('/api/transactions/locations', 'get', op({
    tag: '交易紀錄', summary: '有經緯度的交易（地圖用）', description: '不分頁（最多 5000 筆），篩選條件同列表。',
    query: txnFilterQuery, response: arr(ref('Transaction')), example: [EX.txn]
  }));
  add('/api/transactions/{id}', 'get', op({ tag: '交易紀錄', summary: '取得單筆交易', params: [txnIdParam], response: ref('Transaction'), example: EX.txn, errors: [[404, 'NOT_FOUND', '找不到此筆交易']] }));
  add('/api/transactions/{id}', 'put', op({
    tag: '交易紀錄', summary: '修改交易（部分更新）', params: [txnIdParam], body: txnBody, bodyExample: { amount: 1180, note: '全聯（退一項）' },
    response: ref('Transaction'), example: EX.txn, errors: [[404, 'NOT_FOUND', '找不到此筆交易'], [400, 'AMOUNT_INVALID', '金額不合法']]
  }));
  add('/api/transactions/{id}', 'delete', op({ tag: '交易紀錄', summary: '刪除交易', params: [txnIdParam], errors: [[404, 'NOT_FOUND', '找不到此筆交易']] }));

  // ── API keys ──
  const keyIdParam = pathParam('keyId', 'API 金鑰 ID');
  add('/api/transactions/api-keys', 'get', op({ tag: 'API 金鑰', summary: '列出 API 金鑰', description: '只回傳遮罩後的金鑰。', response: arr(ref('ApiKey')), example: [{ id: 1, name: '記帳 App', keyMask: 'mcb_…x9Zk', isActive: true, lastUsedAt: '2026-11-15T05:05:01.000Z', createdAt: '2026-10-01T00:00:00.000Z' }] }));
  add('/api/transactions/api-keys', 'post', op({
    tag: 'API 金鑰', status: 201, summary: '建立 API 金鑰', description: '**明碼 token 只會在這次回應出現一次**，之後只存 SHA-256 雜湊，無法再查看。外部串接（/api/ingest/*、/api/external/*）都用這把金鑰。',
    body: obj({ name: str('名稱（最多 120 字）') }, ['name']), bodyExample: { name: '記帳 App' },
    response: { allOf: [ref('ApiKey'), obj({ token: str('完整金鑰，請立即保存') })] },
    example: { id: 2, name: '記帳 App', keyMask: 'mcb_…x9Zk', isActive: true, lastUsedAt: null, createdAt: '2026-11-15T05:00:00.000Z', token: 'mcb_8c1Vw0…完整 43 字元…x9Zk' },
    errors: [[400, 'NAME_REQUIRED', '沒有名稱'], [400, 'NAME_TOO_LONG', '名稱過長']]
  }));
  add('/api/transactions/api-keys/{keyId}', 'put', op({
    tag: 'API 金鑰', summary: '改名 / 啟用 / 停用金鑰', params: [keyIdParam], body: obj({ name: str('新名稱'), isActive: bool('啟用狀態') }),
    bodyExample: { isActive: false }, response: ref('ApiKey'), example: { id: 2, name: '記帳 App', keyMask: 'mcb_…x9Zk', isActive: false, lastUsedAt: null, createdAt: '2026-11-15T05:00:00.000Z' },
    errors: [[404, 'NOT_FOUND', '找不到此金鑰']]
  }));
  add('/api/transactions/api-keys/{keyId}', 'delete', op({ tag: 'API 金鑰', summary: '刪除金鑰', description: '使用此金鑰的呼叫會立即失效。', params: [keyIdParam], errors: [[404, 'NOT_FOUND', '找不到此金鑰']] }));

  // ── Points ──
  const ptIdParam = pathParam('id', '點數 ID');
  const ptNotFound = [404, 'NOT_FOUND', '找不到此點數'];
  add('/api/points', 'get', op({ tag: '點數', summary: '列出點數', description: '含換算價值、本月獲得/使用與最近到期提醒。', response: arr(ref('Point')), example: [EX.point] }));
  add('/api/points', 'post', op({
    tag: '點數', status: 201, summary: '新增點數', description: '可用 multipart/form-data 一併上傳圖片；初始餘額會建立一筆「直接設定」紀錄。',
    body: pointFormBody, multipart: true, bodyExample: { name: '全聯福利點', issuer: '全聯', currentBalance: 1230, valuePerPoint: 1 },
    response: ref('Point'), example: EX.point, errors: [[400, 'NAME_REQUIRED', '沒有名稱'], [413, 'LIMIT_FILE_SIZE', '圖片超過 4MB']]
  }));
  add('/api/points/{id}', 'get', op({ tag: '點數', summary: '取得單一點數', params: [ptIdParam], response: ref('Point'), example: EX.point, errors: [ptNotFound] }));
  add('/api/points/{id}', 'put', op({
    tag: '點數', summary: '修改點數資料', description: '只改名稱/單位/價值/圖片；餘額請透過歷史紀錄調整。', params: [ptIdParam],
    body: pointFormBody, multipart: true, bodyExample: { valuePerPoint: 0.5 }, response: ref('Point'), example: EX.point, errors: [ptNotFound]
  }));
  add('/api/points/{id}', 'delete', op({ tag: '點數', summary: '刪除點數', description: '連同所有歷史紀錄與到期提醒。', params: [ptIdParam], errors: [ptNotFound] }));
  add('/api/points/{id}/histories', 'get', op({
    tag: '點數', summary: '時間軸與月統計', params: [ptIdParam],
    response: obj({ point: ref('Point'), histories: arr(ref('PointHistory')), stats: arr(obj({ period: str('YYYY-MM'), earned: num('獲得（earn）'), spent: num('使用（spend）'), net: num('淨變動（含 set 校正）') })) }),
    example: { point: EX.point, histories: [EX.history], stats: [{ period: '2026-11', earned: 120, spent: 0, net: 120 }] }, errors: [ptNotFound]
  }));
  add('/api/points/{id}/histories', 'post', op({
    tag: '點數', status: 201, summary: '新增點數紀錄', description: 'set=宣告當下餘額（之後插入更早的紀錄也不會改變這個值）；earn/spend=增減。新增後整條時間軸自動重算。',
    params: [ptIdParam], body: historyBody, bodyExample: { changeType: 'earn', amount: 120, occurredAt: '2026-11-15T13:00:00+08:00', note: '購物累積' },
    response: obj({ ok: bool('true'), history: ref('PointHistory'), currentBalance: num('重算後餘額') }), example: { ok: true, history: EX.history, currentBalance: 1350 },
    errors: [ptNotFound, [400, 'INVALID_CHANGE_TYPE', 'changeType 錯誤'], [400, 'INVALID_AMOUNT', '數量錯誤']]
  }));
  const hidParam = pathParam('hid', '紀錄 ID');
  add('/api/points/{id}/histories/{hid}', 'put', op({
    tag: '點數', summary: '修改點數紀錄（部分更新）', params: [ptIdParam, hidParam], body: historyBody, bodyExample: { amount: 150 },
    response: obj({ ok: bool('true'), history: ref('PointHistory'), currentBalance: num('重算後餘額') }), example: { ok: true, history: EX.history, currentBalance: 1380 },
    errors: [ptNotFound, [404, 'HISTORY_NOT_FOUND', '找不到此紀錄']]
  }));
  add('/api/points/{id}/histories/{hid}', 'delete', op({
    tag: '點數', summary: '刪除點數紀錄', params: [ptIdParam, hidParam], response: obj({ ok: bool('true'), currentBalance: num('重算後餘額') }),
    example: { ok: true, currentBalance: 1230 }, errors: [ptNotFound, [404, 'HISTORY_NOT_FOUND', '找不到此紀錄']]
  }));
  const expiryBody = obj({ amount: num('到期數量'), expiryDate: date('到期日'), status: str('active / dismissed（僅修改時）', { enum: ['active', 'dismissed'] }), note: nullable(str('備註')) });
  add('/api/points/{id}/expiries', 'get', op({ tag: '點數', summary: '列出到期提醒', params: [ptIdParam], response: arr(ref('PointExpiry')), example: [EX.expiry], errors: [ptNotFound] }));
  add('/api/points/{id}/expiries', 'post', op({
    tag: '點數', status: 201, summary: '新增到期提醒', description: '每天 21:00 推播會提醒 7 天內到期的點數。', params: [ptIdParam],
    body: expiryBody, bodyExample: { amount: 215, expiryDate: '2026-12-31' }, response: ref('PointExpiry'), example: EX.expiry,
    errors: [ptNotFound, [400, 'AMOUNT_AND_DATE_REQUIRED', '缺少數量或日期']]
  }));
  const eidParam = pathParam('eid', '到期提醒 ID');
  add('/api/points/{id}/expiries/{eid}', 'put', op({
    tag: '點數', summary: '修改到期提醒 / 標記已使用', params: [ptIdParam, eidParam], body: expiryBody, bodyExample: { status: 'dismissed' },
    response: ref('PointExpiry'), example: { ...EX.expiry, status: 'dismissed' }, errors: [ptNotFound, [404, 'EXPIRY_NOT_FOUND', '找不到此提醒'], [400, 'INVALID_STATUS', 'status 錯誤']]
  }));
  add('/api/points/{id}/expiries/{eid}', 'delete', op({ tag: '點數', summary: '刪除到期提醒', params: [ptIdParam, eidParam], errors: [ptNotFound, [404, 'EXPIRY_NOT_FOUND', '找不到此提醒']] }));
  add('/api/expiries/alerts', 'get', op({
    tag: '點數', summary: '所有啟用中的到期提醒', description: '跨點數列出，含所屬點數資訊與剩餘天數。',
    response: arr({ allOf: [ref('PointExpiry'), obj({ point: obj({ id: int('ID'), name: str('名稱'), issuer: nullable(str('發行')), imageUrl: nullable(str('圖片')), color: nullable(str('顏色')), currentBalance: str('餘額') }) })] }),
    example: [{ ...EX.expiry, point: { id: 4, name: '全聯福利點', issuer: '全聯', imageUrl: null, color: null, currentBalance: '1350.00' } }]
  }));

  // ── Cards & payment methods ──
  const cardIdParam = pathParam('id', '卡片 ID');
  add('/api/tags/cards', 'get', op({ tag: '卡片與支付方式', summary: '列出卡片', description: '不含完整卡號（需另呼叫 /pan）。', response: arr(ref('Card')), example: [EX.card] }));
  add('/api/tags/cards', 'post', op({
    tag: '卡片與支付方式', status: 201, summary: '新增卡片', description: '可用 multipart/form-data 上傳卡面。', body: cardFormBody, multipart: true,
    bodyExample: { name: '玉山 Pi 卡', kind: 'credit', issuer: '玉山銀行', network: 'jcb', pan: '3560 1234 5678 1234', aliases: 'Pi卡' },
    response: ref('Card'), example: EX.card, errors: [[400, 'NAME_REQUIRED', '沒有名稱'], [400, 'INVALID_PAN', '卡號長度錯誤'], [409, 'DUPLICATE_NAME', '名稱重複']]
  }));
  add('/api/tags/cards/{id}', 'put', op({
    tag: '卡片與支付方式', summary: '修改卡片', params: [cardIdParam], body: cardFormBody, multipart: true, bodyExample: { aliases: 'Pi卡\n玉山Pi拍錢包信用卡' },
    response: ref('Card'), example: EX.card, errors: [[404, 'NOT_FOUND', '找不到此卡片'], [400, 'INVALID_PAN', '卡號長度錯誤'], [409, 'DUPLICATE_NAME', '名稱重複']]
  }));
  add('/api/tags/cards/{id}', 'delete', op({
    tag: '卡片與支付方式', summary: '刪除卡片', description: '⚠️ 會一併刪除此卡的所有交易紀錄，並從活動綁定中移除。', params: [cardIdParam], errors: [[404, 'NOT_FOUND', '找不到此卡片']]
  }));
  add('/api/tags/cards/{id}/pan', 'get', op({
    tag: '卡片與支付方式', summary: '取得完整卡號（解密）', description: '供「複製卡號」使用，不會出現在一般列表。', params: [cardIdParam],
    response: obj({ pan: str('完整卡號數字') }), example: { pan: '3560123456781234' },
    errors: [[404, 'NOT_FOUND', '找不到此卡片'], [404, 'NO_PAN_STORED', '尚未儲存完整卡號']]
  }));
  const pmIdParam = pathParam('id', '支付方式 ID');
  add('/api/tags/payment-methods', 'get', op({ tag: '卡片與支付方式', summary: '列出支付方式', response: arr(ref('PaymentMethod')), example: [EX.pm] }));
  add('/api/tags/payment-methods', 'post', op({
    tag: '卡片與支付方式', status: 201, summary: '新增支付方式', body: pmFormBody, multipart: true, bodyExample: { name: 'LINE Pay', aliases: 'LINEPAY' },
    response: ref('PaymentMethod'), example: EX.pm, errors: [[400, 'NAME_REQUIRED', '沒有名稱'], [409, 'DUPLICATE_NAME', '名稱重複']]
  }));
  add('/api/tags/payment-methods/{id}', 'put', op({
    tag: '卡片與支付方式', summary: '修改支付方式', params: [pmIdParam], body: pmFormBody, multipart: true, bodyExample: { name: 'LINE Pay Money' },
    response: ref('PaymentMethod'), example: EX.pm, errors: [[404, 'NOT_FOUND', '找不到此支付方式'], [409, 'DUPLICATE_NAME', '名稱重複']]
  }));
  add('/api/tags/payment-methods/{id}', 'delete', op({
    tag: '卡片與支付方式', summary: '刪除支付方式', description: '使用此支付方式的交易會改為「未使用電子支付」。', params: [pmIdParam], errors: [[404, 'NOT_FOUND', '找不到此支付方式']]
  }));

  // ── AI ──
  const aiErrors = [[503, 'GEMINI_NOT_CONFIGURED', '尚未設定 Gemini 金鑰'], [502, 'AI_PARSE_FAILED', 'AI 回傳非 JSON']];
  add('/api/ai/models', 'get', op({
    tag: 'AI', summary: '可用的 Gemini 模型', description: '依目前金鑰向 Google 查詢（快取 1 小時）；失敗時回傳保底清單並標記 fallback。',
    response: obj({ models: arr(obj({ name: str('模型 ID'), displayName: str('顯示名稱'), description: str('說明') })), default: str('預設模型'), fallback: bool('是否為保底清單'), cached: bool('是否命中快取') }),
    example: { models: [{ name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', description: '新世代均衡' }], default: 'gemini-3.5-flash' }
  }));
  add('/api/ai/parse-event', 'post', op({
    tag: 'AI', summary: 'AI 解析活動原文', description: '貼上銀行活動說明，回傳可直接帶入新增表單的欄位（cardNames / paymentMethodNames 為文字，前端再比對成 ID）。',
    body: obj({ text: str('活動原文（最多 8000 字）'), model: str('（選填）模型 ID') }, ['text']),
    bodyExample: { text: '玉山 Pi 卡 10/1-12/31 綁定 LINE Pay 單筆滿 200 享 5% 回饋，每月上限 300 元，需登錄' },
    response: obj({}, null, 'EventInput 欄位 + cardNames[] + paymentMethodNames[]'),
    example: { title: '玉山 Pi 卡 LINE Pay 5%', startDate: '2026-10-01', endDate: '2026-12-31', cashbackPercent: 5, maxReward: 300, minimumSpend: 200, cycleType: 'monthly', cycleAnchorDay: 1, cardNames: ['玉山 Pi 卡'], paymentMethodNames: ['LINE Pay'], requiresRegistration: true },
    errors: [[400, 'TEXT_REQUIRED', '沒有文字'], [413, 'TEXT_TOO_LONG', '超過 8000 字'], ...aiErrors]
  }));
  add('/api/ai/parse-merchants', 'post', op({
    tag: 'AI', summary: 'AI 整理商家關鍵字', description: '把商家清單或活動說明整理成精簡關鍵字陣列（商家限定 / 排除商家使用）。',
    body: obj({ text: str('文字（最多 4000 字）'), model: str('（選填）模型 ID') }, ['text']), bodyExample: { text: '適用：全家便利商店（信義店）、7-ELEVEN、萊爾富' },
    response: obj({ keywords: arr(str('關鍵字')) }), example: { keywords: ['全家', '7-ELEVEN', '萊爾富'] },
    errors: [[400, 'TEXT_REQUIRED', '沒有文字'], [413, 'TEXT_TOO_LONG', '超過 4000 字'], ...aiErrors]
  }));
  add('/api/ai/search-rewards', 'post', op({
    tag: 'AI', summary: 'AI 回饋搜尋', description: '用自然語言問「哪張卡最適合 OO」，AI 依已記錄的進行中活動推薦（結果快取 30 分鐘）。精確金額試算請改用「刷哪張」API。',
    body: obj({ query: str('查詢（最多 100 字）'), web: bool('允許聯網補充（較慢）'), model: str('（選填）模型 ID') }, ['query']), bodyExample: { query: '外送', web: false },
    response: obj({ summary: str('摘要'), noData: bool('沒有相關方案'), recommendations: arr(obj({ title: str('方案'), rewardText: str('回饋'), reason: str('原因'), eventIds: arr(int('活動 ID')), cautions: arr(str('注意事項')), checkUrl: nullable(str('確認網址')) })), refs: arr(obj({ id: int('活動 ID'), title: str('名稱'), sourceUrl: nullable(str('網址')) })), cached: bool('命中快取') }),
    example: { summary: '外送推薦 CUBE 卡', noData: false, recommendations: [{ title: 'CUBE + LINE Pay', rewardText: '3%', reason: '…', eventIds: [7], cautions: ['每月上限 500'], checkUrl: null }], refs: [{ id: 7, title: 'CUBE LINE Pay 3%', sourceUrl: null }], cached: false },
    errors: [[400, 'QUERY_REQUIRED', '沒有查詢'], [413, 'QUERY_TOO_LONG', '超過 100 字'], [503, 'GEMINI_NOT_CONFIGURED', '尚未設定 Gemini 金鑰'], [502, 'AI_SEARCH_FAILED', 'AI 回傳非 JSON']]
  }));
  const aiKeyId = pathParam('id', 'AI 金鑰 ID');
  add('/api/ai/keys', 'get', op({ tag: 'AI', summary: '列出 Gemini 金鑰', response: arr(ref('AiKey')), example: [{ id: 1, name: '個人 Gemini', keyMask: 'AIza…k9Qw', isActive: true, createdAt: '2026-10-01T00:00:00.000Z' }] }));
  add('/api/ai/keys', 'post', op({
    tag: 'AI', status: 201, summary: '新增 Gemini 金鑰', description: '以 AES-256-GCM 加密儲存。第一把或 makeActive=true 時設為使用中。',
    body: obj({ name: str('名稱'), key: str('Gemini API Key'), makeActive: bool('設為使用中') }, ['name', 'key']), bodyExample: { name: '個人 Gemini', key: 'AIza...', makeActive: true },
    response: ref('AiKey'), example: { id: 1, name: '個人 Gemini', keyMask: 'AIza…k9Qw', isActive: true, createdAt: '2026-11-15T00:00:00.000Z' },
    errors: [[400, 'NAME_REQUIRED', '沒有名稱'], [400, 'KEY_REQUIRED', '沒有金鑰']]
  }));
  add('/api/ai/keys/{id}', 'put', op({
    tag: 'AI', summary: '改名 / 設為使用中', params: [aiKeyId], body: obj({ name: str('新名稱'), isActive: bool('true=設為使用中') }), bodyExample: { isActive: true },
    response: ref('AiKey'), example: { id: 1, name: '個人 Gemini', keyMask: 'AIza…k9Qw', isActive: true, createdAt: '2026-11-15T00:00:00.000Z' }, errors: [[404, 'NOT_FOUND', '找不到此金鑰']]
  }));
  add('/api/ai/keys/{id}', 'delete', op({ tag: 'AI', summary: '刪除 Gemini 金鑰', description: '刪掉使用中的金鑰時，自動改用下一把。', params: [aiKeyId], errors: [[404, 'NOT_FOUND', '找不到此金鑰']] }));

  // ── Push ──
  add('/api/fcm/token', 'post', op({
    tag: '推播', summary: '註冊裝置推播 Token', description: '前端取得 FCM token 後呼叫；同一 token 重送會更新擁有者與裝置資訊。',
    body: obj({ token: str('FCM registration token'), deviceInfo: str('裝置描述') }, ['token']), bodyExample: { token: 'fcm-token…', deviceInfo: 'iPhone Safari' },
    response: obj({ ok: bool('true'), created: bool('是否為新 token') }), example: { ok: true, created: true }, errors: [[400, 'TOKEN_REQUIRED', '沒有 token']]
  }));
  add('/api/fcm/token', 'delete', op({
    tag: '推播', summary: '移除裝置推播 Token', body: obj({ token: str('FCM registration token') }, ['token']), bodyExample: { token: 'fcm-token…' }, errors: [[400, 'TOKEN_REQUIRED', '沒有 token']]
  }));

  return P;
}

const TAGS = [
  { name: '外部串接：回報交易', description: '給記帳系統 / 自動化工具寫入交易，使用 API 金鑰認證。' },
  { name: '外部串接：查詢', description: '給捷徑、試算表、自建工具讀取資料，使用 API 金鑰認證。' },
  { name: '首頁', description: 'App 首頁總覽（Session）。' },
  { name: '回饋活動', description: '活動的新增、修改、複製、登錄與刷卡建議（Session）。' },
  { name: '回饋核對', description: '應得回饋 vs 實際入帳（Session）。' },
  { name: '交易紀錄', description: '交易的查詢、手動新增與統計（Session）。' },
  { name: 'API 金鑰', description: '管理外部串接用的 API 金鑰（Session）。' },
  { name: '點數', description: '點數餘額時間軸與到期提醒（Session）。' },
  { name: '卡片與支付方式', description: '活動與交易綁定的卡片 / 支付方式（Session）。' },
  { name: 'AI', description: 'Gemini 解析與搜尋（Session）。' },
  { name: '推播', description: 'FCM 裝置註冊（Session）。' },
  { name: '登入', description: 'Firebase 登入與 Session。' },
  { name: '系統', description: '健康檢查、PWA 與文件。' }
];

function buildSpec({ baseUrl = '' } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'MyCashback API',
      version: '2.0.0',
      description: [
        '信用卡回饋、交易紀錄與點數管理 API。所有日期計算以伺服器時區（APP_TIMEZONE，預設 Asia/Taipei）為準。',
        '',
        '## 認證',
        '- **API 金鑰**（外部串接）：在 App「設定 → API 金鑰」建立，呼叫時帶 `Authorization: Bearer <token>`（或 `X-API-Key: <token>`）。可用於 `/api/ingest/*` 與 `/api/external/*`。每把金鑰每分鐘最多 300 次請求。',
        '- **Session Cookie**（App 內部）：登入後瀏覽器自動帶 `session` Cookie。其餘 `/api/*` 都屬此類，外部程式請改用上面的 API 金鑰端點。',
        '',
        '## 錯誤格式',
        '所有錯誤皆為 `{ "error": "代碼", "message": "說明" }`，請以 `error` 代碼判斷。',
        '',
        '## 金額',
        '回饋以精確十進位計算（不會有浮點誤差），依活動設定的捨入方式與小數位數處理。'
      ].join('\n')
    },
    servers: [{ url: baseUrl || '/', description: '目前伺服器' }],
    tags: TAGS,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'App「設定 → API 金鑰」建立的金鑰（mcb_ 開頭）' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: '同一把 API 金鑰，放在 X-API-Key header' },
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'session', description: '登入後的 Session Cookie（僅瀏覽器）' }
      },
      schemas
    },
    paths: buildPaths()
  };
}

module.exports = { buildSpec };
