# MyCashback 回饋管家

手機優先的信用卡回饋管理工具：記錄活動與交易、即時算出「本期還能拿多少」、結帳前告訴你**刷哪張最划算**，並核對銀行實際入帳有沒有少給。Node.js + Express + MySQL（Sequelize）+ Tailwind，可安裝為 PWA。

## 功能

| | |
|---|---|
| **首頁總覽** | 本期應得 / 還可拿的回饋、本月刷卡、待辦提醒（待登錄、即將結束還沒拿滿、本期快重置、累積門檻未達、點數到期），一次 API 取得 |
| **刷哪張** | 輸入金額（與商家），依每個進行中活動的本期已刷金額、上限、門檻、限定/排除商家計算「這筆能多拿多少」，多個活動自動疊加；一鍵「用這張，記下這筆」 |
| **回饋活動** | 百分比 / 固定回饋、每期上限、**單筆門檻或本期累積門檻**、每月 / 每週 / 每兩週重置、指定卡片與支付、限定 / 排除商家、捨入與逐筆/加總計算、**需登錄追蹤**、一鍵複製活動、AI 解析活動原文 |
| **核對入帳** | 本期 / 上一期 / 本月 / 上月 / 自訂區間的應得回饋與計入、排除明細；**記錄實際入帳**並自動比對差額 |
| **交易紀錄** | 依日分組與每日小計、篩選合計、手動記一筆（記住上次用的卡、可帶目前位置）、消費地圖 |
| **點數** | 餘額時間軸、獲得 / 使用 / 校正、每點價值換算總價值、到期提醒 |
| **外部串接** | API 金鑰：記帳系統回報交易（冪等、批次、依外部編號更新/刪除、卡片別名與末四碼比對）、查詢刷哪張 / 總覽 / 活動 / 交易 / 點數 |
| **提醒推播** | 每天 21:00（APP_TIMEZONE）推播需要注意的事項（需在「設定」開啟） |

## 計算規則（重點）

計算核心在 `services/rewardEngine.js`（純函式、無資料庫，單元測試完整覆蓋）：

- **時區**：所有日期以 `APP_TIMEZONE`（預設 `Asia/Taipei`）計算，伺服器跑在 UTC 也不會把凌晨的消費算到上個月。
- **週期**：每月 N 號重置（29~31 號在小月取月底）、每週指定星期、每兩週以活動開始那週起算；週期會被活動期間截斷。
- **金額**：以 BigInt 精確十進位計算，依活動的四捨五入 / 無條件捨去與小數位數處理，沒有浮點誤差。
- **條件順序**：排除商家 → 限定商家 → 單筆門檻 → 卡片與支付方式；累積門檻（cycleTotal）未達前回饋為 0。
- **再刷多少滿額**：依捨入方式反推最小所需金額（例如 5%、上限 300、四捨五入 → 累積 5,990 即滿額）。
- **點數「校正」**：記錄當下的實際餘額作為錨點，之後補登更早的紀錄也不會改變它。

## API 文件

每個 API 都有完整串接說明，三種形式同一來源（`docs/openapi.js`）：

- App 內：**設定 → API 串接文件**（`/developers`，含 curl 範例、iPhone 捷徑做法）
- 機器可讀：`GET /api/docs/openapi.json`（OpenAPI 3.0，可匯入 Postman / Swagger）
- Markdown：[`docs/API.md`](docs/API.md)（`npm run docs:api` 產生）

`test/integration/apiDocs.test.js` 會走訪實際路由，任何沒寫文件的 API 都會讓測試失敗。

## 架構

```
server.js            啟動：時區 → 連線 → 自動 schema 升級 → sync → listen → 推播排程
app.js               Express app factory（測試可注入假的登入驗證）
config/              database / firebase / logger / crypto / timezone
services/
  rewardEngine.js        計算核心（週期、金額、條件、刷哪張）
  cashbackCycleService.js 一次查詢載入多個活動所需交易
  schemaMigrations.js    冪等的新增欄位 / 資料回填（啟動時自動執行）
  notificationCron.js    每日推播
controllers/ routes/ models/
docs/                openapi.js（API 規格）、viewModel.js、API.md
views/ public/       EJS 頁面、design system（public/css/tailwind.css）、前端 JS
test/unit            計算核心
test/integration     API（真實 MySQL/MariaDB）、文件覆蓋、資料庫升級
test/e2e             Playwright 手機版操作流程
```

## 開發

```bash
cp .env.example .env    # 填入 DB、Firebase、（選填）Gemini / Google Maps
npm install
npm run build           # PWA icons + Tailwind
npm run dev             # tailwind watch + nodemon
```

不想接 Firebase 也能看畫面：`npm run dev:demo`（使用測試資料庫、自動灌入範例資料，於 http://127.0.0.1:3100 ，瀏覽器加上 cookie `testuser=demo`）。

## 測試

```bash
npm test                # 單元 + 整合（需要 MySQL/MariaDB，見 .env.example 的 TEST_DB_*；資料庫會被清空）
npm run test:e2e        # Playwright 手機版 E2E（另用 mycashback_e2e 資料庫）
npm run docs:check      # 確認 docs/API.md 與規格同步
```

## 部署

推送到 `main` 時 GitHub Actions 先在 MySQL 8 上跑 `docs:check` 與 `npm test`，**通過後**才 SSH 到主機：`git pull → npm install → build:css → db:migrate → pm2 restart`。資料庫升級只會新增欄位與回填，可重複執行；伺服器啟動時也會自動執行一次。

- `BASE_URL=/mycashback` 可掛在子路徑，頁面、API、靜態檔、Manifest、Service Worker 都會跟著調整。
- 金鑰一律放 `.env`；Session Cookie 為 HttpOnly + SameSite=Lax（production 加 Secure）；完整卡號與 AI 金鑰以 AES-256-GCM 加密；API 金鑰只存 SHA-256。
