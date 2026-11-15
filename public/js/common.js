/* MyCashback client UI kit — shared by every page (window.App). */
(function () {
  'use strict';

  const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.baseUrl) || '';
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  // ─── URLs & fetch ───
  function url(path) {
    if (!path) path = '/';
    if (!path.startsWith('/')) path = '/' + path;
    return baseUrl + path;
  }
  function api(path) { return url('/api' + (path.startsWith('/') ? path : '/' + path)); }
  function asset(p) { return p ? url(p) : ''; }

  async function jsonFetch(path, options = {}) {
    const opts = Object.assign({ method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } }, options);
    opts.headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (_) {
      const e = new Error('網路連線失敗，請稍後再試');
      e.network = true;
      throw e;
    }
    if (res.status === 401) {
      window.location.href = url('/login');
      throw new Error('請重新登入');
    }
    let data = null;
    if ((res.headers.get('content-type') || '').includes('application/json')) data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data && data.error;
      err.body = data;
      throw err;
    }
    return data;
  }
  const get = (p) => jsonFetch(api(p));
  const send = (method, p, body) => jsonFetch(api(p), { method, body });

  // ─── Escaping ───
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || '')) ? String(u) : null;
  }

  // ─── Formatting ───
  function num(n, maxFrac = 2) {
    if (n === null || n === undefined || n === '') return '—';
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('zh-TW', { maximumFractionDigits: maxFrac });
  }
  function money(n, opts = {}) {
    if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    const sign = opts.sign && v > 0 ? '+' : (v < 0 ? '−' : '');
    return `${sign}NT$${num(Math.abs(v), opts.decimals ?? 2)}`;
  }
  const REWARD_UNIT = { cash: '元', point: '點', coupon: '', other: '' };
  function reward(n, type, opts = {}) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    if (!type || type === 'cash') return money(n, opts);
    const v = Number(n);
    return `${opts.sign && v > 0 ? '+' : ''}${num(v)}${REWARD_UNIT[type] ? ' ' + REWARD_UNIT[type] : ''}`;
  }
  function toDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
      const [y, m, day] = String(d).split('-').map(Number);
      return new Date(y, m - 1, day);
    }
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? null : x;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function date(d, opts = {}) {
    const x = toDate(d);
    if (!x) return '—';
    const now = new Date();
    const y = x.getFullYear() !== now.getFullYear() || opts.year ? `${x.getFullYear()}/` : '';
    return `${y}${x.getMonth() + 1}/${x.getDate()}${opts.weekday ? ` (${WEEK[x.getDay()]})` : ''}`;
  }
  function time(d) {
    const x = toDate(d);
    return x ? `${pad(x.getHours())}:${pad(x.getMinutes())}` : '';
  }
  function datetime(d) { return `${date(d)} ${time(d)}`; }
  function dayKey(d) {
    const x = toDate(d);
    return x ? `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` : '';
  }
  function dayLabel(d) {
    const x = toDate(d);
    if (!x) return '';
    const today = new Date();
    const diff = Math.round((new Date(x.getFullYear(), x.getMonth(), x.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    if (diff === 0) return '今天';
    if (diff === -1) return '昨天';
    return date(x, { weekday: true });
  }
  /** value for <input type="date"> */
  function inputDate(d) {
    const x = toDate(d) || new Date();
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }
  /** value for <input type="datetime-local"> */
  function inputDateTime(d) {
    const x = toDate(d) || new Date();
    return `${inputDate(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }
  function daysLeftText(n) {
    if (n == null) return '無期限';
    if (n <= 0) return '已截止';
    if (n === 1) return '今天截止';
    return `剩 ${n} 天`;
  }

  // ─── Visual helpers ───
  function hashHue(name) {
    let h = 0;
    const s = String(name || '?');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function gradientFromName(name) {
    const hue = hashHue(name);
    return `linear-gradient(135deg, hsl(${hue},70%,58%), hsl(${(hue + 40) % 360},70%,45%))`;
  }
  function initialsFrom(name) { return String(name || '?').trim().slice(0, 2).toUpperCase() || '?'; }
  function icon(name, cls = '') { return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  function avatar(name, imageUrl, cls = '') {
    if (imageUrl) return `<span class="avatar ${cls}" style="background-image:url('${esc(asset(imageUrl))}')"></span>`;
    return `<span class="avatar ${cls}" style="background:${gradientFromName(name)}">${esc(initialsFrom(name))}</span>`;
  }
  /** Compact tag for a card or payment method. */
  function payTag(item, fallback) {
    if (!item) return fallback ? `<span class="pay-tag">${esc(fallback)}</span>` : '';
    const lead = item.imageUrl
      ? `<img src="${esc(asset(item.imageUrl))}" alt="" loading="lazy">`
      : `<span class="pay-dot" style="background:${esc(item.color || `hsl(${hashHue(item.name)},65%,55%)`)}"></span>`;
    return `<span class="pay-tag">${lead}<span class="truncate">${esc(item.name)}</span></span>`;
  }
  function rewardRateText(ev) {
    if (ev.cashbackPercent != null && Number(ev.cashbackPercent) > 0) return `${num(ev.cashbackPercent, 3)}%`;
    if (ev.cashbackFixed != null && Number(ev.cashbackFixed) > 0) return `+${reward(ev.cashbackFixed, ev.rewardType)}`;
    return '—';
  }
  function progressBar(pct, extra = '') {
    const v = Math.max(0, Math.min(100, Number(pct) || 0));
    const cls = v >= 100 ? 'is-full' : (v >= 80 ? 'is-warn' : '');
    return `<div class="progress ${cls} ${extra}" role="progressbar" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v.toFixed(1)}%"></span></div>`;
  }
  function skeletonRows(n = 3, h = 'h-20') {
    return Array.from({ length: n }, () => `<div class="skeleton ${h} mb-3"></div>`).join('');
  }
  function emptyState(iconName, title, sub = '', actionHtml = '') {
    return `<div class="empty">${icon(iconName)}<div class="font-semibold text-slate-700 dark:text-slate-200">${esc(title)}</div>${sub ? `<div class="mt-1">${esc(sub)}</div>` : ''}${actionHtml ? `<div class="mt-4">${actionHtml}</div>` : ''}</div>`;
  }
  function errorState(err, retryId) {
    return `<div class="empty">${icon('alert')}<div class="font-semibold text-rose-600">載入失敗</div><div class="mt-1">${esc(err && err.message)}</div>${retryId ? `<button class="btn btn-secondary btn-sm mt-4" id="${retryId}">${icon('refresh', 'i-sm')}重試</button>` : ''}</div>`;
  }

  // ─── Toast ───
  function toast(message, opts = {}) {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast' + (opts.type === 'error' ? ' toast-error' : '');
    el.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(opts.type === 'error' ? 'alert' : 'check-circle')}<span>${esc(message)}</span>`;
    wrap.innerHTML = '';
    wrap.appendChild(el);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.remove(), opts.duration || 2600);
  }

  // ─── Sheets (bottom sheet / dialog) with back-button support ───
  const stack = [];
  let ignorePop = 0;
  function lockScroll(on) { document.documentElement.style.overflow = on ? 'hidden' : ''; }
  function openSheet(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return null;
    if (!el.hidden && stack.includes(el.id)) return el;
    el.hidden = false;
    stack.push(el.id);
    lockScroll(true);
    try { history.pushState({ mcbSheet: el.id }, ''); } catch (_) { /* ignore */ }
    const body = el.querySelector('.sheet-body');
    if (body) body.scrollTop = 0;
    const panel = el.querySelector('.sheet');
    if (panel) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
    el.dispatchEvent(new CustomEvent('sheet:open'));
    return el;
  }
  function closeSheet(id, fromPop) {
    const target = id ? (typeof id === 'string' ? id : id.id) : stack[stack.length - 1];
    const idx = stack.lastIndexOf(target);
    if (idx < 0) return;
    stack.splice(idx, 1);
    const el = document.getElementById(target);
    if (el) {
      el.hidden = true;
      el.dispatchEvent(new CustomEvent('sheet:close'));
    }
    if (!stack.length) lockScroll(false);
    if (!fromPop && history.state && history.state.mcbSheet === target) {
      ignorePop += 1;
      history.back();
    }
  }
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop -= 1; return; }
    if (stack.length) closeSheet(stack[stack.length - 1], true);
  });
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) {
      const root = c.closest('.sheet-root');
      if (root) closeSheet(root.id);
    }
    const o = e.target.closest('[data-open]');
    if (o) openSheet(o.getAttribute('data-open'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) closeSheet();
  });

  /** Creates (or reuses) a sheet in #sheetHost. */
  function createSheet({ id, title = '', body = '', footer = '', size = '' }) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'sheet-root';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      (document.getElementById('sheetHost') || document.body).appendChild(el);
    }
    el.innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <div class="sheet ${size}">
        <div class="sheet-handle"></div>
        <div class="sheet-header"><h2 class="sheet-title">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="關閉">${icon('x')}</button></div>
        <div class="sheet-body">${body}</div>
        ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}
      </div>`;
    return el;
  }

  function confirmDialog(message, opts = {}) {
    return new Promise((resolve) => {
      const el = createSheet({
        id: 'confirmSheet',
        title: opts.title || '確認',
        body: `<p class="whitespace-pre-line text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">${esc(message)}</p>`,
        footer: `<button type="button" class="btn btn-secondary flex-1" data-act="cancel">取消</button>
                 <button type="button" class="btn ${opts.danger ? 'bg-rose-600 text-white' : 'btn-primary'} flex-1" data-act="ok">${esc(opts.okText || '確定')}</button>`
      });
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); };
      el.querySelector('[data-act="ok"]').onclick = () => { finish(true); closeSheet('confirmSheet'); };
      el.querySelector('[data-act="cancel"]').onclick = () => { finish(false); closeSheet('confirmSheet'); };
      el.addEventListener('sheet:close', () => finish(false), { once: true });
      openSheet(el);
    });
  }

  function promptDialog(title, value = '', opts = {}) {
    return new Promise((resolve) => {
      const el = createSheet({
        id: 'promptSheet',
        title,
        body: `<form id="promptForm"><input class="input" name="v" value="${esc(value)}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''} maxlength="${opts.maxLength || 120}" required></form>`,
        footer: `<button type="button" class="btn btn-secondary flex-1" data-close>取消</button><button type="submit" form="promptForm" class="btn btn-primary flex-1">確定</button>`
      });
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      el.querySelector('form').onsubmit = (e) => { e.preventDefault(); finish(e.target.v.value.trim() || null); closeSheet('promptSheet'); };
      el.addEventListener('sheet:close', () => finish(null), { once: true });
      openSheet(el);
      setTimeout(() => el.querySelector('input').focus(), 50);
    });
  }

  // ─── Buttons / forms ───
  function setLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = !!loading;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${text ? `<span>${esc(text)}</span>` : ''}`;
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
    }
  }
  function showError(el, message) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    if (message) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function setPressed(container, selector, value, attr = 'value') {
    container.querySelectorAll(selector).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));
  }

  // ─── Small persistent prefs (per device) ───
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mcb.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('mcb.' + k, JSON.stringify(v)); } catch (_) { /* ignore */ } }
  };

  // ─── Cached lookups ───
  let tagsPromise = null;
  function loadTags(force) {
    if (!tagsPromise || force) {
      tagsPromise = Promise.all([get('/tags/cards'), get('/tags/payment-methods')])
        .then(([cards, pms]) => ({ cards, pms }))
        .catch((e) => { tagsPromise = null; throw e; });
    }
    return tagsPromise;
  }

  // ─── App bar shadow on scroll ───
  const appbar = document.querySelector('.appbar');
  if (appbar) {
    const onScroll = () => appbar.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ─── Logout ───
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-logout]')) return;
    const ok = await confirmDialog('確定要登出嗎？', { okText: '登出' });
    if (!ok) return;
    try { await fetch(url('/auth/logout'), { method: 'POST', credentials: 'same-origin' }); } catch (_) { /* ignore */ }
    // Drop offline copies of personal pages on this device.
    try { if (window.caches) await Promise.all((await caches.keys()).filter((k) => k.startsWith('mcb-pages')).map((k) => caches.delete(k))); } catch (_) { /* ignore */ }
    window.location.href = url('/login');
  });

  // ─── Service worker + push ───
  function swRegistration() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register(url('/firebase-messaging-sw.js'), { scope: url('/') }).catch(() => null);
  }
  const swReady = document.body && document.body.dataset.auth === '1' ? swRegistration() : Promise.resolve(null);

  function pushSupported() {
    const cfg = window.FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.messagingSenderId && 'Notification' in window && 'serviceWorker' in navigator);
  }
  /** Gets an FCM token and registers it. Call from a user gesture to prompt. */
  async function enablePush({ prompt = true } = {}) {
    if (!pushSupported()) throw new Error('此瀏覽器或伺服器設定不支援推播（iPhone 需先「加入主畫面」）');
    let permission = Notification.permission;
    if (permission !== 'granted' && prompt) permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('未允許通知權限');
    const cfg = window.FIREBASE_CONFIG;
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
    const messaging = getMessaging(initializeApp(cfg));
    const reg = (await swReady) || (await swRegistration());
    const token = await getToken(messaging, { vapidKey: cfg.vapidKey || undefined, serviceWorkerRegistration: reg || undefined });
    if (!token) throw new Error('無法取得推播 Token');
    await send('POST', '/fcm/token', { token, deviceInfo: navigator.userAgent.slice(0, 200) });
    return token;
  }
  // Refresh silently for users who already granted permission.
  if (pushSupported() && Notification.permission === 'granted' && document.body.dataset.auth === '1') {
    setTimeout(() => enablePush({ prompt: false }).catch(() => {}), 3000);
  }

  window.App = {
    url, api, asset, jsonFetch, get, send,
    esc, safeUrl,
    fmt: { num, money, reward, date, time, datetime, dayKey, dayLabel, inputDate, inputDateTime, daysLeftText },
    toDate, icon, avatar, payTag, gradientFromName, initialsFrom, hashHue, rewardRateText, progressBar, skeletonRows, emptyState, errorState,
    toast, sheet: { open: openSheet, close: closeSheet, create: createSheet }, confirm: confirmDialog, prompt: promptDialog,
    setLoading, showError, debounce, setPressed, store, loadTags,
    push: { supported: pushSupported, enable: enablePush },
    // legacy aliases (transactions-map.js)
    fmtNumber: num, fmtDate: datetime, fmtDateOnly: date, openModal: openSheet, closeModal: closeSheet
  };
})();
