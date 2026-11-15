(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;
  const $ = (id) => document.getElementById(id);

  // ─── Counts ───
  A.loadTags().then(({ cards, pms }) => { $('tagCount').textContent = `${cards.length} 張卡・${pms.length} 種支付`; }).catch(() => {});

  // ─── Push ───
  function pushStatus() {
    if (!A.push.supported()) { $('pushStatus').innerHTML = '<span class="text-amber-600">此裝置或伺服器尚未支援推播（iPhone 需先加入主畫面並用 iOS 16.4+）</span>'; $('pushBtn').disabled = true; return; }
    const p = Notification.permission;
    $('pushStatus').innerHTML = p === 'granted' ? '<span class="text-emerald-600">✓ 這台裝置已開啟</span>' : (p === 'denied' ? '<span class="text-rose-600">已被瀏覽器封鎖，請到瀏覽器設定允許通知</span>' : '<span class="muted">尚未開啟</span>');
    $('pushBtn').textContent = p === 'granted' ? '重新註冊這台裝置' : '在這台裝置開啟推播';
  }
  $('pushBtn').addEventListener('click', async () => {
    A.setLoading($('pushBtn'), true, '設定中');
    try { await A.push.enable(); A.toast('已開啟推播'); } catch (err) { A.toast(err.message, { type: 'error' }); } finally { A.setLoading($('pushBtn'), false); pushStatus(); }
  });
  pushStatus();

  // ─── API keys ───
  async function loadApiKeys() {
    try {
      const keys = await A.get('/transactions/api-keys');
      $('apiKeys').innerHTML = keys.length ? `<div class="list rounded-xl border border-slate-100 dark:border-slate-800">${keys.map((k) => `
        <div class="row ${k.isActive ? '' : 'opacity-60'}">
          <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${esc(k.name)}${k.isActive ? '' : '（停用）'}</span><span class="block font-mono text-[12px] muted">${esc(k.keyMask)}・${k.lastUsedAt ? `最後使用 ${F.datetime(k.lastUsedAt)}` : '尚未使用'}</span></span>
          <button type="button" class="btn btn-ghost btn-xs" data-key-toggle="${k.id}" data-active="${k.isActive}">${k.isActive ? '停用' : '啟用'}</button>
          <button type="button" class="icon-btn !h-8 !w-8 text-rose-600" data-key-del="${k.id}" aria-label="刪除">${icon('trash', 'i-sm')}</button>
        </div>`).join('')}</div>` : '<div class="text-sm muted">尚未建立金鑰</div>';
    } catch (err) { $('apiKeys').innerHTML = A.errorState(err); }
  }
  $('apiKeyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    A.setLoading(btn, true);
    try {
      const k = await A.send('POST', '/transactions/api-keys', { name: e.target.name.value });
      e.target.reset();
      $('newTokenValue').textContent = k.token;
      $('newToken').hidden = false;
      loadApiKeys();
    } catch (err) { A.toast(err.message, { type: 'error' }); } finally { A.setLoading(btn, false); }
  });
  $('copyToken').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('newTokenValue').textContent); A.toast('已複製金鑰'); } catch (_) { A.toast('請長按金鑰手動複製', { type: 'error' }); }
  });
  $('apiKeys').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-key-toggle]');
    const d = e.target.closest('[data-key-del]');
    try {
      if (t) { await A.send('PUT', `/transactions/api-keys/${t.dataset.keyToggle}`, { isActive: t.dataset.active !== 'true' }); loadApiKeys(); }
      if (d && await A.confirm('刪除後，使用這把金鑰的串接會立即失效。', { title: '刪除金鑰？', okText: '刪除', danger: true })) {
        await A.send('DELETE', `/transactions/api-keys/${d.dataset.keyDel}`);
        loadApiKeys();
      }
    } catch (err) { A.toast(err.message, { type: 'error' }); }
  });

  // ─── AI keys ───
  async function loadAiKeys() {
    try {
      const keys = await A.get('/ai/keys');
      $('aiKeys').innerHTML = keys.length ? `<div class="list rounded-xl border border-slate-100 dark:border-slate-800">${keys.map((k) => `
        <div class="row">
          <span class="min-w-0 flex-1"><span class="flex items-center gap-1.5 font-semibold"><span class="truncate">${esc(k.name)}</span>${k.isActive ? '<span class="badge badge-green">使用中</span>' : ''}</span><span class="block font-mono text-[12px] muted">${esc(k.keyMask)}</span></span>
          ${k.isActive ? '' : `<button type="button" class="btn btn-ghost btn-xs" data-ai-use="${k.id}">使用</button>`}
          <button type="button" class="icon-btn !h-8 !w-8" data-ai-rename="${k.id}" data-name="${esc(k.name)}" aria-label="重新命名">${icon('pencil', 'i-sm')}</button>
          <button type="button" class="icon-btn !h-8 !w-8 text-rose-600" data-ai-del="${k.id}" aria-label="刪除">${icon('trash', 'i-sm')}</button>
        </div>`).join('')}</div>` : '<div class="text-sm muted">尚未設定（若伺服器有預設金鑰仍可使用 AI）</div>';
    } catch (err) { $('aiKeys').innerHTML = A.errorState(err); }
  }
  $('aiKeyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    A.setLoading(btn, true);
    try {
      await A.send('POST', '/ai/keys', { name: e.target.name.value, key: e.target.key.value, makeActive: true });
      e.target.reset();
      A.toast('已新增 AI 金鑰');
      loadAiKeys();
    } catch (err) { A.toast(err.message, { type: 'error' }); } finally { A.setLoading(btn, false); }
  });
  $('aiKeys').addEventListener('click', async (e) => {
    const u = e.target.closest('[data-ai-use]');
    const r = e.target.closest('[data-ai-rename]');
    const d = e.target.closest('[data-ai-del]');
    try {
      if (u) await A.send('PUT', `/ai/keys/${u.dataset.aiUse}`, { isActive: true });
      if (r) {
        const name = await A.prompt('重新命名', r.dataset.name);
        if (!name) return;
        await A.send('PUT', `/ai/keys/${r.dataset.aiRename}`, { name });
      }
      if (d) {
        if (!(await A.confirm('刪除這把 AI 金鑰？', { okText: '刪除', danger: true }))) return;
        await A.send('DELETE', `/ai/keys/${d.dataset.aiDel}`);
      }
      if (u || r || d) loadAiKeys();
    } catch (err) { A.toast(err.message, { type: 'error' }); }
  });

  loadApiKeys();
  loadAiKeys();
})();
