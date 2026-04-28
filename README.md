# Points & Cashback Hub

Mobile-first 點數與回饋活動管理中樞 — 單體式 Node.js + Express.js 應用，整合 Firebase Auth、MySQL (Sequelize)、Google Gemini API、Tailwind CSS 與 PWA。

## ✨ Features

- **點數時間軸** — 每筆獲得/花費皆有歷史紀錄、可修改與刪除，餘額自動重新計算。
- **回饋活動管理** — 多對多綁定（卡片 ↔ 支付方式），支援標籤搜尋與「進行中 / 已結束」狀態切換。
- **AI 解析** — 貼上活動原文，由 Gemini 直接萃取欄位、自動帶入表單。
- **Firebase Auth** — Email/Password、Google 登入；以 HttpOnly Session Cookie 守護所有頁面與 API。
- **PWA** — 提供 manifest + Service Worker，可從 Chrome「安裝為應用程式」並支援離線殼層。
- **BASE_URL 子路徑部署** — 改一個環境變數，整站（HTML / API / 靜態 / Manifest / SW）自動切換到 `/myApp` 之類路徑。

## 🧱 架構

```
server.js           - Express 進入點，掛載 BASE_URL 路由
config/
  database.js       - Sequelize MySQL 連線
  firebase.js       - Firebase Admin SDK 初始化
  logger.js         - winston + daily-rotate-file
middleware/
  authMiddleware.js - Session Cookie 驗證 + 自動建立本地 User
  baseUrl.js        - 注入 url() / asset() 給 EJS
models/             - Sequelize 模型與多對多關聯
controllers/        - 業務邏輯 (auth / point / cashback / tag / ai)
routes/             - 對應的 Express Router
views/              - EJS 樣板
public/
  css/tailwind.css  - Tailwind 入口
  js/               - 前端模組 (login / dashboard / points / cashback / tags / common)
  service-worker.js - PWA SW
  icons/            - PWA icons (build:icons 產生)
scripts/
  generate-icons.js - 純 JS 生成 PNG icons (無原生依賴)
ecosystem.config.js - PM2 設定
```

## 🚀 快速開始

### 1. 環境準備

```bash
cp .env.example .env
# 編輯 .env 填入：
#   - SESSION_SECRET (隨機 32+ 字元)
#   - DB_HOST / DB_NAME / DB_USER / DB_PASSWORD
#   - FIREBASE_SERVICE_ACCOUNT_PATH (從 Firebase Console 下載)
#   - FIREBASE_API_KEY / FIREBASE_AUTH_DOMAIN / FIREBASE_PROJECT_ID / FIREBASE_APP_ID
#   - GEMINI_API_KEY
```

### 2. 安裝依賴與建置

```bash
npm install
npm run build         # 生成 PWA icons + 編譯 Tailwind
```

### 3. 建立資料庫

在本地 MySQL 中：
```sql
CREATE DATABASE mycashback CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

啟動後 Sequelize 會自動建立 schema (development 模式下使用 `sync({ alter: true })`)。

### 4. 啟動

```bash
# 開發
npm run dev           # 同步監看 tailwind + nodemon

# 生產 (PM2)
npm run build
pm2 start ecosystem.config.js
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

## 📲 安裝為 Chrome WebApp

1. 用 Chrome 打開部署網址（必須為 HTTPS 或 `http://localhost`）。
2. 登入後，網址列右側會出現「安裝」圖示，或開啟「⋮ → 安裝 Cashback Hub」。
3. 安裝後可從桌面 / 啟動台直接開啟，獨立視窗運作。

PWA 的 manifest 會根據 `BASE_URL` 自動產生正確的 `start_url` 與 `scope`。

## 🌐 BASE_URL 子路徑部署

預設 `BASE_URL=` 表示根目錄。若要部署到 `https://example.com/myApp/`：

```env
BASE_URL=/myApp
```

伺服器會把 router 掛載到 `/myApp/*`，而 EJS 的 `url('/foo')` 與 `asset('/css/styles.css')` 會自動加上前綴；前端 fetch 全經由 `App.api()` / `App.url()` helper，亦會帶上前綴。Service Worker 的 scope 也會跟著移動。

## 🔌 API 列表 (要登入)

| Method | Path | 說明 |
|---|---|---|
| GET    | /api/points                          | 列出所有點數 |
| POST   | /api/points                          | 新增點數 (multipart 可上傳圖片) |
| PUT    | /api/points/:id                      | 更新點數資訊 |
| DELETE | /api/points/:id                      | 刪除點數 |
| GET    | /api/points/:id/histories            | 時間軸 + 月度統計 |
| POST   | /api/points/:id/histories            | 新增紀錄 (set / earn / spend) |
| PUT    | /api/points/:id/histories/:hid       | 更新紀錄並重算餘額 |
| DELETE | /api/points/:id/histories/:hid       | 刪除紀錄並重算餘額 |
| GET    | /api/cashback?status=&q=&cardId=&paymentMethodId= | 搜尋活動 |
| POST   | /api/cashback                        | 新增活動 |
| PUT    | /api/cashback/:id                    | 更新活動 |
| DELETE | /api/cashback/:id                    | 刪除活動 |
| GET    | /api/tags/cards / payment-methods    | 列出標籤 |
| POST   | /api/tags/cards / payment-methods    | 新增 |
| PUT/DELETE | /api/tags/cards/:id ...          | 更新 / 刪除 |
| POST   | /api/ai/parse-event                  | Gemini 解析活動原文 |
| POST   | /auth/sessionLogin                   | 以 Firebase ID Token 換 Session Cookie |
| POST   | /auth/logout                         | 撤銷並清除 Session |

## 🔐 安全注意事項

- 所有金鑰都由 `.env` 讀取，`.gitignore` 已排除 `firebase-service-account.json`。
- Session Cookie 為 `HttpOnly + SameSite=Lax`，production 自動標記 `Secure`。
- 上傳圖片限制 4MB，僅允許 image/* MIME。
- 所有 API 與頁面均經 `authMiddleware`，無 cookie 自動 401 / 重導 `/login`。

## 📝 開發備忘

- 開發時 Sequelize 會自動 `alter` schema；上 production 前請改採 migration。
- Tailwind 一律以 npm 編譯，**未引入任何 CDN**。
- Logs 寫入 `logs/`，每日 rotate 14 天；error log 保留 30 天。
- PM2 可搭配 `pm2-logrotate`（見 `ecosystem.config.js` 中註記）。
