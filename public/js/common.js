/* Shared client-side helpers used across all pages. */
(function () {
  'use strict';

  const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.baseUrl) || '';

  function url(path) {
    if (!path) path = '/';
    if (!path.startsWith('/')) path = '/' + path;
    return baseUrl + path;
  }
  function api(path) { return url('/api' + (path.startsWith('/') ? path : '/' + path)); }

  async function jsonFetch(path, options = {}) {
    const opts = Object.assign({
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }, options);

    const isForm = opts.body instanceof FormData;
    if (opts.body && !isForm && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    const res = await fetch(path, opts);
    if (res.status === 401) {
      window.location.href = url('/login');
      throw new Error('unauthenticated');
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  function fmtNumber(n) {
    if (n === null || n === undefined || n === '') return '—';
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return String(d); }
  }
  function fmtDateOnly(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('zh-TW'); } catch (_) { return String(d); }
  }

  function gradientFromName(name) {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `linear-gradient(135deg, hsl(${hue},70%,60%), hsl(${(hue + 40) % 360},70%,45%))`;
  }
  function initialsFrom(name) {
    const s = String(name || '?').trim();
    if (!s) return '?';
    // Take first two CJK chars or first two latin letters
    return s.slice(0, 2).toUpperCase();
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.querySelectorAll('[data-state="idle"]').forEach((el) => el.classList.toggle('hidden', !!loading));
    btn.querySelectorAll('[data-state="loading"]').forEach((el) => el.classList.toggle('hidden', !loading));
  }

  function showError(el, message) {
    if (!el) return;
    if (!message) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.classList.remove('hidden');
    el.textContent = message;
  }

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Wire any `[data-dismiss="modalId"]` button automatically.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-dismiss]');
    if (t) closeModal(t.getAttribute('data-dismiss'));
  });
  // ESC closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.fixed.inset-0:not(.hidden)').forEach((m) => {
        m.classList.add('hidden');
      });
      document.body.style.overflow = '';
    }
  });

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch(url('/auth/logout'), { method: 'POST', credentials: 'same-origin' });
      } catch (_) {}
      window.location.href = url('/login');
    });
  }

  // Service worker registration (PWA installability)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(url('/service-worker.js'), { scope: url('/') })
        .catch((err) => console.warn('SW register failed', err));
    });
  }

  // Expose helpers
  window.App = {
    url, api, jsonFetch,
    fmtNumber, fmtDate, fmtDateOnly,
    gradientFromName, initialsFrom,
    openModal, closeModal,
    setLoading, showError
  };
})();
