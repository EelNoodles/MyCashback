# MyCashback API（v2.0.0）

> 本文件由 `npm run docs:api` 依 `docs/openapi.js` 自動產生，請勿手動修改。App 內「設定 → API 串接文件」與 `GET /api/docs/openapi.json` 使用同一份來源。

信用卡回饋、交易紀錄與點數管理 API。所有日期計算以伺服器時區（APP_TIMEZONE，預設 Asia/Taipei）為準。

## 認證
- **API 金鑰**（外部串接）：在 App「設定 → API 金鑰」建立，呼叫時帶 `Authorization: Bearer <token>`（或 `X-API-Key: <token>`）。可用於 `/api/ingest/*` 與 `/api/external/*`。每把金鑰每分鐘最多 300 次請求。
- **Session Cookie**（App 內部）：登入後瀏覽器自動帶 `session` Cookie。其餘 `/api/*` 都屬此類，外部程式請改用上面的 API 金鑰端點。

## 錯誤格式
所有錯誤皆為 `{ "error": "代碼", "message": "說明" }`，請以 `error` 代碼判斷。

## 金額
回饋以精確十進位計算（不會有浮點誤差），依活動設定的捨入方式與小數位數處理。

## 目錄

- [外部串接：回報交易](#外部串接回報交易)（5）
- [外部串接：查詢](#外部串接查詢)（6）
- [首頁](#首頁)（1）
- [回饋活動](#回饋活動)（8）
- [回饋核對](#回饋核對)（5）
- [交易紀錄](#交易紀錄)（7）
- [API 金鑰](#api-金鑰)（4）
- [點數](#點數)（14）
- [卡片與支付方式](#卡片與支付方式)（9）
- [AI](#ai)（8）
- [推播](#推播)（2）
- [登入](#登入)（3）
- [系統](#系統)（5）

## 外部串接：回報交易

給記帳系統 / 自動化工具寫入交易，使用 API 金鑰認證。

### `POST /api/ingest/card-transactions` — 回報一筆刷卡交易

**認證**：API 金鑰

記帳系統每發生一筆交易就呼叫一次，系統會自動累計各回饋活動當期消費。

- **卡片對應**：cardName 完全相同 → 忽略大小寫/空白後比對名稱與「別名」 → cardLastFour 末四碼。
- **冪等**：帶 externalRef 時，重送同一筆會回 **200** 與原紀錄，不會重複建立；網路逾時可放心重試。
- **回應**會附上 matchedEvents（這筆會計入哪些活動）。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `cardName` | string | 卡片名稱；比對順序：完全相同 → 忽略大小寫/空白的名稱或別名 |
| `cardLastFour` | string | （選填）卡號末四碼；名稱對不到時改用末四碼比對 |
| `paymentMethodName` | string \| null | （選填）支付方式名稱或別名；沒用電子支付就省略或傳 null / "" |
| `amount` * | number | 金額，大於 0 |
| `transactionAt` | string | 交易時間，ISO 8601 建議帶時區；省略=現在 |
| `note` | string \| null | 商家 / 備註（最多 255 字） |
| `latitude` | number \| null | 緯度 -90~90，需與 longitude 一起提供 |
| `longitude` | number \| null | 經度 -180~180 |
| `externalRef` | string \| null | 記帳系統自己的交易 ID（最多 120 字）；重送同一筆不會重複建立，也可用來更新/刪除 |

```json
{
  "cardName": "玉山 Pi 卡",
  "paymentMethodName": "LINE Pay",
  "amount": 1280,
  "transactionAt": "2026-11-15T13:05:00+08:00",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831",
  "source": "api",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `CARD_NAME_REQUIRED` | 沒有 cardName 也沒有 cardLastFour |
| 400 | `AMOUNT_INVALID` | amount 不是大於 0 的數字 |
| 400 | `TRANSACTION_AT_INVALID` | transactionAt 無法解析 |
| 400 | `LOCATION_INCOMPLETE` | 只給了 latitude 或 longitude 其中一個 |
| 400 | `LOCATION_INVALID` | 經緯度超出範圍 |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 422 | `CARD_NOT_FOUND` | 對不到卡片（回應附 knownCards 清單） |
| 422 | `PAYMENT_METHOD_NOT_FOUND` | 對不到支付方式（回應附 knownPaymentMethods 清單） |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X POST 'https://你的網域/api/ingest/card-transactions' \
  -H 'Authorization: Bearer mcb_你的金鑰' \
  -H 'Content-Type: application/json' \
  -d '{"cardName":"玉山 Pi 卡","paymentMethodName":"LINE Pay","amount":1280,"transactionAt":"2026-11-15T13:05:00+08:00","note":"全聯 信義店","latitude":25.033,"longitude":121.5654,"externalRef":"ledger-8831"}'
```

### `POST /api/ingest/card-transactions/batch` — 批次回報交易（最多 200 筆）

**認證**：API 金鑰

一次回報多筆（例如補登歷史資料）。每筆獨立處理，單筆失敗不影響其他筆；用 results[].status 判斷每筆結果。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `transactions` * | IngestTransaction[] |  |

```json
{
  "transactions": [
    {
      "cardName": "玉山 Pi 卡",
      "amount": 1280,
      "transactionAt": "2026-11-15T13:05:00+08:00",
      "note": "全聯",
      "externalRef": "ledger-8831"
    },
    {
      "cardName": "不存在的卡",
      "amount": 50,
      "externalRef": "ledger-8832"
    }
  ]
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `created` | integer | 新增筆數 |
| `duplicates` | integer | externalRef 已存在而略過的筆數 |
| `errors` | integer | 失敗筆數 |
| `results` | object[] |  |

```json
{
  "created": 1,
  "duplicates": 0,
  "errors": 1,
  "results": [
    {
      "index": 0,
      "status": "created",
      "id": 501,
      "externalRef": "ledger-8831"
    },
    {
      "index": 1,
      "status": "error",
      "error": "CARD_NOT_FOUND",
      "message": "找不到名稱為「不存在的卡」的卡片…",
      "knownCards": [
        "玉山 Pi 卡"
      ]
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TRANSACTIONS_REQUIRED` | body 不是 { transactions: [...] } |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 413 | `BATCH_TOO_LARGE` | 超過 200 筆 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X POST 'https://你的網域/api/ingest/card-transactions/batch' \
  -H 'Authorization: Bearer mcb_你的金鑰' \
  -H 'Content-Type: application/json' \
  -d '{"transactions":[{"cardName":"玉山 Pi 卡","amount":1280,"transactionAt":"2026-11-15T13:05:00+08:00","note":"全聯","externalRef":"ledger-8831"},{"cardName":"不存在的卡","amount":50,"externalRef":"ledger-8832"}]}'
```

### `GET /api/ingest/card-transactions/{externalRef}` — 依 externalRef 查詢交易

**認證**：API 金鑰

確認某筆是否已回報成功。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `externalRef` * | path | string | 回報時帶的 externalRef（URL encode） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831",
  "source": "api",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 404 | `NOT_FOUND` | 查無此 externalRef |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/ingest/card-transactions/ledger-8831' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `PUT /api/ingest/card-transactions/{externalRef}` — 依 externalRef 更新交易

**認證**：API 金鑰

部分更新：只會修改 body 有帶的欄位（例如記帳系統修正了金額或商家）。欄位定義同回報 API。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `externalRef` * | path | string | 回報時帶的 externalRef（URL encode） |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `cardName` | string | 卡片名稱；比對順序：完全相同 → 忽略大小寫/空白的名稱或別名 |
| `cardLastFour` | string | （選填）卡號末四碼；名稱對不到時改用末四碼比對 |
| `paymentMethodName` | string \| null | （選填）支付方式名稱或別名；沒用電子支付就省略或傳 null / "" |
| `amount` * | number | 金額，大於 0 |
| `transactionAt` | string | 交易時間，ISO 8601 建議帶時區；省略=現在 |
| `note` | string \| null | 商家 / 備註（最多 255 字） |
| `latitude` | number \| null | 緯度 -90~90，需與 longitude 一起提供 |
| `longitude` | number \| null | 經度 -180~180 |
| `externalRef` | string \| null | 記帳系統自己的交易 ID（最多 120 字）；重送同一筆不會重複建立，也可用來更新/刪除 |

```json
{
  "amount": 1180,
  "note": "全聯 信義店（修正）"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831",
  "source": "api",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `AMOUNT_INVALID` | amount 不是大於 0 的數字 |
| 400 | `TRANSACTION_AT_INVALID` | transactionAt 無法解析 |
| 400 | `LOCATION_INCOMPLETE` | 只給了 latitude 或 longitude 其中一個 |
| 400 | `LOCATION_INVALID` | 經緯度超出範圍 |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 404 | `NOT_FOUND` | 查無此 externalRef |
| 422 | `CARD_NOT_FOUND` | 對不到卡片（回應附 knownCards 清單） |
| 422 | `PAYMENT_METHOD_NOT_FOUND` | 對不到支付方式（回應附 knownPaymentMethods 清單） |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X PUT 'https://你的網域/api/ingest/card-transactions/ledger-8831' \
  -H 'Authorization: Bearer mcb_你的金鑰' \
  -H 'Content-Type: application/json' \
  -d '{"amount":1180,"note":"全聯 信義店（修正）"}'
```

### `DELETE /api/ingest/card-transactions/{externalRef}` — 依 externalRef 刪除交易

**認證**：API 金鑰

交易被取消或全額退款時呼叫，該筆將不再計入任何活動。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `externalRef` * | path | string | 回報時帶的 externalRef（URL encode） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `id` | integer | 被刪除的交易 ID |
| `externalRef` | string | externalRef |

```json
{
  "ok": true,
  "id": 501,
  "externalRef": "ledger-8831"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 404 | `NOT_FOUND` | 查無此 externalRef |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/ingest/card-transactions/ledger-8831' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

## 外部串接：查詢

給捷徑、試算表、自建工具讀取資料，使用 API 金鑰認證。

### `GET /api/external/recommend` — 刷哪張最划算

**認證**：API 金鑰

輸入金額（與商家），依每個進行中活動「本期已刷金額、上限、門檻、商家限定/排除」計算這筆消費能多拿多少回饋，回傳排序後的卡片 × 支付方式組合。

額外提供 `best.text` 一行文字，方便 iOS 捷徑 / Android Tasker 直接朗讀或顯示。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `amount` * | query | number | 消費金額（必填） |
| `merchant` | query | string | 商家名稱，用來比對商家限定 / 排除商家（例如「全聯」「CAMA」） |
| `cardId` | query | integer | 只考慮這張卡 |
| `paymentMethodId` | query | string | 只考慮這個支付方式；none=直接刷卡 |
| `at` | query | datetime | 以這個時間點計算（ISO 8601，預設現在） |
| `limit` | query | integer | 最多回傳幾個組合（1-50，預設 10） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `amount` | number | 消費金額 |
| `merchant` | string | 商家 |
| `at` | datetime | 以哪個時間點計算 |
| `consideredEvents` | integer | 納入評估的進行中活動數 |
| `options` | object[] |  |
| `best` | object \| null |  |

```json
{
  "amount": 1000,
  "merchant": "全聯",
  "at": "2026-11-15T05:00:00.000Z",
  "consideredEvents": 6,
  "options": [
    {
      "cardId": 2,
      "card": {
        "id": 2,
        "name": "國泰 CUBE",
        "imageUrl": null,
        "color": null,
        "network": "visa"
      },
      "paymentMethodId": 3,
      "paymentMethod": {
        "id": 3,
        "name": "LINE Pay",
        "imageUrl": null
      },
      "totalReward": 30,
      "effectiveRate": 3,
      "contributions": [
        {
          "eventId": 7,
          "title": "CUBE LINE Pay 3%",
          "rewardType": "point",
          "reward": 30,
          "cashbackPercent": 3,
          "cashbackFixed": null,
          "capBefore": null,
          "capReachedAfter": null,
          "remainingRewardAfter": null,
          "thresholdMetAfter": true,
          "remainingToThresholdAfter": 0,
          "needsRegistration": false,
          "merchantKeyword": null
        }
      ],
      "missed": []
    },
    {
      "cardId": 1,
      "card": {
        "id": 1,
        "name": "玉山 Pi 卡",
        "imageUrl": null,
        "color": null,
        "network": "jcb"
      },
      "paymentMethodId": null,
      "paymentMethod": null,
      "totalReward": 5,
      "effectiveRate": 0.5,
      "contributions": [
        {
          "eventId": 12,
          "title": "玉山 5%",
          "rewardType": "cash",
          "reward": 5,
          "cashbackPercent": 5,
          "cashbackFixed": null,
          "capBefore": false,
          "capReachedAfter": true,
          "remainingRewardAfter": 0,
          "thresholdMetAfter": true,
          "remainingToThresholdAfter": 0,
          "needsRegistration": false,
          "merchantKeyword": null
        }
      ],
      "missed": [
        {
          "eventId": 15,
          "title": "全聯不回饋活動",
          "reason": "excludedMerchant",
          "keyword": "全聯",
          "minimumSpend": null
        }
      ]
    }
  ],
  "best": {
    "text": "國泰 CUBE + LINE Pay：約回饋 30（3%）",
    "cardName": "國泰 CUBE",
    "paymentMethodName": "LINE Pay",
    "totalReward": 30,
    "effectiveRate": 3
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `AMOUNT_REQUIRED` | 沒有帶 amount |
| 400 | `INVALID_AMOUNT` | amount 不合法 |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/recommend?amount=1000' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `GET /api/external/summary` — 總覽（同 App 首頁）

**認證**：API 金鑰

本月刷卡、本期應得 / 還可拿回饋、待辦提醒（待登錄、即將結束、點數到期…）。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `generatedAt` | datetime | 產生時間 |
| `today` | date | 伺服器時區的今天 |
| `month` | object |  |
| `rewards` | object |  |
| `events` | object |  |
| `points` | object |  |
| `attention` | object[] |  |
| `ongoingEvents` | object[] |  |

```json
{
  "generatedAt": "2026-11-15T05:00:00.000Z",
  "today": "2026-11-15",
  "month": {
    "key": "2026-11",
    "spend": 18320,
    "txnCount": 27,
    "lastMonthSpend": 25110
  },
  "rewards": {
    "estimatedThisCycle": 612,
    "estimatedPointsThisCycle": 120,
    "remainingThisCycle": 388,
    "receivedThisMonth": 280,
    "receivedThisYear": 4120
  },
  "events": {
    "ongoing": 8,
    "upcoming": 1,
    "capReached": 2,
    "needsRegistration": 1
  },
  "points": {
    "count": 3,
    "totalValue": 2150,
    "valuedCount": 2,
    "monthEarned": 160,
    "monthSpent": 0,
    "items": [
      {
        "id": 4,
        "name": "全聯福利點",
        "issuer": "全聯",
        "imageUrl": null,
        "color": "hsl(20,70%,55%)",
        "currentBalance": 1350,
        "valuePerPoint": 1,
        "value": 1350,
        "monthEarned": 120,
        "monthSpent": 0,
        "nextExpiry": {
          "amount": 215,
          "expiryDate": "2026-11-20",
          "daysLeft": 5
        }
      }
    ]
  },
  "attention": [
    {
      "type": "registration_needed",
      "severity": "high",
      "eventId": 14,
      "title": "台新 GoGo 雙11",
      "daysLeft": 16,
      "phase": "active"
    },
    {
      "type": "event_ending",
      "severity": "high",
      "eventId": 9,
      "title": "永豐 DAWHO 加碼",
      "daysLeft": 2,
      "remainingReward": 120,
      "remainingCapAmount": 2400
    },
    {
      "type": "point_expiring",
      "severity": "high",
      "pointId": 4,
      "expiryId": 9,
      "title": "全聯福利點",
      "amount": 215,
      "expiryDate": "2026-11-20",
      "daysLeft": 5
    }
  ],
  "ongoingEvents": []
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/summary' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `GET /api/external/cards` — 卡片與其回饋活動（含本期使用量）

**認證**：API 金鑰

每張卡附上綁定的活動、完整條件與本期使用量；圖片為絕對網址。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `status` | query | string | active=未結束（含即將開始，預設）、ongoing=進行中、upcoming=即將開始、expired=已結束、all=全部（active / ongoing / upcoming / expired / all） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `generatedAt` | datetime | 產生時間 |
| `cards` | object[] |  |

```json
{
  "generatedAt": "2026-11-15T05:00:00.000Z",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "kind": "credit",
      "issuer": "玉山銀行",
      "network": "jcb",
      "lastFour": "1234",
      "color": "hsl(210,70%,55%)",
      "imageUrl": null,
      "events": [
        {
          "id": 12,
          "userId": 1,
          "title": "玉山 Pi 卡 LINE Pay 5%",
          "description": null,
          "note": "需登錄，名額 10 萬名",
          "startDate": "2026-10-01",
          "endDate": "2026-12-31",
          "cashbackPercent": "5.000",
          "cashbackFixed": null,
          "rewardType": "cash",
          "maxReward": "300.00",
          "minimumSpend": "200.00",
          "minimumSpendScope": "perTransaction",
          "cycleType": "monthly",
          "cycleAnchorDay": 1,
          "matchUnspecifiedPayment": false,
          "requireMerchantMatch": false,
          "merchantKeywords": null,
          "excludeMerchantMatch": true,
          "excludeMerchantKeywords": "繳費\n儲值",
          "rewardRounding": "round",
          "rewardCalcMode": "aggregate",
          "rewardPrecision": 0,
          "requiresRegistration": true,
          "registeredAt": "2026-10-02",
          "sourceUrl": "https://example.com/promo",
          "cards": [
            {
              "id": 1,
              "name": "玉山 Pi 卡",
              "imageUrl": null,
              "color": "hsl(210,70%,55%)",
              "network": "jcb"
            }
          ],
          "paymentMethods": [
            {
              "id": 3,
              "name": "LINE Pay",
              "imageUrl": null
            }
          ],
          "needsRegistration": false,
          "timing": {
            "phase": "active",
            "daysUntilStart": 0,
            "daysLeft": 46,
            "progress": 49.5,
            "cycle": {
              "start": "2026-11-01",
              "end": "2026-11-30",
              "resetDate": "2026-12-01",
              "length": 30,
              "daysLeft": 16,
              "progress": 46.7,
              "endsWithEvent": false
            }
          },
          "usage": {
            "cycleStart": "2026-10-31T16:00:00.000Z",
            "cycleEnd": "2026-11-30T16:00:00.000Z",
            "rewardKind": "percent",
            "usedAmount": 5000,
            "txnCount": 3,
            "excludedCount": 1,
            "qualifyingCount": null,
            "estimatedReward": 250,
            "potentialReward": 250,
            "cap": 300,
            "capReached": false,
            "capUsedPercent": 83.33,
            "remainingReward": 50,
            "remainingCapAmount": 990,
            "remainingCapTransactions": null,
            "minimumSpend": 200,
            "minimumSpendScope": "perTransaction",
            "thresholdMet": true,
            "remainingToThreshold": 0,
            "effectiveRate": 5,
            "rewardRounding": "round",
            "rewardCalcMode": "aggregate",
            "rewardPrecision": 0,
            "txnRewards": null
          },
          "createdAt": "2026-10-01T02:00:00.000Z",
          "updatedAt": "2026-10-02T02:00:00.000Z"
        }
      ]
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/cards' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `GET /api/external/events` — 回饋活動列表（含本期使用量）

**認證**：API 金鑰

與 App 回饋頁相同的篩選條件。merchantKeywords / excludeMerchantKeywords 在此以字串陣列回傳。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `status` | query | string | active=未結束（含即將開始，預設）、ongoing=進行中、upcoming=即將開始、expired=已結束、all=全部（active / ongoing / upcoming / expired / all） |
| `q` | query | string | 關鍵字（標題、說明、備註、商家關鍵字、卡片 / 支付方式名稱，不分大小寫與空白） |
| `cardId` | query | integer | 只列綁定此卡的活動 |
| `paymentMethodId` | query | string | 只列綁定此支付方式的活動；none=適用直接刷卡的活動 |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `generatedAt` | datetime | 產生時間 |
| `events` | Event[] |  |

```json
{
  "generatedAt": "2026-11-15T05:00:00.000Z",
  "events": [
    {
      "id": 12,
      "userId": 1,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "description": null,
      "note": "需登錄，名額 10 萬名",
      "startDate": "2026-10-01",
      "endDate": "2026-12-31",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "minimumSpend": "200.00",
      "minimumSpendScope": "perTransaction",
      "cycleType": "monthly",
      "cycleAnchorDay": 1,
      "matchUnspecifiedPayment": false,
      "requireMerchantMatch": false,
      "merchantKeywords": [],
      "excludeMerchantMatch": true,
      "excludeMerchantKeywords": [
        "繳費",
        "儲值"
      ],
      "rewardRounding": "round",
      "rewardCalcMode": "aggregate",
      "rewardPrecision": 0,
      "requiresRegistration": true,
      "registeredAt": "2026-10-02",
      "sourceUrl": "https://example.com/promo",
      "cards": [
        {
          "id": 1,
          "name": "玉山 Pi 卡",
          "imageUrl": null,
          "color": "hsl(210,70%,55%)",
          "network": "jcb"
        }
      ],
      "paymentMethods": [
        {
          "id": 3,
          "name": "LINE Pay",
          "imageUrl": null
        }
      ],
      "needsRegistration": false,
      "timing": {
        "phase": "active",
        "daysUntilStart": 0,
        "daysLeft": 46,
        "progress": 49.5,
        "cycle": {
          "start": "2026-11-01",
          "end": "2026-11-30",
          "resetDate": "2026-12-01",
          "length": 30,
          "daysLeft": 16,
          "progress": 46.7,
          "endsWithEvent": false
        }
      },
      "usage": {
        "cycleStart": "2026-10-31T16:00:00.000Z",
        "cycleEnd": "2026-11-30T16:00:00.000Z",
        "rewardKind": "percent",
        "usedAmount": 5000,
        "txnCount": 3,
        "excludedCount": 1,
        "qualifyingCount": null,
        "estimatedReward": 250,
        "potentialReward": 250,
        "cap": 300,
        "capReached": false,
        "capUsedPercent": 83.33,
        "remainingReward": 50,
        "remainingCapAmount": 990,
        "remainingCapTransactions": null,
        "minimumSpend": 200,
        "minimumSpendScope": "perTransaction",
        "thresholdMet": true,
        "remainingToThreshold": 0,
        "effectiveRate": 5,
        "rewardRounding": "round",
        "rewardCalcMode": "aggregate",
        "rewardPrecision": 0,
        "txnRewards": null
      },
      "createdAt": "2026-10-01T02:00:00.000Z",
      "updatedAt": "2026-10-02T02:00:00.000Z"
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/events' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `GET /api/external/transactions` — 交易紀錄

**認證**：API 金鑰

分頁列出交易（預設每頁 50，最多 500）。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `q` | query | string | 關鍵字（比對備註、卡片名稱、支付方式名稱） |
| `cardId` | query | integer | 卡片 ID |
| `paymentMethodId` | query | string | 支付方式 ID；none=未使用電子支付 |
| `from` | query | datetime | 交易時間起（ISO 8601，含） |
| `to` | query | datetime | 交易時間迄（ISO 8601，含） |
| `minAmount` | query | number | 金額下限 |
| `maxAmount` | query | number | 金額上限 |
| `source` | query | string | 來源（api / manual） |
| `page` | query | integer | 頁碼 |
| `pageSize` | query | integer | 每頁筆數（最多 500） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `items` | Transaction[] |  |
| `total` | integer | 總筆數 |
| `page` | integer | 頁碼 |
| `pageSize` | integer | 每頁筆數 |

```json
{
  "items": [
    {
      "id": 501,
      "cardId": 1,
      "card": {
        "id": 1,
        "name": "玉山 Pi 卡",
        "imageUrl": null,
        "network": "jcb",
        "color": "hsl(210,70%,55%)",
        "lastFour": "1234"
      },
      "paymentMethodId": 3,
      "paymentMethod": {
        "id": 3,
        "name": "LINE Pay",
        "imageUrl": null
      },
      "amount": "1280.00",
      "transactionAt": "2026-11-15T05:05:00.000Z",
      "note": "全聯 信義店",
      "latitude": 25.033,
      "longitude": 121.5654,
      "externalRef": "ledger-8831",
      "source": "api",
      "rawCardName": "玉山 Pi 卡",
      "rawPaymentMethodName": "LINE Pay",
      "matchedEvents": [
        {
          "id": 12,
          "title": "玉山 Pi 卡 LINE Pay 5%",
          "cashbackPercent": "5.000",
          "cashbackFixed": null,
          "rewardType": "cash",
          "maxReward": "300.00",
          "estimatedReward": 64,
          "matchedKeyword": null
        }
      ],
      "createdAt": "2026-11-15T05:05:01.000Z",
      "updatedAt": "2026-11-15T05:05:01.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/transactions' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

### `GET /api/external/points` — 點數餘額與到期

**認證**：API 金鑰

各點數餘額、換算價值與尚未到期的到期提醒。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `generatedAt` | datetime | 產生時間 |
| `points` | object[] |  |

```json
{
  "generatedAt": "2026-11-15T05:00:00.000Z",
  "points": [
    {
      "id": 4,
      "name": "全聯福利點",
      "issuer": "全聯",
      "currentBalance": 1350,
      "valuePerPoint": 1,
      "value": 1350,
      "imageUrl": null,
      "expiries": [
        {
          "amount": 215,
          "expiryDate": "2026-12-31",
          "note": null
        }
      ]
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有帶 API 金鑰 |
| 401 | `INVALID_API_KEY` | 金鑰錯誤或已停用 |
| 429 | `RATE_LIMITED` | 超過每分鐘請求上限（預設 300 次，見 Retry-After） |

**範例**

```bash
curl -X GET 'https://你的網域/api/external/points' \
  -H 'Authorization: Bearer mcb_你的金鑰'
```

## 首頁

App 首頁總覽（Session）。

### `GET /api/dashboard/summary` — 首頁總覽

**認證**：登入 Session

App 首頁一次取得所有統計與提醒（取代逐一抓取各點數歷史）。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `generatedAt` | datetime | 產生時間 |
| `today` | date | 伺服器時區的今天 |
| `month` | object |  |
| `rewards` | object |  |
| `events` | object |  |
| `points` | object |  |
| `attention` | object[] |  |
| `ongoingEvents` | object[] |  |

```json
{
  "generatedAt": "2026-11-15T05:00:00.000Z",
  "today": "2026-11-15",
  "month": {
    "key": "2026-11",
    "spend": 18320,
    "txnCount": 27,
    "lastMonthSpend": 25110
  },
  "rewards": {
    "estimatedThisCycle": 612,
    "estimatedPointsThisCycle": 120,
    "remainingThisCycle": 388,
    "receivedThisMonth": 280,
    "receivedThisYear": 4120
  },
  "events": {
    "ongoing": 8,
    "upcoming": 1,
    "capReached": 2,
    "needsRegistration": 1
  },
  "points": {
    "count": 3,
    "totalValue": 2150,
    "valuedCount": 2,
    "monthEarned": 160,
    "monthSpent": 0,
    "items": [
      {
        "id": 4,
        "name": "全聯福利點",
        "issuer": "全聯",
        "imageUrl": null,
        "color": "hsl(20,70%,55%)",
        "currentBalance": 1350,
        "valuePerPoint": 1,
        "value": 1350,
        "monthEarned": 120,
        "monthSpent": 0,
        "nextExpiry": {
          "amount": 215,
          "expiryDate": "2026-11-20",
          "daysLeft": 5
        }
      }
    ]
  },
  "attention": [
    {
      "type": "registration_needed",
      "severity": "high",
      "eventId": 14,
      "title": "台新 GoGo 雙11",
      "daysLeft": 16,
      "phase": "active"
    },
    {
      "type": "event_ending",
      "severity": "high",
      "eventId": 9,
      "title": "永豐 DAWHO 加碼",
      "daysLeft": 2,
      "remainingReward": 120,
      "remainingCapAmount": 2400
    },
    {
      "type": "point_expiring",
      "severity": "high",
      "pointId": 4,
      "expiryId": 9,
      "title": "全聯福利點",
      "amount": 215,
      "expiryDate": "2026-11-20",
      "daysLeft": 5
    }
  ],
  "ongoingEvents": []
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/dashboard/summary' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 回饋活動

活動的新增、修改、複製、登錄與刷卡建議（Session）。

### `GET /api/cashback` — 列出回饋活動

**認證**：登入 Session

每筆附 timing（剩餘天數、本期區間）與 usage（本期已刷、應得回饋、距上限）。預設依結束日排序（沒有結束日的排最後）。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `status` | query | string | active=未結束（含即將開始，預設）、ongoing=進行中、upcoming=即將開始、expired=已結束、all=全部（active / ongoing / upcoming / expired / all） |
| `q` | query | string | 關鍵字（標題、說明、備註、商家關鍵字、卡片 / 支付方式名稱，不分大小寫與空白） |
| `cardId` | query | integer | 只列綁定此卡的活動 |
| `paymentMethodId` | query | string | 只列綁定此支付方式的活動；none=適用直接刷卡的活動 |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
[
  {
    "id": 12,
    "userId": 1,
    "title": "玉山 Pi 卡 LINE Pay 5%",
    "description": null,
    "note": "需登錄，名額 10 萬名",
    "startDate": "2026-10-01",
    "endDate": "2026-12-31",
    "cashbackPercent": "5.000",
    "cashbackFixed": null,
    "rewardType": "cash",
    "maxReward": "300.00",
    "minimumSpend": "200.00",
    "minimumSpendScope": "perTransaction",
    "cycleType": "monthly",
    "cycleAnchorDay": 1,
    "matchUnspecifiedPayment": false,
    "requireMerchantMatch": false,
    "merchantKeywords": null,
    "excludeMerchantMatch": true,
    "excludeMerchantKeywords": "繳費\n儲值",
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "requiresRegistration": true,
    "registeredAt": "2026-10-02",
    "sourceUrl": "https://example.com/promo",
    "cards": [
      {
        "id": 1,
        "name": "玉山 Pi 卡",
        "imageUrl": null,
        "color": "hsl(210,70%,55%)",
        "network": "jcb"
      }
    ],
    "paymentMethods": [
      {
        "id": 3,
        "name": "LINE Pay",
        "imageUrl": null
      }
    ],
    "needsRegistration": false,
    "timing": {
      "phase": "active",
      "daysUntilStart": 0,
      "daysLeft": 46,
      "progress": 49.5,
      "cycle": {
        "start": "2026-11-01",
        "end": "2026-11-30",
        "resetDate": "2026-12-01",
        "length": 30,
        "daysLeft": 16,
        "progress": 46.7,
        "endsWithEvent": false
      }
    },
    "usage": {
      "cycleStart": "2026-10-31T16:00:00.000Z",
      "cycleEnd": "2026-11-30T16:00:00.000Z",
      "rewardKind": "percent",
      "usedAmount": 5000,
      "txnCount": 3,
      "excludedCount": 1,
      "qualifyingCount": null,
      "estimatedReward": 250,
      "potentialReward": 250,
      "cap": 300,
      "capReached": false,
      "capUsedPercent": 83.33,
      "remainingReward": 50,
      "remainingCapAmount": 990,
      "remainingCapTransactions": null,
      "minimumSpend": 200,
      "minimumSpendScope": "perTransaction",
      "thresholdMet": true,
      "remainingToThreshold": 0,
      "effectiveRate": 5,
      "rewardRounding": "round",
      "rewardCalcMode": "aggregate",
      "rewardPrecision": 0,
      "txnRewards": null
    },
    "createdAt": "2026-10-01T02:00:00.000Z",
    "updatedAt": "2026-10-02T02:00:00.000Z"
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/cashback' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/cashback` — 新增回饋活動

**認證**：登入 Session

只有 title 必填，其餘欄位見 EventInput。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` * | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |

```json
{
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": 5,
  "maxReward": 300,
  "minimumSpend": 200,
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "cardIds": [
    1
  ],
  "paymentMethodIds": [
    3
  ],
  "requiresRegistration": true,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 12,
  "userId": 1,
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "description": null,
  "note": "需登錄，名額 10 萬名",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": "5.000",
  "cashbackFixed": null,
  "rewardType": "cash",
  "maxReward": "300.00",
  "minimumSpend": "200.00",
  "minimumSpendScope": "perTransaction",
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "matchUnspecifiedPayment": false,
  "requireMerchantMatch": false,
  "merchantKeywords": null,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值",
  "rewardRounding": "round",
  "rewardCalcMode": "aggregate",
  "rewardPrecision": 0,
  "requiresRegistration": true,
  "registeredAt": "2026-10-02",
  "sourceUrl": "https://example.com/promo",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "color": "hsl(210,70%,55%)",
      "network": "jcb"
    }
  ],
  "paymentMethods": [
    {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    }
  ],
  "needsRegistration": false,
  "timing": {
    "phase": "active",
    "daysUntilStart": 0,
    "daysLeft": 46,
    "progress": 49.5,
    "cycle": {
      "start": "2026-11-01",
      "end": "2026-11-30",
      "resetDate": "2026-12-01",
      "length": 30,
      "daysLeft": 16,
      "progress": 46.7,
      "endsWithEvent": false
    }
  },
  "usage": {
    "cycleStart": "2026-10-31T16:00:00.000Z",
    "cycleEnd": "2026-11-30T16:00:00.000Z",
    "rewardKind": "percent",
    "usedAmount": 5000,
    "txnCount": 3,
    "excludedCount": 1,
    "qualifyingCount": null,
    "estimatedReward": 250,
    "potentialReward": 250,
    "cap": 300,
    "capReached": false,
    "capUsedPercent": 83.33,
    "remainingReward": 50,
    "remainingCapAmount": 990,
    "remainingCapTransactions": null,
    "minimumSpend": 200,
    "minimumSpendScope": "perTransaction",
    "thresholdMet": true,
    "remainingToThreshold": 0,
    "effectiveRate": 5,
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "txnRewards": null
  },
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TITLE_REQUIRED` | 沒有活動名稱 |
| 400 | `DATE_RANGE_INVALID` | 結束日早於開始日 |
| 400 | `INVALID_CASHBACK_PERCENT` | 回饋 % 不在 0-100 |
| 400 | `INVALID_START_DATE` | 日期格式錯誤 |
| 400 | `INVALID_CYCLE_ANCHOR_DAY` | 重置日超出範圍 |
| 400 | `INVALID_SOURCE_URL` | 網址不是 http/https |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X POST 'https://你的網域/api/cashback' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"title":"玉山 Pi 卡 LINE Pay 5%","startDate":"2026-10-01","endDate":"2026-12-31","cashbackPercent":5,"maxReward":300,"minimumSpend":200,"cycleType":"monthly","cycleAnchorDay":1,"cardIds":[1],"paymentMethodIds":[3],"requiresRegistration":true,"excludeMerchantMatch":true,"excludeMerchantKeywords":"繳費\n儲值"}'
```

### `GET /api/cashback/{id}` — 取得單一活動

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 12,
  "userId": 1,
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "description": null,
  "note": "需登錄，名額 10 萬名",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": "5.000",
  "cashbackFixed": null,
  "rewardType": "cash",
  "maxReward": "300.00",
  "minimumSpend": "200.00",
  "minimumSpendScope": "perTransaction",
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "matchUnspecifiedPayment": false,
  "requireMerchantMatch": false,
  "merchantKeywords": null,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值",
  "rewardRounding": "round",
  "rewardCalcMode": "aggregate",
  "rewardPrecision": 0,
  "requiresRegistration": true,
  "registeredAt": "2026-10-02",
  "sourceUrl": "https://example.com/promo",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "color": "hsl(210,70%,55%)",
      "network": "jcb"
    }
  ],
  "paymentMethods": [
    {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    }
  ],
  "needsRegistration": false,
  "timing": {
    "phase": "active",
    "daysUntilStart": 0,
    "daysLeft": 46,
    "progress": 49.5,
    "cycle": {
      "start": "2026-11-01",
      "end": "2026-11-30",
      "resetDate": "2026-12-01",
      "length": 30,
      "daysLeft": 16,
      "progress": 46.7,
      "endsWithEvent": false
    }
  },
  "usage": {
    "cycleStart": "2026-10-31T16:00:00.000Z",
    "cycleEnd": "2026-11-30T16:00:00.000Z",
    "rewardKind": "percent",
    "usedAmount": 5000,
    "txnCount": 3,
    "excludedCount": 1,
    "qualifyingCount": null,
    "estimatedReward": 250,
    "potentialReward": 250,
    "cap": 300,
    "capReached": false,
    "capUsedPercent": 83.33,
    "remainingReward": 50,
    "remainingCapAmount": 990,
    "remainingCapTransactions": null,
    "minimumSpend": 200,
    "minimumSpendScope": "perTransaction",
    "thresholdMet": true,
    "remainingToThreshold": 0,
    "effectiveRate": 5,
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "txnRewards": null
  },
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X GET 'https://你的網域/api/cashback/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `PUT /api/cashback/{id}` — 更新活動（部分更新）

**認證**：登入 Session

只更新 body 有帶的欄位；cardIds / paymentMethodIds 有帶時整組取代。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` * | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |

```json
{
  "maxReward": 500,
  "endDate": "2027-01-31"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 12,
  "userId": 1,
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "description": null,
  "note": "需登錄，名額 10 萬名",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": "5.000",
  "cashbackFixed": null,
  "rewardType": "cash",
  "maxReward": "300.00",
  "minimumSpend": "200.00",
  "minimumSpendScope": "perTransaction",
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "matchUnspecifiedPayment": false,
  "requireMerchantMatch": false,
  "merchantKeywords": null,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值",
  "rewardRounding": "round",
  "rewardCalcMode": "aggregate",
  "rewardPrecision": 0,
  "requiresRegistration": true,
  "registeredAt": "2026-10-02",
  "sourceUrl": "https://example.com/promo",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "color": "hsl(210,70%,55%)",
      "network": "jcb"
    }
  ],
  "paymentMethods": [
    {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    }
  ],
  "needsRegistration": false,
  "timing": {
    "phase": "active",
    "daysUntilStart": 0,
    "daysLeft": 46,
    "progress": 49.5,
    "cycle": {
      "start": "2026-11-01",
      "end": "2026-11-30",
      "resetDate": "2026-12-01",
      "length": 30,
      "daysLeft": 16,
      "progress": 46.7,
      "endsWithEvent": false
    }
  },
  "usage": {
    "cycleStart": "2026-10-31T16:00:00.000Z",
    "cycleEnd": "2026-11-30T16:00:00.000Z",
    "rewardKind": "percent",
    "usedAmount": 5000,
    "txnCount": 3,
    "excludedCount": 1,
    "qualifyingCount": null,
    "estimatedReward": 250,
    "potentialReward": 250,
    "cap": 300,
    "capReached": false,
    "capUsedPercent": 83.33,
    "remainingReward": 50,
    "remainingCapAmount": 990,
    "remainingCapTransactions": null,
    "minimumSpend": 200,
    "minimumSpendScope": "perTransaction",
    "thresholdMet": true,
    "remainingToThreshold": 0,
    "effectiveRate": 5,
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "txnRewards": null
  },
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TITLE_REQUIRED` | 沒有活動名稱 |
| 400 | `DATE_RANGE_INVALID` | 結束日早於開始日 |
| 400 | `INVALID_CASHBACK_PERCENT` | 回饋 % 不在 0-100 |
| 400 | `INVALID_START_DATE` | 日期格式錯誤 |
| 400 | `INVALID_CYCLE_ANCHOR_DAY` | 重置日超出範圍 |
| 400 | `INVALID_SOURCE_URL` | 網址不是 http/https |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/cashback/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"maxReward":500,"endDate":"2027-01-31"}'
```

### `DELETE /api/cashback/{id}` — 刪除活動

**認證**：登入 Session

同時刪除此活動的入帳紀錄；交易紀錄不受影響。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/cashback/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/cashback/{id}/duplicate` — 複製活動

**認證**：登入 Session

常用於銀行換季重新公告的活動：複製所有條件與綁定，可順便指定新的名稱與期間；登錄狀態會清空。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 新名稱（預設「原名稱（複製）」） |
| `startDate` | date \| null | 新開始日 |
| `endDate` | date \| null | 新結束日 |

```json
{
  "startDate": "2027-01-01",
  "endDate": "2027-03-31"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 12,
  "userId": 1,
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "description": null,
  "note": "需登錄，名額 10 萬名",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": "5.000",
  "cashbackFixed": null,
  "rewardType": "cash",
  "maxReward": "300.00",
  "minimumSpend": "200.00",
  "minimumSpendScope": "perTransaction",
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "matchUnspecifiedPayment": false,
  "requireMerchantMatch": false,
  "merchantKeywords": null,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值",
  "rewardRounding": "round",
  "rewardCalcMode": "aggregate",
  "rewardPrecision": 0,
  "requiresRegistration": true,
  "registeredAt": "2026-10-02",
  "sourceUrl": "https://example.com/promo",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "color": "hsl(210,70%,55%)",
      "network": "jcb"
    }
  ],
  "paymentMethods": [
    {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    }
  ],
  "needsRegistration": false,
  "timing": {
    "phase": "active",
    "daysUntilStart": 0,
    "daysLeft": 46,
    "progress": 49.5,
    "cycle": {
      "start": "2026-11-01",
      "end": "2026-11-30",
      "resetDate": "2026-12-01",
      "length": 30,
      "daysLeft": 16,
      "progress": 46.7,
      "endsWithEvent": false
    }
  },
  "usage": {
    "cycleStart": "2026-10-31T16:00:00.000Z",
    "cycleEnd": "2026-11-30T16:00:00.000Z",
    "rewardKind": "percent",
    "usedAmount": 5000,
    "txnCount": 3,
    "excludedCount": 1,
    "qualifyingCount": null,
    "estimatedReward": 250,
    "potentialReward": 250,
    "cap": 300,
    "capReached": false,
    "capUsedPercent": 83.33,
    "remainingReward": 50,
    "remainingCapAmount": 990,
    "remainingCapTransactions": null,
    "minimumSpend": 200,
    "minimumSpendScope": "perTransaction",
    "thresholdMet": true,
    "remainingToThreshold": 0,
    "effectiveRate": 5,
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "txnRewards": null
  },
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X POST 'https://你的網域/api/cashback/1/duplicate' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"startDate":"2027-01-01","endDate":"2027-03-31"}'
```

### `PUT /api/cashback/{id}/registration` — 標記已登錄 / 取消登錄

**認證**：登入 Session

會自動把活動設為「需要登錄」。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `registered` * | boolean | true=已登錄 |
| `date` | date \| null | 登錄日（預設今天） |

```json
{
  "registered": true
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `title` | string | 活動名稱（必填） |
| `description` | string \| null | 活動原文 / 說明 |
| `note` | string \| null | 備註 / 注意事項 |
| `startDate` | date \| null | 開始日（含） |
| `endDate` | date \| null | 結束日（含） |
| `cashbackPercent` | number \| null | 回饋 %（0-100，可到小數點後三位） |
| `cashbackFixed` | number \| null | 固定回饋金額 / 點數（與 % 二擇一，% 優先） |
| `rewardType` | string | 回饋類型（cash / point / coupon / other） |
| `maxReward` | number \| null | 每週期回饋上限 |
| `minimumSpend` | number \| null | 門檻金額 |
| `minimumSpendScope` | string | perTransaction=單筆滿額才算（預設）；cycleTotal=本期累積滿額後整期才有回饋（perTransaction / cycleTotal） |
| `cycleType` | string | 重置週期（none / weekly / biweekly / monthly） |
| `cycleAnchorDay` | integer \| null | weekly/biweekly：1=週一~7=週日；monthly：1~31（大於當月天數時取月底） |
| `cardIds` | integer[] |  |
| `paymentMethodIds` | integer[] |  |
| `matchUnspecifiedPayment` | boolean | 有指定支付方式時，未使用電子支付的交易也一併計入 |
| `requireMerchantMatch` | boolean | 商家限定：交易文字需包含 merchantKeywords 其一 |
| `merchantKeywords` | string \| null | 限定商家關鍵字（換行、逗號、頓號分隔；不分大小寫與空白） |
| `excludeMerchantMatch` | boolean | 排除商家：交易文字包含 excludeMerchantKeywords 其一就完全不計入（優先於其他條件） |
| `excludeMerchantKeywords` | string \| null | 排除商家關鍵字 |
| `rewardRounding` | string | 捨入方式（round / floor） |
| `rewardCalcMode` | string | aggregate=週期內加總後計算；perTransaction=逐筆計算後加總（aggregate / perTransaction） |
| `rewardPrecision` | integer | 捨入到小數點後幾位（0-6） |
| `requiresRegistration` | boolean | 活動需要登錄 |
| `registeredAt` | date \| null | 完成登錄的日期（null=尚未登錄） |
| `sourceUrl` | string \| null | 活動網址（僅接受 http/https） |
| `id` | integer | 活動 ID |
| `userId` | integer | 擁有者 |
| `cards` | CardRef[] |  |
| `paymentMethods` | PaymentMethodRef[] |  |
| `needsRegistration` | boolean | 需要登錄但尚未登錄 |
| `timing` | Timing | 伺服器計算的時間資訊，前端直接顯示即可 |
| `usage` | Usage | 依交易紀錄計算的週期使用量與應得回饋；活動未綁定卡片時為 null |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 12,
  "userId": 1,
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "description": null,
  "note": "需登錄，名額 10 萬名",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": "5.000",
  "cashbackFixed": null,
  "rewardType": "cash",
  "maxReward": "300.00",
  "minimumSpend": "200.00",
  "minimumSpendScope": "perTransaction",
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "matchUnspecifiedPayment": false,
  "requireMerchantMatch": false,
  "merchantKeywords": null,
  "excludeMerchantMatch": true,
  "excludeMerchantKeywords": "繳費\n儲值",
  "rewardRounding": "round",
  "rewardCalcMode": "aggregate",
  "rewardPrecision": 0,
  "requiresRegistration": true,
  "registeredAt": "2026-10-02",
  "sourceUrl": "https://example.com/promo",
  "cards": [
    {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "color": "hsl(210,70%,55%)",
      "network": "jcb"
    }
  ],
  "paymentMethods": [
    {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    }
  ],
  "needsRegistration": false,
  "timing": {
    "phase": "active",
    "daysUntilStart": 0,
    "daysLeft": 46,
    "progress": 49.5,
    "cycle": {
      "start": "2026-11-01",
      "end": "2026-11-30",
      "resetDate": "2026-12-01",
      "length": 30,
      "daysLeft": 16,
      "progress": 46.7,
      "endsWithEvent": false
    }
  },
  "usage": {
    "cycleStart": "2026-10-31T16:00:00.000Z",
    "cycleEnd": "2026-11-30T16:00:00.000Z",
    "rewardKind": "percent",
    "usedAmount": 5000,
    "txnCount": 3,
    "excludedCount": 1,
    "qualifyingCount": null,
    "estimatedReward": 250,
    "potentialReward": 250,
    "cap": 300,
    "capReached": false,
    "capUsedPercent": 83.33,
    "remainingReward": 50,
    "remainingCapAmount": 990,
    "remainingCapTransactions": null,
    "minimumSpend": 200,
    "minimumSpendScope": "perTransaction",
    "thresholdMet": true,
    "remainingToThreshold": 0,
    "effectiveRate": 5,
    "rewardRounding": "round",
    "rewardCalcMode": "aggregate",
    "rewardPrecision": 0,
    "txnRewards": null
  },
  "createdAt": "2026-10-01T02:00:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/cashback/1/registration' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"registered":true}'
```

### `GET /api/cashback/recommend` — 刷哪張最划算

**認證**：登入 Session

同外部 API `/api/external/recommend`（不含 best 欄位），供 App「刷哪張」頁使用。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `amount` * | query | number | 消費金額（必填） |
| `merchant` | query | string | 商家名稱，用來比對商家限定 / 排除商家（例如「全聯」「CAMA」） |
| `cardId` | query | integer | 只考慮這張卡 |
| `paymentMethodId` | query | string | 只考慮這個支付方式；none=直接刷卡 |
| `at` | query | datetime | 以這個時間點計算（ISO 8601，預設現在） |
| `limit` | query | integer | 最多回傳幾個組合（1-50，預設 10） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `amount` | number | 消費金額 |
| `merchant` | string | 商家 |
| `at` | datetime | 以哪個時間點計算 |
| `consideredEvents` | integer | 納入評估的進行中活動數 |
| `options` | object[] |  |

```json
{
  "amount": 1000,
  "merchant": "全聯",
  "at": "2026-11-15T05:00:00.000Z",
  "consideredEvents": 6,
  "options": [
    {
      "cardId": 2,
      "card": {
        "id": 2,
        "name": "國泰 CUBE",
        "imageUrl": null,
        "color": null,
        "network": "visa"
      },
      "paymentMethodId": 3,
      "paymentMethod": {
        "id": 3,
        "name": "LINE Pay",
        "imageUrl": null
      },
      "totalReward": 30,
      "effectiveRate": 3,
      "contributions": [
        {
          "eventId": 7,
          "title": "CUBE LINE Pay 3%",
          "rewardType": "point",
          "reward": 30,
          "cashbackPercent": 3,
          "cashbackFixed": null,
          "capBefore": null,
          "capReachedAfter": null,
          "remainingRewardAfter": null,
          "thresholdMetAfter": true,
          "remainingToThresholdAfter": 0,
          "needsRegistration": false,
          "merchantKeyword": null
        }
      ],
      "missed": []
    },
    {
      "cardId": 1,
      "card": {
        "id": 1,
        "name": "玉山 Pi 卡",
        "imageUrl": null,
        "color": null,
        "network": "jcb"
      },
      "paymentMethodId": null,
      "paymentMethod": null,
      "totalReward": 5,
      "effectiveRate": 0.5,
      "contributions": [
        {
          "eventId": 12,
          "title": "玉山 5%",
          "rewardType": "cash",
          "reward": 5,
          "cashbackPercent": 5,
          "cashbackFixed": null,
          "capBefore": false,
          "capReachedAfter": true,
          "remainingRewardAfter": 0,
          "thresholdMetAfter": true,
          "remainingToThresholdAfter": 0,
          "needsRegistration": false,
          "merchantKeyword": null
        }
      ],
      "missed": [
        {
          "eventId": 15,
          "title": "全聯不回饋活動",
          "reason": "excludedMerchant",
          "keyword": "全聯",
          "minimumSpend": null
        }
      ]
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `AMOUNT_REQUIRED` | 沒有帶 amount |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/cashback/recommend?amount=1000' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 回饋核對

應得回饋 vs 實際入帳（Session）。

### `GET /api/cashback/rewards-audit` — 回饋核對（應得 vs 實際入帳）

**認證**：登入 Session

依交易紀錄計算每個活動在指定區間「應得」的回饋，附上計入 / 排除的交易明細，以及與該區間重疊的入帳紀錄，用來核對銀行有沒有少給。

- range=cycle（預設）：各活動本期
- range=prevCycle：各活動上一個已結束的週期（無週期或尚未滿一期的活動會略過）
- range=range：自訂 from / to（to 不含）

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `status` | query | string | active=未結束（含即將開始，預設）、ongoing=進行中、upcoming=即將開始、expired=已結束、all=全部（active / ongoing / upcoming / expired / all） |
| `q` | query | string | 關鍵字（標題、說明、備註、商家關鍵字、卡片 / 支付方式名稱，不分大小寫與空白） |
| `cardId` | query | integer | 只列綁定此卡的活動 |
| `paymentMethodId` | query | string | 只列綁定此支付方式的活動；none=適用直接刷卡的活動 |
| `range` | query | string | 計算區間（cycle / prevCycle / range） |
| `from` | query | datetime | range=range 時的起點 ISO 8601（含） |
| `to` | query | datetime | range=range 時的終點 ISO 8601（不含） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `range` | string | cycle / prevCycle / range |
| `from` | datetime \| null | 自訂起 |
| `to` | datetime \| null | 自訂迄 |
| `totals` | object |  |
| `events` | Event + object[] |  |

```json
{
  "range": "prevCycle",
  "from": null,
  "to": null,
  "totals": {
    "expected": 300,
    "received": 280,
    "spend": 6400
  },
  "events": [
    {
      "id": 12,
      "userId": 1,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "description": null,
      "note": "需登錄，名額 10 萬名",
      "startDate": "2026-10-01",
      "endDate": "2026-12-31",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "minimumSpend": "200.00",
      "minimumSpendScope": "perTransaction",
      "cycleType": "monthly",
      "cycleAnchorDay": 1,
      "matchUnspecifiedPayment": false,
      "requireMerchantMatch": false,
      "merchantKeywords": null,
      "excludeMerchantMatch": true,
      "excludeMerchantKeywords": "繳費\n儲值",
      "rewardRounding": "round",
      "rewardCalcMode": "aggregate",
      "rewardPrecision": 0,
      "requiresRegistration": true,
      "registeredAt": "2026-10-02",
      "sourceUrl": "https://example.com/promo",
      "cards": [
        {
          "id": 1,
          "name": "玉山 Pi 卡",
          "imageUrl": null,
          "color": "hsl(210,70%,55%)",
          "network": "jcb"
        }
      ],
      "paymentMethods": [
        {
          "id": 3,
          "name": "LINE Pay",
          "imageUrl": null
        }
      ],
      "needsRegistration": false,
      "timing": {
        "phase": "active",
        "daysUntilStart": 0,
        "daysLeft": 46,
        "progress": 49.5,
        "cycle": {
          "start": "2026-11-01",
          "end": "2026-11-30",
          "resetDate": "2026-12-01",
          "length": 30,
          "daysLeft": 16,
          "progress": 46.7,
          "endsWithEvent": false
        }
      },
      "usage": {
        "cycleStart": "2026-10-31T16:00:00.000Z",
        "cycleEnd": "2026-11-30T16:00:00.000Z",
        "rewardKind": "percent",
        "usedAmount": 5000,
        "txnCount": 3,
        "excludedCount": 1,
        "qualifyingCount": null,
        "estimatedReward": 250,
        "potentialReward": 250,
        "cap": 300,
        "capReached": false,
        "capUsedPercent": 83.33,
        "remainingReward": 50,
        "remainingCapAmount": 990,
        "remainingCapTransactions": null,
        "minimumSpend": 200,
        "minimumSpendScope": "perTransaction",
        "thresholdMet": true,
        "remainingToThreshold": 0,
        "effectiveRate": 5,
        "rewardRounding": "round",
        "rewardCalcMode": "aggregate",
        "rewardPrecision": 0,
        "txnRewards": null
      },
      "createdAt": "2026-10-01T02:00:00.000Z",
      "updatedAt": "2026-10-02T02:00:00.000Z",
      "period": {
        "start": "2026-10-01",
        "end": "2026-10-31"
      },
      "receipts": [
        {
          "id": 5,
          "eventId": 12,
          "eventTitle": "玉山 Pi 卡 LINE Pay 5%",
          "periodStart": "2026-10-01",
          "periodEnd": "2026-10-31",
          "expectedAmount": 300,
          "receivedAmount": 280,
          "difference": -20,
          "receivedDate": "2026-11-20",
          "note": "帳單回饋"
        }
      ],
      "reconciliation": {
        "expected": 300,
        "received": 280,
        "difference": -20
      }
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `RANGE_INVALID` | from 不早於 to |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/cashback/rewards-audit' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/cashback/receipts` — 列出入帳紀錄

**認證**：登入 Session

所有活動的實際入帳紀錄，依入帳日新到舊。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `eventId` | query | integer | 只看某個活動 |
| `from` | query | date | 入帳日起 YYYY-MM-DD |
| `to` | query | date | 入帳日迄 YYYY-MM-DD（含） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `items` | Receipt[] |  |
| `totals` | object |  |

```json
{
  "items": [
    {
      "id": 5,
      "eventId": 12,
      "eventTitle": "玉山 Pi 卡 LINE Pay 5%",
      "periodStart": "2026-10-01",
      "periodEnd": "2026-10-31",
      "expectedAmount": 300,
      "receivedAmount": 280,
      "difference": -20,
      "receivedDate": "2026-11-20",
      "note": "帳單回饋"
    }
  ],
  "totals": {
    "received": 280,
    "expected": 300
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/cashback/receipts' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/cashback/{id}/receipts` — 記錄實際入帳

**認證**：登入 Session

沒帶 expectedAmount 時，系統依 periodStart~periodEnd 計算應得回饋並存成快照，之後交易變動不會改到這筆紀錄。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `periodStart` | date \| null | 核對期間起日 |
| `periodEnd` | date \| null | 核對期間迄日（含） |
| `receivedAmount` * | number | 實際入帳金額（必填） |
| `receivedDate` | date | 入帳日（預設今天） |
| `expectedAmount` | number \| null | 應得回饋；省略時系統依期間自動計算並存為快照 |
| `note` | string \| null | 備註 |

```json
{
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-31",
  "receivedAmount": 280,
  "receivedDate": "2026-11-20",
  "note": "帳單回饋"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 入帳紀錄 ID |
| `eventId` | integer | 活動 ID |
| `eventTitle` | string \| null | 活動名稱 |
| `periodStart` | date \| null | 核對期間起日（含） |
| `periodEnd` | date \| null | 核對期間迄日（含） |
| `expectedAmount` | number \| null | 建立時系統計算的應得回饋 |
| `receivedAmount` | number | 實際入帳 |
| `difference` | number \| null | 實際 − 應得；負數代表少給 |
| `receivedDate` | date | 入帳日 |
| `note` | string \| null | 備註 |

```json
{
  "id": 5,
  "eventId": 12,
  "eventTitle": "玉山 Pi 卡 LINE Pay 5%",
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-31",
  "expectedAmount": 300,
  "receivedAmount": 280,
  "difference": -20,
  "receivedDate": "2026-11-20",
  "note": "帳單回饋"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `RECEIVED_AMOUNT_REQUIRED` | 沒有實際入帳金額 |
| 400 | `DATE_RANGE_INVALID` | 迄日早於起日 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |

**範例**

```bash
curl -X POST 'https://你的網域/api/cashback/1/receipts' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"periodStart":"2026-10-01","periodEnd":"2026-10-31","receivedAmount":280,"receivedDate":"2026-11-20","note":"帳單回饋"}'
```

### `PUT /api/cashback/{id}/receipts/{rid}` — 修改入帳紀錄（部分更新）

**認證**：登入 Session

修改期間且沒帶 expectedAmount 時會重新計算應得回饋。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |
| `rid` * | path | integer | 入帳紀錄 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `periodStart` | date \| null | 核對期間起日 |
| `periodEnd` | date \| null | 核對期間迄日（含） |
| `receivedAmount` * | number | 實際入帳金額（必填） |
| `receivedDate` | date | 入帳日（預設今天） |
| `expectedAmount` | number \| null | 應得回饋；省略時系統依期間自動計算並存為快照 |
| `note` | string \| null | 備註 |

```json
{
  "receivedAmount": 300
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 入帳紀錄 ID |
| `eventId` | integer | 活動 ID |
| `eventTitle` | string \| null | 活動名稱 |
| `periodStart` | date \| null | 核對期間起日（含） |
| `periodEnd` | date \| null | 核對期間迄日（含） |
| `expectedAmount` | number \| null | 建立時系統計算的應得回饋 |
| `receivedAmount` | number | 實際入帳 |
| `difference` | number \| null | 實際 − 應得；負數代表少給 |
| `receivedDate` | date | 入帳日 |
| `note` | string \| null | 備註 |

```json
{
  "id": 5,
  "eventId": 12,
  "eventTitle": "玉山 Pi 卡 LINE Pay 5%",
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-31",
  "expectedAmount": 300,
  "receivedAmount": 280,
  "difference": -20,
  "receivedDate": "2026-11-20",
  "note": "帳單回饋"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |
| 404 | `RECEIPT_NOT_FOUND` | 找不到此入帳紀錄 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/cashback/1/receipts/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"receivedAmount":300}'
```

### `DELETE /api/cashback/{id}/receipts/{rid}` — 刪除入帳紀錄

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 活動 ID |
| `rid` * | path | integer | 入帳紀錄 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此回饋活動 |
| 404 | `RECEIPT_NOT_FOUND` | 找不到此入帳紀錄 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/cashback/1/receipts/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 交易紀錄

交易的查詢、手動新增與統計（Session）。

### `GET /api/transactions` — 列出交易（分頁）

**認證**：登入 Session

每筆附 matchedEvents；summary 為整個篩選結果（非僅本頁）的筆數與金額合計。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `q` | query | string | 關鍵字（比對備註、卡片名稱、支付方式名稱） |
| `cardId` | query | integer | 卡片 ID |
| `paymentMethodId` | query | string | 支付方式 ID；none=未使用電子支付 |
| `from` | query | datetime | 交易時間起（ISO 8601，含） |
| `to` | query | datetime | 交易時間迄（ISO 8601，含） |
| `minAmount` | query | number | 金額下限 |
| `maxAmount` | query | number | 金額上限 |
| `source` | query | string | 來源（api / manual） |
| `page` | query | integer | 頁碼（從 1 開始） |
| `pageSize` | query | integer | 每頁筆數 |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `items` | Transaction[] |  |
| `total` | integer | 總筆數 |
| `page` | integer | 頁碼 |
| `pageSize` | integer | 每頁 |
| `summary` | object |  |

```json
{
  "items": [
    {
      "id": 501,
      "cardId": 1,
      "card": {
        "id": 1,
        "name": "玉山 Pi 卡",
        "imageUrl": null,
        "network": "jcb",
        "color": "hsl(210,70%,55%)",
        "lastFour": "1234"
      },
      "paymentMethodId": 3,
      "paymentMethod": {
        "id": 3,
        "name": "LINE Pay",
        "imageUrl": null
      },
      "amount": "1280.00",
      "transactionAt": "2026-11-15T05:05:00.000Z",
      "note": "全聯 信義店",
      "latitude": 25.033,
      "longitude": 121.5654,
      "externalRef": "ledger-8831",
      "source": "api",
      "rawCardName": "玉山 Pi 卡",
      "rawPaymentMethodName": "LINE Pay",
      "matchedEvents": [
        {
          "id": 12,
          "title": "玉山 Pi 卡 LINE Pay 5%",
          "cashbackPercent": "5.000",
          "cashbackFixed": null,
          "rewardType": "cash",
          "maxReward": "300.00",
          "estimatedReward": 64,
          "matchedKeyword": null
        }
      ],
      "createdAt": "2026-11-15T05:05:01.000Z",
      "updatedAt": "2026-11-15T05:05:01.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "summary": {
    "count": 1,
    "totalAmount": 1280
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `INVALID_FROM` | from 無法解析 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/transactions' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/transactions` — 手動新增交易

**認證**：登入 Session

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `cardId` | integer | 卡片 ID（新增必填） |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `amount` | number | 金額 > 0（新增必填） |
| `transactionAt` | datetime | 交易時間 ISO 8601（預設現在） |
| `note` | string \| null | 備註 / 商家 |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |

```json
{
  "cardId": 1,
  "paymentMethodId": 3,
  "amount": 1280,
  "transactionAt": "2026-11-15T13:05:00+08:00",
  "note": "全聯"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": null,
  "source": "manual",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `CARD_ID_REQUIRED` | 沒有選卡片 |
| 400 | `CARD_NOT_FOUND` | 卡片不存在 |
| 400 | `PAYMENT_METHOD_NOT_FOUND` | 支付方式不存在 |
| 400 | `AMOUNT_INVALID` | 金額不合法 |
| 400 | `LOCATION_INCOMPLETE` | 經緯度只給一個 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X POST 'https://你的網域/api/transactions' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"cardId":1,"paymentMethodId":3,"amount":1280,"transactionAt":"2026-11-15T13:05:00+08:00","note":"全聯"}'
```

### `GET /api/transactions/stats` — 消費統計

**認證**：登入 Session

依卡片、支付方式、日期分組的金額與筆數（篩選條件同列表）。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `q` | query | string | 關鍵字（比對備註、卡片名稱、支付方式名稱） |
| `cardId` | query | integer | 卡片 ID |
| `paymentMethodId` | query | string | 支付方式 ID；none=未使用電子支付 |
| `from` | query | datetime | 交易時間起（ISO 8601，含） |
| `to` | query | datetime | 交易時間迄（ISO 8601，含） |
| `minAmount` | query | number | 金額下限 |
| `maxAmount` | query | number | 金額上限 |
| `source` | query | string | 來源（api / manual） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `totalAmount` | number | 合計 |
| `count` | integer | 筆數 |
| `byCard` | object[] |  |
| `byPaymentMethod` | object[] |  |
| `byDay` | object[] |  |

```json
{
  "totalAmount": 18320,
  "count": 27,
  "byCard": [
    {
      "cardId": 1,
      "name": "玉山 Pi 卡",
      "total": 12000,
      "count": 15
    }
  ],
  "byPaymentMethod": [
    {
      "paymentMethodId": null,
      "name": null,
      "total": 9000,
      "count": 10
    }
  ],
  "byDay": [
    {
      "date": "2026-11-15",
      "total": 1280,
      "count": 1
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/transactions/stats' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/transactions/locations` — 有經緯度的交易（地圖用）

**認證**：登入 Session

不分頁（最多 5000 筆），篩選條件同列表。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `q` | query | string | 關鍵字（比對備註、卡片名稱、支付方式名稱） |
| `cardId` | query | integer | 卡片 ID |
| `paymentMethodId` | query | string | 支付方式 ID；none=未使用電子支付 |
| `from` | query | datetime | 交易時間起（ISO 8601，含） |
| `to` | query | datetime | 交易時間迄（ISO 8601，含） |
| `minAmount` | query | number | 金額下限 |
| `maxAmount` | query | number | 金額上限 |
| `source` | query | string | 來源（api / manual） |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
[
  {
    "id": 501,
    "cardId": 1,
    "card": {
      "id": 1,
      "name": "玉山 Pi 卡",
      "imageUrl": null,
      "network": "jcb",
      "color": "hsl(210,70%,55%)",
      "lastFour": "1234"
    },
    "paymentMethodId": 3,
    "paymentMethod": {
      "id": 3,
      "name": "LINE Pay",
      "imageUrl": null
    },
    "amount": "1280.00",
    "transactionAt": "2026-11-15T05:05:00.000Z",
    "note": "全聯 信義店",
    "latitude": 25.033,
    "longitude": 121.5654,
    "externalRef": "ledger-8831",
    "source": "api",
    "rawCardName": "玉山 Pi 卡",
    "rawPaymentMethodName": "LINE Pay",
    "matchedEvents": [
      {
        "id": 12,
        "title": "玉山 Pi 卡 LINE Pay 5%",
        "cashbackPercent": "5.000",
        "cashbackFixed": null,
        "rewardType": "cash",
        "maxReward": "300.00",
        "estimatedReward": 64,
        "matchedKeyword": null
      }
    ],
    "createdAt": "2026-11-15T05:05:01.000Z",
    "updatedAt": "2026-11-15T05:05:01.000Z"
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/transactions/locations' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/transactions/{id}` — 取得單筆交易

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 交易 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831",
  "source": "api",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此筆交易 |

**範例**

```bash
curl -X GET 'https://你的網域/api/transactions/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `PUT /api/transactions/{id}` — 修改交易（部分更新）

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 交易 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `cardId` | integer | 卡片 ID（新增必填） |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `amount` | number | 金額 > 0（新增必填） |
| `transactionAt` | datetime | 交易時間 ISO 8601（預設現在） |
| `note` | string \| null | 備註 / 商家 |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |

```json
{
  "amount": 1180,
  "note": "全聯（退一項）"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 交易 ID |
| `cardId` | integer | 卡片 ID |
| `card` | CardRef |  |
| `paymentMethodId` | integer \| null | 支付方式 ID；null=未使用電子支付 |
| `paymentMethod` | PaymentMethodRef |  |
| `amount` | string | 金額（DECIMAL 字串） |
| `transactionAt` | datetime | 交易時間 |
| `note` | string \| null | 備註 / 商家名稱（商家限定與排除比對的主要依據） |
| `latitude` | number \| null | 緯度 |
| `longitude` | number \| null | 經度 |
| `externalRef` | string \| null | 外部系統交易 ID |
| `source` | string | 來源（api / manual） |
| `rawCardName` | string \| null | 回報當下的卡片名稱原文 |
| `rawPaymentMethodName` | string \| null | 回報當下的支付方式名稱原文 |
| `matchedEvents` | object[] |  |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

```json
{
  "id": 501,
  "cardId": 1,
  "card": {
    "id": 1,
    "name": "玉山 Pi 卡",
    "imageUrl": null,
    "network": "jcb",
    "color": "hsl(210,70%,55%)",
    "lastFour": "1234"
  },
  "paymentMethodId": 3,
  "paymentMethod": {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null
  },
  "amount": "1280.00",
  "transactionAt": "2026-11-15T05:05:00.000Z",
  "note": "全聯 信義店",
  "latitude": 25.033,
  "longitude": 121.5654,
  "externalRef": "ledger-8831",
  "source": "api",
  "rawCardName": "玉山 Pi 卡",
  "rawPaymentMethodName": "LINE Pay",
  "matchedEvents": [
    {
      "id": 12,
      "title": "玉山 Pi 卡 LINE Pay 5%",
      "cashbackPercent": "5.000",
      "cashbackFixed": null,
      "rewardType": "cash",
      "maxReward": "300.00",
      "estimatedReward": 64,
      "matchedKeyword": null
    }
  ],
  "createdAt": "2026-11-15T05:05:01.000Z",
  "updatedAt": "2026-11-15T05:05:01.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `AMOUNT_INVALID` | 金額不合法 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此筆交易 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/transactions/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"amount":1180,"note":"全聯（退一項）"}'
```

### `DELETE /api/transactions/{id}` — 刪除交易

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 交易 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此筆交易 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/transactions/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## API 金鑰

管理外部串接用的 API 金鑰（Session）。

### `GET /api/transactions/api-keys` — 列出 API 金鑰

**認證**：登入 Session

只回傳遮罩後的金鑰。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰（頭尾片段） |
| `isActive` | boolean | 是否啟用 |
| `lastUsedAt` | datetime \| null | 最後使用時間 |
| `createdAt` | datetime | 建立時間 |

```json
[
  {
    "id": 1,
    "name": "記帳 App",
    "keyMask": "mcb_…x9Zk",
    "isActive": true,
    "lastUsedAt": "2026-11-15T05:05:01.000Z",
    "createdAt": "2026-10-01T00:00:00.000Z"
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/transactions/api-keys' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/transactions/api-keys` — 建立 API 金鑰

**認證**：登入 Session

**明碼 token 只會在這次回應出現一次**，之後只存 SHA-256 雜湊，無法再查看。外部串接（/api/ingest/*、/api/external/*）都用這把金鑰。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` * | string | 名稱（最多 120 字） |

```json
{
  "name": "記帳 App"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰（頭尾片段） |
| `isActive` | boolean | 是否啟用 |
| `lastUsedAt` | datetime \| null | 最後使用時間 |
| `createdAt` | datetime | 建立時間 |
| `token` | string | 完整金鑰，請立即保存 |

```json
{
  "id": 2,
  "name": "記帳 App",
  "keyMask": "mcb_…x9Zk",
  "isActive": true,
  "lastUsedAt": null,
  "createdAt": "2026-11-15T05:00:00.000Z",
  "token": "mcb_8c1Vw0…完整 43 字元…x9Zk"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `NAME_REQUIRED` | 沒有名稱 |
| 400 | `NAME_TOO_LONG` | 名稱過長 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X POST 'https://你的網域/api/transactions/api-keys' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"記帳 App"}'
```

### `PUT /api/transactions/api-keys/{keyId}` — 改名 / 啟用 / 停用金鑰

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `keyId` * | path | integer | API 金鑰 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 新名稱 |
| `isActive` | boolean | 啟用狀態 |

```json
{
  "isActive": false
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰（頭尾片段） |
| `isActive` | boolean | 是否啟用 |
| `lastUsedAt` | datetime \| null | 最後使用時間 |
| `createdAt` | datetime | 建立時間 |

```json
{
  "id": 2,
  "name": "記帳 App",
  "keyMask": "mcb_…x9Zk",
  "isActive": false,
  "lastUsedAt": null,
  "createdAt": "2026-11-15T05:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此金鑰 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/transactions/api-keys/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"isActive":false}'
```

### `DELETE /api/transactions/api-keys/{keyId}` — 刪除金鑰

**認證**：登入 Session

使用此金鑰的呼叫會立即失效。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `keyId` * | path | integer | API 金鑰 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此金鑰 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/transactions/api-keys/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 點數

點數餘額時間軸與到期提醒（Session）。

### `GET /api/points` — 列出點數

**認證**：登入 Session

含換算價值、本月獲得/使用與最近到期提醒。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 點數 ID |
| `name` | string | 名稱 |
| `issuer` | string \| null | 發行單位 |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `currentBalance` | number | 目前餘額（由歷史紀錄重算） |
| `valuePerPoint` | number \| null | 每點約值多少新台幣 |
| `value` | number \| null | 換算新台幣價值 = 餘額 × valuePerPoint |
| `note` | string \| null | 備註 |
| `monthEarned` | number | 本月獲得（列表時提供） |
| `monthSpent` | number | 本月使用（列表時提供） |
| `nextExpiry` | object \| null | 最近一筆啟用中的到期提醒（列表時提供） |

```json
[
  {
    "id": 4,
    "name": "全聯福利點",
    "issuer": "全聯",
    "imageUrl": null,
    "color": "hsl(20,70%,55%)",
    "currentBalance": 1350,
    "valuePerPoint": 1,
    "value": 1350,
    "note": null,
    "monthEarned": 120,
    "monthSpent": 0,
    "nextExpiry": {
      "id": 9,
      "amount": 215,
      "expiryDate": "2026-12-31",
      "daysLeft": 46
    }
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/points' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/points` — 新增點數

**認證**：登入 Session

可用 multipart/form-data 一併上傳圖片；初始餘額會建立一筆「直接設定」紀錄。

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `issuer` | string | 發行單位 |
| `currentBalance` | number | 建立時的初始餘額（僅新增時） |
| `valuePerPoint` | number | 每點約值多少新台幣 |
| `note` | string | 備註 |
| `image` | file | 圖片（multipart） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "name": "全聯福利點",
  "issuer": "全聯",
  "currentBalance": 1230,
  "valuePerPoint": 1
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 點數 ID |
| `name` | string | 名稱 |
| `issuer` | string \| null | 發行單位 |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `currentBalance` | number | 目前餘額（由歷史紀錄重算） |
| `valuePerPoint` | number \| null | 每點約值多少新台幣 |
| `value` | number \| null | 換算新台幣價值 = 餘額 × valuePerPoint |
| `note` | string \| null | 備註 |
| `monthEarned` | number | 本月獲得（列表時提供） |
| `monthSpent` | number | 本月使用（列表時提供） |
| `nextExpiry` | object \| null | 最近一筆啟用中的到期提醒（列表時提供） |

```json
{
  "id": 4,
  "name": "全聯福利點",
  "issuer": "全聯",
  "imageUrl": null,
  "color": "hsl(20,70%,55%)",
  "currentBalance": 1350,
  "valuePerPoint": 1,
  "value": 1350,
  "note": null,
  "monthEarned": 120,
  "monthSpent": 0,
  "nextExpiry": {
    "id": 9,
    "amount": 215,
    "expiryDate": "2026-12-31",
    "daysLeft": 46
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `NAME_REQUIRED` | 沒有名稱 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 413 | `LIMIT_FILE_SIZE` | 圖片超過 4MB |

**範例**

```bash
curl -X POST 'https://你的網域/api/points' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"全聯福利點","issuer":"全聯","currentBalance":1230,"valuePerPoint":1}'
```

### `GET /api/points/{id}` — 取得單一點數

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 點數 ID |
| `name` | string | 名稱 |
| `issuer` | string \| null | 發行單位 |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `currentBalance` | number | 目前餘額（由歷史紀錄重算） |
| `valuePerPoint` | number \| null | 每點約值多少新台幣 |
| `value` | number \| null | 換算新台幣價值 = 餘額 × valuePerPoint |
| `note` | string \| null | 備註 |
| `monthEarned` | number | 本月獲得（列表時提供） |
| `monthSpent` | number | 本月使用（列表時提供） |
| `nextExpiry` | object \| null | 最近一筆啟用中的到期提醒（列表時提供） |

```json
{
  "id": 4,
  "name": "全聯福利點",
  "issuer": "全聯",
  "imageUrl": null,
  "color": "hsl(20,70%,55%)",
  "currentBalance": 1350,
  "valuePerPoint": 1,
  "value": 1350,
  "note": null,
  "monthEarned": 120,
  "monthSpent": 0,
  "nextExpiry": {
    "id": 9,
    "amount": 215,
    "expiryDate": "2026-12-31",
    "daysLeft": 46
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X GET 'https://你的網域/api/points/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `PUT /api/points/{id}` — 修改點數資料

**認證**：登入 Session

只改名稱/單位/價值/圖片；餘額請透過歷史紀錄調整。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `issuer` | string | 發行單位 |
| `currentBalance` | number | 建立時的初始餘額（僅新增時） |
| `valuePerPoint` | number | 每點約值多少新台幣 |
| `note` | string | 備註 |
| `image` | file | 圖片（multipart） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "valuePerPoint": 0.5
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 點數 ID |
| `name` | string | 名稱 |
| `issuer` | string \| null | 發行單位 |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `currentBalance` | number | 目前餘額（由歷史紀錄重算） |
| `valuePerPoint` | number \| null | 每點約值多少新台幣 |
| `value` | number \| null | 換算新台幣價值 = 餘額 × valuePerPoint |
| `note` | string \| null | 備註 |
| `monthEarned` | number | 本月獲得（列表時提供） |
| `monthSpent` | number | 本月使用（列表時提供） |
| `nextExpiry` | object \| null | 最近一筆啟用中的到期提醒（列表時提供） |

```json
{
  "id": 4,
  "name": "全聯福利點",
  "issuer": "全聯",
  "imageUrl": null,
  "color": "hsl(20,70%,55%)",
  "currentBalance": 1350,
  "valuePerPoint": 1,
  "value": 1350,
  "note": null,
  "monthEarned": 120,
  "monthSpent": 0,
  "nextExpiry": {
    "id": 9,
    "amount": 215,
    "expiryDate": "2026-12-31",
    "daysLeft": 46
  }
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/points/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"valuePerPoint":0.5}'
```

### `DELETE /api/points/{id}` — 刪除點數

**認證**：登入 Session

連同所有歷史紀錄與到期提醒。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/points/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/points/{id}/histories` — 時間軸與月統計

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `point` | Point |  |
| `histories` | PointHistory[] |  |
| `stats` | object[] |  |

```json
{
  "point": {
    "id": 4,
    "name": "全聯福利點",
    "issuer": "全聯",
    "imageUrl": null,
    "color": "hsl(20,70%,55%)",
    "currentBalance": 1350,
    "valuePerPoint": 1,
    "value": 1350,
    "note": null,
    "monthEarned": 120,
    "monthSpent": 0,
    "nextExpiry": {
      "id": 9,
      "amount": 215,
      "expiryDate": "2026-12-31",
      "daysLeft": 46
    }
  },
  "histories": [
    {
      "id": 77,
      "pointId": 4,
      "changeType": "earn",
      "delta": 120,
      "targetBalance": null,
      "balanceAfter": 1350,
      "occurredAt": "2026-11-15T05:00:00.000Z",
      "note": "購物累積"
    }
  ],
  "stats": [
    {
      "period": "2026-11",
      "earned": 120,
      "spent": 0,
      "net": 120
    }
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X GET 'https://你的網域/api/points/1/histories' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/points/{id}/histories` — 新增點數紀錄

**認證**：登入 Session

set=宣告當下餘額（之後插入更早的紀錄也不會改變這個值）；earn/spend=增減。新增後整條時間軸自動重算。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `changeType` * | string | set / earn / spend（set / earn / spend） |
| `amount` * | number | 數量（set 時為當下餘額） |
| `occurredAt` | datetime | 發生時間 ISO 8601（預設現在） |
| `note` | string | 備註 |

```json
{
  "changeType": "earn",
  "amount": 120,
  "occurredAt": "2026-11-15T13:00:00+08:00",
  "note": "購物累積"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `history` | PointHistory |  |
| `currentBalance` | number | 重算後餘額 |

```json
{
  "ok": true,
  "history": {
    "id": 77,
    "pointId": 4,
    "changeType": "earn",
    "delta": 120,
    "targetBalance": null,
    "balanceAfter": 1350,
    "occurredAt": "2026-11-15T05:00:00.000Z",
    "note": "購物累積"
  },
  "currentBalance": 1350
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `INVALID_CHANGE_TYPE` | changeType 錯誤 |
| 400 | `INVALID_AMOUNT` | 數量錯誤 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X POST 'https://你的網域/api/points/1/histories' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"changeType":"earn","amount":120,"occurredAt":"2026-11-15T13:00:00+08:00","note":"購物累積"}'
```

### `PUT /api/points/{id}/histories/{hid}` — 修改點數紀錄（部分更新）

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |
| `hid` * | path | integer | 紀錄 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `changeType` * | string | set / earn / spend（set / earn / spend） |
| `amount` * | number | 數量（set 時為當下餘額） |
| `occurredAt` | datetime | 發生時間 ISO 8601（預設現在） |
| `note` | string | 備註 |

```json
{
  "amount": 150
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `history` | PointHistory |  |
| `currentBalance` | number | 重算後餘額 |

```json
{
  "ok": true,
  "history": {
    "id": 77,
    "pointId": 4,
    "changeType": "earn",
    "delta": 120,
    "targetBalance": null,
    "balanceAfter": 1350,
    "occurredAt": "2026-11-15T05:00:00.000Z",
    "note": "購物累積"
  },
  "currentBalance": 1380
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |
| 404 | `HISTORY_NOT_FOUND` | 找不到此紀錄 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/points/1/histories/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"amount":150}'
```

### `DELETE /api/points/{id}/histories/{hid}` — 刪除點數紀錄

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |
| `hid` * | path | integer | 紀錄 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `currentBalance` | number | 重算後餘額 |

```json
{
  "ok": true,
  "currentBalance": 1230
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |
| 404 | `HISTORY_NOT_FOUND` | 找不到此紀錄 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/points/1/histories/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/points/{id}/expiries` — 列出到期提醒

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 提醒 ID |
| `pointId` | integer | 點數 ID |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active=提醒中；dismissed=已使用/解除（active / dismissed） |
| `daysLeft` | integer | 距到期天數（負數=已過期） |
| `note` | string \| null | 備註 |

```json
[
  {
    "id": 9,
    "pointId": 4,
    "userId": 1,
    "amount": 215,
    "expiryDate": "2026-12-31",
    "status": "active",
    "daysLeft": 46,
    "note": null
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X GET 'https://你的網域/api/points/1/expiries' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/points/{id}/expiries` — 新增到期提醒

**認證**：登入 Session

每天 21:00 推播會提醒 7 天內到期的點數。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active / dismissed（僅修改時）（active / dismissed） |
| `note` | string \| null | 備註 |

```json
{
  "amount": 215,
  "expiryDate": "2026-12-31"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 提醒 ID |
| `pointId` | integer | 點數 ID |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active=提醒中；dismissed=已使用/解除（active / dismissed） |
| `daysLeft` | integer | 距到期天數（負數=已過期） |
| `note` | string \| null | 備註 |

```json
{
  "id": 9,
  "pointId": 4,
  "userId": 1,
  "amount": 215,
  "expiryDate": "2026-12-31",
  "status": "active",
  "daysLeft": 46,
  "note": null
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `AMOUNT_AND_DATE_REQUIRED` | 缺少數量或日期 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |

**範例**

```bash
curl -X POST 'https://你的網域/api/points/1/expiries' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"amount":215,"expiryDate":"2026-12-31"}'
```

### `PUT /api/points/{id}/expiries/{eid}` — 修改到期提醒 / 標記已使用

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |
| `eid` * | path | integer | 到期提醒 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active / dismissed（僅修改時）（active / dismissed） |
| `note` | string \| null | 備註 |

```json
{
  "status": "dismissed"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 提醒 ID |
| `pointId` | integer | 點數 ID |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active=提醒中；dismissed=已使用/解除（active / dismissed） |
| `daysLeft` | integer | 距到期天數（負數=已過期） |
| `note` | string \| null | 備註 |

```json
{
  "id": 9,
  "pointId": 4,
  "userId": 1,
  "amount": 215,
  "expiryDate": "2026-12-31",
  "status": "dismissed",
  "daysLeft": 46,
  "note": null
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `INVALID_STATUS` | status 錯誤 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |
| 404 | `EXPIRY_NOT_FOUND` | 找不到此提醒 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/points/1/expiries/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"status":"dismissed"}'
```

### `DELETE /api/points/{id}/expiries/{eid}` — 刪除到期提醒

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 點數 ID |
| `eid` * | path | integer | 到期提醒 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此點數 |
| 404 | `EXPIRY_NOT_FOUND` | 找不到此提醒 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/points/1/expiries/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/expiries/alerts` — 所有啟用中的到期提醒

**認證**：登入 Session

跨點數列出，含所屬點數資訊與剩餘天數。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 提醒 ID |
| `pointId` | integer | 點數 ID |
| `amount` | number | 到期數量 |
| `expiryDate` | date | 到期日 |
| `status` | string | active=提醒中；dismissed=已使用/解除（active / dismissed） |
| `daysLeft` | integer | 距到期天數（負數=已過期） |
| `note` | string \| null | 備註 |
| `point` | object |  |

```json
[
  {
    "id": 9,
    "pointId": 4,
    "userId": 1,
    "amount": 215,
    "expiryDate": "2026-12-31",
    "status": "active",
    "daysLeft": 46,
    "note": null,
    "point": {
      "id": 4,
      "name": "全聯福利點",
      "issuer": "全聯",
      "imageUrl": null,
      "color": null,
      "currentBalance": "1350.00"
    }
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/expiries/alerts' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 卡片與支付方式

活動與交易綁定的卡片 / 支付方式（Session）。

### `GET /api/tags/cards` — 列出卡片

**認證**：登入 Session

不含完整卡號（需另呼叫 /pan）。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 卡片 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `kind` | string | 類型（credit / debit / bank / other） |
| `issuer` | string \| null | 發卡銀行 |
| `lastFour` | string \| null | 卡號末四碼（由完整卡號自動擷取） |
| `hasPan` | boolean | 是否已儲存加密的完整卡號 |
| `network` | string \| null | 發卡組織（visa / mastercard / jcb / amex / unionpay / other） |
| `imageUrl` | string \| null | 卡面圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔）；外部回報的卡片名稱符合任一別名也能對應 |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 此卡的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此卡的活動數（列表時提供） |

```json
[
  {
    "id": 1,
    "name": "玉山 Pi 卡",
    "kind": "credit",
    "issuer": "玉山銀行",
    "lastFour": "1234",
    "hasPan": true,
    "network": "jcb",
    "imageUrl": null,
    "color": "hsl(210,70%,55%)",
    "aliases": "Pi卡\n玉山Pi拍錢包信用卡",
    "note": null,
    "transactionCount": 42,
    "eventCount": 3
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/tags/cards' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/tags/cards` — 新增卡片

**認證**：登入 Session

可用 multipart/form-data 上傳卡面。

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `kind` | string | 類型（credit / debit / bank / other） |
| `issuer` | string | 發卡銀行 |
| `pan` | string | 完整卡號 13-19 碼（AES-256-GCM 加密儲存；更新時留空=不變） |
| `removePan` | boolean | true=刪除已儲存的完整卡號 |
| `network` | string | 發卡組織（visa / mastercard / jcb / amex / unionpay / other） |
| `aliases` | string | 別名（換行分隔） |
| `note` | string | 備註 |
| `image` | file | 卡面圖片檔（multipart，最大 4MB） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "name": "玉山 Pi 卡",
  "kind": "credit",
  "issuer": "玉山銀行",
  "network": "jcb",
  "pan": "3560 1234 5678 1234",
  "aliases": "Pi卡"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 卡片 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `kind` | string | 類型（credit / debit / bank / other） |
| `issuer` | string \| null | 發卡銀行 |
| `lastFour` | string \| null | 卡號末四碼（由完整卡號自動擷取） |
| `hasPan` | boolean | 是否已儲存加密的完整卡號 |
| `network` | string \| null | 發卡組織（visa / mastercard / jcb / amex / unionpay / other） |
| `imageUrl` | string \| null | 卡面圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔）；外部回報的卡片名稱符合任一別名也能對應 |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 此卡的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此卡的活動數（列表時提供） |

```json
{
  "id": 1,
  "name": "玉山 Pi 卡",
  "kind": "credit",
  "issuer": "玉山銀行",
  "lastFour": "1234",
  "hasPan": true,
  "network": "jcb",
  "imageUrl": null,
  "color": "hsl(210,70%,55%)",
  "aliases": "Pi卡\n玉山Pi拍錢包信用卡",
  "note": null,
  "transactionCount": 42,
  "eventCount": 3
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `NAME_REQUIRED` | 沒有名稱 |
| 400 | `INVALID_PAN` | 卡號長度錯誤 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 409 | `DUPLICATE_NAME` | 名稱重複 |

**範例**

```bash
curl -X POST 'https://你的網域/api/tags/cards' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"玉山 Pi 卡","kind":"credit","issuer":"玉山銀行","network":"jcb","pan":"3560 1234 5678 1234","aliases":"Pi卡"}'
```

### `PUT /api/tags/cards/{id}` — 修改卡片

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 卡片 ID |

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `kind` | string | 類型（credit / debit / bank / other） |
| `issuer` | string | 發卡銀行 |
| `pan` | string | 完整卡號 13-19 碼（AES-256-GCM 加密儲存；更新時留空=不變） |
| `removePan` | boolean | true=刪除已儲存的完整卡號 |
| `network` | string | 發卡組織（visa / mastercard / jcb / amex / unionpay / other） |
| `aliases` | string | 別名（換行分隔） |
| `note` | string | 備註 |
| `image` | file | 卡面圖片檔（multipart，最大 4MB） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "aliases": "Pi卡\n玉山Pi拍錢包信用卡"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 卡片 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `kind` | string | 類型（credit / debit / bank / other） |
| `issuer` | string \| null | 發卡銀行 |
| `lastFour` | string \| null | 卡號末四碼（由完整卡號自動擷取） |
| `hasPan` | boolean | 是否已儲存加密的完整卡號 |
| `network` | string \| null | 發卡組織（visa / mastercard / jcb / amex / unionpay / other） |
| `imageUrl` | string \| null | 卡面圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔）；外部回報的卡片名稱符合任一別名也能對應 |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 此卡的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此卡的活動數（列表時提供） |

```json
{
  "id": 1,
  "name": "玉山 Pi 卡",
  "kind": "credit",
  "issuer": "玉山銀行",
  "lastFour": "1234",
  "hasPan": true,
  "network": "jcb",
  "imageUrl": null,
  "color": "hsl(210,70%,55%)",
  "aliases": "Pi卡\n玉山Pi拍錢包信用卡",
  "note": null,
  "transactionCount": 42,
  "eventCount": 3
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `INVALID_PAN` | 卡號長度錯誤 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此卡片 |
| 409 | `DUPLICATE_NAME` | 名稱重複 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/tags/cards/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"aliases":"Pi卡\n玉山Pi拍錢包信用卡"}'
```

### `DELETE /api/tags/cards/{id}` — 刪除卡片

**認證**：登入 Session

⚠️ 會一併刪除此卡的所有交易紀錄，並從活動綁定中移除。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 卡片 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此卡片 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/tags/cards/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/tags/cards/{id}/pan` — 取得完整卡號（解密）

**認證**：登入 Session

供「複製卡號」使用，不會出現在一般列表。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 卡片 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `pan` | string | 完整卡號數字 |

```json
{
  "pan": "3560123456781234"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此卡片 |
| 404 | `NO_PAN_STORED` | 尚未儲存完整卡號 |

**範例**

```bash
curl -X GET 'https://你的網域/api/tags/cards/1/pan' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `GET /api/tags/payment-methods` — 列出支付方式

**認證**：登入 Session

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 支付方式 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔） |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 使用此支付方式的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此支付方式的活動數（列表時提供） |

```json
[
  {
    "id": 3,
    "name": "LINE Pay",
    "imageUrl": null,
    "color": "hsl(140,70%,55%)",
    "aliases": "LINEPAY",
    "note": null,
    "transactionCount": 18,
    "eventCount": 2
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/tags/payment-methods' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/tags/payment-methods` — 新增支付方式

**認證**：登入 Session

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `aliases` | string | 別名（換行分隔） |
| `note` | string | 備註 |
| `image` | file | 圖片檔（multipart，最大 4MB） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "name": "LINE Pay",
  "aliases": "LINEPAY"
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 支付方式 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔） |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 使用此支付方式的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此支付方式的活動數（列表時提供） |

```json
{
  "id": 3,
  "name": "LINE Pay",
  "imageUrl": null,
  "color": "hsl(140,70%,55%)",
  "aliases": "LINEPAY",
  "note": null,
  "transactionCount": 18,
  "eventCount": 2
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `NAME_REQUIRED` | 沒有名稱 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 409 | `DUPLICATE_NAME` | 名稱重複 |

**範例**

```bash
curl -X POST 'https://你的網域/api/tags/payment-methods' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"LINE Pay","aliases":"LINEPAY"}'
```

### `PUT /api/tags/payment-methods/{id}` — 修改支付方式

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 支付方式 ID |

**Request body**（JSON 或 multipart/form-data）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 名稱（必填） |
| `aliases` | string | 別名（換行分隔） |
| `note` | string | 備註 |
| `image` | file | 圖片檔（multipart，最大 4MB） |
| `removeImage` | boolean | true=移除圖片 |

```json
{
  "name": "LINE Pay Money"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 支付方式 ID |
| `name` | string | 名稱（同一使用者不可重複） |
| `imageUrl` | string \| null | 圖片路徑 |
| `color` | string \| null | 代表色 |
| `aliases` | string \| null | 別名（換行分隔） |
| `note` | string \| null | 備註 |
| `transactionCount` | integer | 使用此支付方式的交易筆數（列表時提供） |
| `eventCount` | integer | 綁定此支付方式的活動數（列表時提供） |

```json
{
  "id": 3,
  "name": "LINE Pay",
  "imageUrl": null,
  "color": "hsl(140,70%,55%)",
  "aliases": "LINEPAY",
  "note": null,
  "transactionCount": 18,
  "eventCount": 2
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此支付方式 |
| 409 | `DUPLICATE_NAME` | 名稱重複 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/tags/payment-methods/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"LINE Pay Money"}'
```

### `DELETE /api/tags/payment-methods/{id}` — 刪除支付方式

**認證**：登入 Session

使用此支付方式的交易會改為「未使用電子支付」。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | 支付方式 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此支付方式 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/tags/payment-methods/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## AI

Gemini 解析與搜尋（Session）。

### `GET /api/ai/models` — 可用的 Gemini 模型

**認證**：登入 Session

依目前金鑰向 Google 查詢（快取 1 小時）；失敗時回傳保底清單並標記 fallback。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `models` | object[] |  |
| `default` | string | 預設模型 |
| `fallback` | boolean | 是否為保底清單 |
| `cached` | boolean | 是否命中快取 |

```json
{
  "models": [
    {
      "name": "gemini-3.5-flash",
      "displayName": "Gemini 3.5 Flash",
      "description": "新世代均衡"
    }
  ],
  "default": "gemini-3.5-flash"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/ai/models' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/ai/parse-event` — AI 解析活動原文

**認證**：登入 Session

貼上銀行活動說明，回傳可直接帶入新增表單的欄位（cardNames / paymentMethodNames 為文字，前端再比對成 ID）。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `text` * | string | 活動原文（最多 8000 字） |
| `model` | string | （選填）模型 ID |

```json
{
  "text": "玉山 Pi 卡 10/1-12/31 綁定 LINE Pay 單筆滿 200 享 5% 回饋，每月上限 300 元，需登錄"
}
```

**回應 200**

```json
{
  "title": "玉山 Pi 卡 LINE Pay 5%",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "cashbackPercent": 5,
  "maxReward": 300,
  "minimumSpend": 200,
  "cycleType": "monthly",
  "cycleAnchorDay": 1,
  "cardNames": [
    "玉山 Pi 卡"
  ],
  "paymentMethodNames": [
    "LINE Pay"
  ],
  "requiresRegistration": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TEXT_REQUIRED` | 沒有文字 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 413 | `TEXT_TOO_LONG` | 超過 8000 字 |
| 502 | `AI_PARSE_FAILED` | AI 回傳非 JSON |
| 503 | `GEMINI_NOT_CONFIGURED` | 尚未設定 Gemini 金鑰 |

**範例**

```bash
curl -X POST 'https://你的網域/api/ai/parse-event' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"玉山 Pi 卡 10/1-12/31 綁定 LINE Pay 單筆滿 200 享 5% 回饋，每月上限 300 元，需登錄"}'
```

### `POST /api/ai/parse-merchants` — AI 整理商家關鍵字

**認證**：登入 Session

把商家清單或活動說明整理成精簡關鍵字陣列（商家限定 / 排除商家使用）。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `text` * | string | 文字（最多 4000 字） |
| `model` | string | （選填）模型 ID |

```json
{
  "text": "適用：全家便利商店（信義店）、7-ELEVEN、萊爾富"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `keywords` | string[] |  |

```json
{
  "keywords": [
    "全家",
    "7-ELEVEN",
    "萊爾富"
  ]
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TEXT_REQUIRED` | 沒有文字 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 413 | `TEXT_TOO_LONG` | 超過 4000 字 |
| 502 | `AI_PARSE_FAILED` | AI 回傳非 JSON |
| 503 | `GEMINI_NOT_CONFIGURED` | 尚未設定 Gemini 金鑰 |

**範例**

```bash
curl -X POST 'https://你的網域/api/ai/parse-merchants' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"適用：全家便利商店（信義店）、7-ELEVEN、萊爾富"}'
```

### `POST /api/ai/search-rewards` — AI 回饋搜尋

**認證**：登入 Session

用自然語言問「哪張卡最適合 OO」，AI 依已記錄的進行中活動推薦（結果快取 30 分鐘）。精確金額試算請改用「刷哪張」API。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `query` * | string | 查詢（最多 100 字） |
| `web` | boolean | 允許聯網補充（較慢） |
| `model` | string | （選填）模型 ID |

```json
{
  "query": "外送",
  "web": false
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `summary` | string | 摘要 |
| `noData` | boolean | 沒有相關方案 |
| `recommendations` | object[] |  |
| `refs` | object[] |  |
| `cached` | boolean | 命中快取 |

```json
{
  "summary": "外送推薦 CUBE 卡",
  "noData": false,
  "recommendations": [
    {
      "title": "CUBE + LINE Pay",
      "rewardText": "3%",
      "reason": "…",
      "eventIds": [
        7
      ],
      "cautions": [
        "每月上限 500"
      ],
      "checkUrl": null
    }
  ],
  "refs": [
    {
      "id": 7,
      "title": "CUBE LINE Pay 3%",
      "sourceUrl": null
    }
  ],
  "cached": false
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `QUERY_REQUIRED` | 沒有查詢 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 413 | `QUERY_TOO_LONG` | 超過 100 字 |
| 502 | `AI_SEARCH_FAILED` | AI 回傳非 JSON |
| 503 | `GEMINI_NOT_CONFIGURED` | 尚未設定 Gemini 金鑰 |

**範例**

```bash
curl -X POST 'https://你的網域/api/ai/search-rewards' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"query":"外送","web":false}'
```

### `GET /api/ai/keys` — 列出 Gemini 金鑰

**認證**：登入 Session

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰 |
| `isActive` | boolean | 是否為使用中的金鑰 |
| `createdAt` | datetime | 建立時間 |

```json
[
  {
    "id": 1,
    "name": "個人 Gemini",
    "keyMask": "AIza…k9Qw",
    "isActive": true,
    "createdAt": "2026-10-01T00:00:00.000Z"
  }
]
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/api/ai/keys' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

### `POST /api/ai/keys` — 新增 Gemini 金鑰

**認證**：登入 Session

以 AES-256-GCM 加密儲存。第一把或 makeActive=true 時設為使用中。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` * | string | 名稱 |
| `key` * | string | Gemini API Key |
| `makeActive` | boolean | 設為使用中 |

```json
{
  "name": "個人 Gemini",
  "key": "AIza...",
  "makeActive": true
}
```

**回應 201**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰 |
| `isActive` | boolean | 是否為使用中的金鑰 |
| `createdAt` | datetime | 建立時間 |

```json
{
  "id": 1,
  "name": "個人 Gemini",
  "keyMask": "AIza…k9Qw",
  "isActive": true,
  "createdAt": "2026-11-15T00:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `NAME_REQUIRED` | 沒有名稱 |
| 400 | `KEY_REQUIRED` | 沒有金鑰 |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X POST 'https://你的網域/api/ai/keys' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"個人 Gemini","key":"AIza...","makeActive":true}'
```

### `PUT /api/ai/keys/{id}` — 改名 / 設為使用中

**認證**：登入 Session

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | AI 金鑰 ID |

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `name` | string | 新名稱 |
| `isActive` | boolean | true=設為使用中 |

```json
{
  "isActive": true
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 金鑰 ID |
| `name` | string | 名稱 |
| `keyMask` | string | 遮罩後的金鑰 |
| `isActive` | boolean | 是否為使用中的金鑰 |
| `createdAt` | datetime | 建立時間 |

```json
{
  "id": 1,
  "name": "個人 Gemini",
  "keyMask": "AIza…k9Qw",
  "isActive": true,
  "createdAt": "2026-11-15T00:00:00.000Z"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此金鑰 |

**範例**

```bash
curl -X PUT 'https://你的網域/api/ai/keys/1' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"isActive":true}'
```

### `DELETE /api/ai/keys/{id}` — 刪除 Gemini 金鑰

**認證**：登入 Session

刪掉使用中的金鑰時，自動改用下一把。

**參數**

| 名稱 | 位置 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` * | path | integer | AI 金鑰 ID |

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |
| 404 | `NOT_FOUND` | 找不到此金鑰 |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/ai/keys/1' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 推播

FCM 裝置註冊（Session）。

### `POST /api/fcm/token` — 註冊裝置推播 Token

**認證**：登入 Session

前端取得 FCM token 後呼叫；同一 token 重送會更新擁有者與裝置資訊。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `token` * | string | FCM registration token |
| `deviceInfo` | string | 裝置描述 |

```json
{
  "token": "fcm-token…",
  "deviceInfo": "iPhone Safari"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `created` | boolean | 是否為新 token |

```json
{
  "ok": true,
  "created": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TOKEN_REQUIRED` | 沒有 token |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X POST 'https://你的網域/api/fcm/token' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"token":"fcm-token…","deviceInfo":"iPhone Safari"}'
```

### `DELETE /api/fcm/token` — 移除裝置推播 Token

**認證**：登入 Session

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `token` * | string | FCM registration token |

```json
{
  "token": "fcm-token…"
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `TOKEN_REQUIRED` | 沒有 token |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X DELETE 'https://你的網域/api/fcm/token' \
  -H 'Cookie: session=<登入後的 session cookie>' \
  -H 'Content-Type: application/json' \
  -d '{"token":"fcm-token…"}'
```

## 登入

Firebase 登入與 Session。

### `POST /auth/sessionLogin` — 以 Firebase ID Token 換取 Session Cookie

**認證**：公開

前端用 Firebase Web SDK 登入後，把 5 分鐘內取得的 ID Token 傳來，伺服器回寫 HttpOnly `session` Cookie（預設 5 天）。之後所有 Session 類 API 都靠這個 Cookie 認證。

**Request body**（JSON）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `idToken` * | string | Firebase ID Token |

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 400 | `MISSING_ID_TOKEN` | 沒有帶 idToken |
| 401 | `INVALID_ID_TOKEN` | Token 無效 |
| 401 | `RECENT_LOGIN_REQUIRED` | Token 超過 5 分鐘，請重新登入 |
| 500 | `FIREBASE_NOT_CONFIGURED` | 伺服器未設定 Firebase |

**範例**

```bash
curl -X POST 'https://你的網域/auth/sessionLogin' \
  -H 'Content-Type: application/json' \
  -d '{"idToken":"eyJhbGciOiJSUzI1NiIs..."}'
```

### `POST /auth/logout` — 登出

**認證**：公開

清除 Session Cookie 並撤銷 Firebase refresh token。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | 固定為 true |

```json
{
  "ok": true
}
```

**範例**

```bash
curl -X POST 'https://你的網域/auth/logout'
```

### `GET /auth/me` — 目前登入者

**認證**：登入 Session

回傳目前 Session 對應的本地使用者。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 使用者 ID |
| `email` | string \| null | Email |
| `displayName` | string \| null | 顯示名稱 |

```json
{
  "id": 1,
  "email": "me@example.com",
  "displayName": "me@example.com"
}
```

**錯誤**

| HTTP | error | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 Session 過期（請重新登入） |

**範例**

```bash
curl -X GET 'https://你的網域/auth/me' \
  -H 'Cookie: session=<登入後的 session cookie>'
```

## 系統

健康檢查、PWA 與文件。

### `GET /healthz` — 健康檢查

**認證**：公開

確認服務存活（監控用）。

**回應 200**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `ok` | boolean | true |
| `ts` | integer | 伺服器時間 epoch ms |

```json
{
  "ok": true,
  "ts": 1763182800000
}
```

**範例**

```bash
curl -X GET 'https://你的網域/healthz'
```

### `GET /manifest.webmanifest` — PWA Manifest

**認證**：公開

安裝為 App 用的 Web App Manifest，start_url / scope 會依 BASE_URL 自動調整。

**回應 200**

```json
{
  "name": "MyCashback 回饋管家",
  "short_name": "MyCashback",
  "start_url": "/"
}
```

**範例**

```bash
curl -X GET 'https://你的網域/manifest.webmanifest'
```

### `GET /firebase-messaging-sw.js` — Service Worker

**認證**：公開

離線快取與 FCM 推播的 Service Worker（JavaScript）。`/sw.js` 為同一檔案的別名。

**回應 200**

```json
/* service worker */
```

**範例**

```bash
curl -X GET 'https://你的網域/firebase-messaging-sw.js'
```

### `GET /sw.js` — Service Worker（別名）

**認證**：公開

同 `/firebase-messaging-sw.js`。

**回應 200**

```json
/* service worker */
```

**範例**

```bash
curl -X GET 'https://你的網域/sw.js'
```

### `GET /api/docs/openapi.json` — 取得 OpenAPI 規格

**認證**：公開

本文件的機器可讀版本（OpenAPI 3.0），可匯入 Postman / Insomnia / Swagger Editor 產生程式碼。

**回應 200**

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "MyCashback API"
  }
}
```

**範例**

```bash
curl -X GET 'https://你的網域/api/docs/openapi.json'
```
