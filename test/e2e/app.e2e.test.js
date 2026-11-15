'use strict';

/**
 * End-to-end UI tests on a phone viewport (Playwright + Chromium) against
 * the seeded dev server. Run with `npm run test:e2e` (needs the test DB and
 * a Playwright install; skipped otherwise).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');

let playwright = null;
try { playwright = require('playwright'); } catch (_) {
  try { playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); } catch (__) { /* not installed */ }
}

const PORT = 3150 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let browser;
let ready = false;

test.before(async () => {
  if (!playwright) return;
  server = spawn(process.execPath, [path.join(__dirname, '../support/devServer.js'), String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TEST_DB_NAME: process.env.E2E_DB_NAME || 'mycashback_e2e' }
  });
  ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('ready')) { clearTimeout(t); resolve(true); } });
    server.on('exit', () => resolve(false));
  });
  if (ready) browser = await playwright.chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});

async function phone(t, { dark = false, desktop = false } = {}) {
  if (!playwright || !ready) { t.skip('playwright or test database not available'); return null; }
  const ctx = await browser.newContext({
    viewport: desktop ? { width: 1280, height: 860 } : { width: 390, height: 844 },
    isMobile: !desktop, hasTouch: !desktop, colorScheme: dark ? 'dark' : 'light',
    locale: 'zh-TW', timezoneId: 'Asia/Taipei'
  });
  await ctx.addCookies([{ name: 'testuser', value: 'demo', url: BASE }]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|gstatic|firebase/i.test(m.text())) page.errors.push(m.text()); });
  return page;
}

const PAGES = ['/', '/recommend?amount=1000&merchant=全聯', '/cashback', '/cashback?tab=audit', '/transactions', '/points', '/settings', '/tags', '/developers', '/transactions/map'];

test('every page renders without JS errors or horizontal scrolling (light / dark / desktop)', async (t) => {
  for (const mode of [{}, { dark: true }, { desktop: true }]) {
    const page = await phone(t, mode);
    if (!page) return;
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${p} overflows horizontally (${JSON.stringify(mode)})`);
      assert.ok(await page.locator('h1').first().isVisible(), `${p} has a visible title`);
    }
    assert.deepEqual(page.errors, [], `console errors: ${page.errors.join('\n')}`);
    await page.context().close();
  }
});

test('dashboard shows live numbers and resolves an attention item', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await assert.doesNotReject(page.waitForFunction(() => /NT\$\d/.test(document.getElementById('heroReward').textContent)));
  const before = await page.locator('#attentionList .row').count();
  assert.ok(before >= 3);
  await page.locator('#attentionList [data-exp]').first().click();
  await page.locator('.toast').waitFor();
  assert.match(await page.locator('.toast').textContent(), /已使用/);
  await page.waitForFunction((n) => document.querySelectorAll('#attentionList .row').length === n - 1, before);
  await page.context().close();
});

test('刷哪張: ranks options and records the purchase in one tap', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/recommend', { waitUntil: 'networkidle' });
  await page.fill('#amount', '800');
  await page.fill('#merchant', '屈臣氏');
  await page.locator('#results article').first().waitFor();
  const first = await page.locator('#results article').first().textContent();
  assert.match(first, /最划算/);
  await page.locator('#results [data-record="0"]').click();
  await page.locator('.toast').waitFor();
  assert.match(await page.locator('.toast').textContent(), /已記錄/);
  await page.goto(BASE + '/transactions', { waitUntil: 'networkidle' });
  assert.match(await page.locator('#txnList').textContent(), /屈臣氏/);
  await page.context().close();
});

test('campaign: create via form, open detail, mark registered, back button closes the sheet', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/cashback', { waitUntil: 'networkidle' });
  await page.click('#newEventBtn');
  await page.locator('#eventSheet').waitFor({ state: 'visible' });
  await page.fill('#eventForm [name=title]', 'E2E 測試活動 6%');
  await page.fill('#eventForm [name=cashbackPercent]', '6');
  await page.fill('#eventForm [name=maxReward]', '120');
  await page.locator('#cardPick [data-pick="card"]').first().click();
  await page.locator('#eventForm label:has(#reqReg)').click();
  await page.click('#saveEventBtn');
  await page.locator('#eventSheet').waitFor({ state: 'hidden' });
  const card = page.locator('[data-open-event]', { hasText: 'E2E 測試活動 6%' });
  await card.waitFor();
  assert.match(await card.textContent(), /需要登錄/);
  await card.locator('[data-reg]').click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[data-open-event]')).find((x) => x.textContent.includes('E2E 測試活動 6%')).textContent.includes('需要登錄'));
  await card.click();
  await page.locator('#detailSheet').waitFor({ state: 'visible' });
  assert.match(await page.locator('#detailSheet').textContent(), /已登錄/);
  await page.goBack();
  await page.locator('#detailSheet').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).pathname, '/cashback');
  await page.context().close();
});

test('transactions: add from the FAB, then edit and delete it', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/transactions', { waitUntil: 'networkidle' });
  await page.click('#fab');
  await page.locator('#txnSheet').waitFor({ state: 'visible' });
  await page.fill('#txnForm [name=amount]', '432');
  await page.fill('#txnForm [name=note]', 'E2E 便當店');
  await page.click('#saveTxnBtn');
  await page.locator('#txnSheet').waitFor({ state: 'hidden' });
  const row = page.locator('[data-txn]', { hasText: 'E2E 便當店' });
  await row.waitFor();
  assert.match(await row.textContent(), /NT\$432/);
  await row.click();
  await page.fill('#txnForm [name=amount]', '500');
  await page.click('#saveTxnBtn');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-txn]')).some((r) => r.textContent.includes('E2E 便當店') && r.textContent.includes('NT$500')));
  await page.locator('[data-txn]', { hasText: 'E2E 便當店' }).click();
  await page.click('#deleteTxnBtn');
  await page.click('#confirmSheet [data-act="ok"]');
  await page.waitForFunction(() => !document.body.textContent.includes('E2E 便當店'));
  await page.context().close();
});

test('points: record earned points and see the balance update', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/points', { waitUntil: 'networkidle' });
  await page.locator('[data-point]', { hasText: 'LINE Points' }).click();
  await page.locator('#pdBalance').filter({ hasText: /\d/ }).waitFor();
  const before = Number((await page.locator('#pdBalance').textContent()).replace(/,/g, ''));
  await page.click('[data-change="earn"]');
  await page.fill('#historyForm [name=amount]', '40');
  await page.click('#historySheet [type=submit]');
  await page.waitForFunction((b) => Number(document.getElementById('pdBalance').textContent.replace(/,/g, '')) === b + 40, before);
  await page.context().close();
});

test('settings: create an API key and use it to report a transaction', async (t) => {
  const page = await phone(t);
  if (!page) return;
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.fill('#apiKeyForm [name=name]', 'E2E 記帳');
  await page.click('#apiKeyForm button');
  await page.locator('#newToken').waitFor({ state: 'visible' });
  const token = (await page.locator('#newTokenValue').textContent()).trim();
  assert.match(token, /^mcb_/);
  const res = await fetch(BASE + '/api/ingest/card-transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardName: 'Pi卡', amount: 77, note: 'E2E API 回報', externalRef: 'e2e-1' })
  });
  assert.equal(res.status, 201);
  await page.goto(BASE + '/transactions', { waitUntil: 'networkidle' });
  assert.match(await page.locator('#txnList').textContent(), /E2E API 回報/);
  await page.context().close();
});
