(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;

  const form = document.getElementById('recForm');
  const amountEl = document.getElementById('amount');
  const merchantEl = document.getElementById('merchant');
  const pmChips = document.getElementById('pmChips');
  const results = document.getElementById('results');

  const params = new URLSearchParams(location.search);
  const state = { pm: params.get('paymentMethodId') || '', last: null, seq: 0 };
  amountEl.value = params.get('amount') || '';
  merchantEl.value = params.get('merchant') || '';

  const REASON = {
    excludedMerchant: (m) => `排除商家${m.keyword ? `「${m.keyword}」` : ''}`,
    merchantNotMatched: () => '限定特定商家',
    belowMinimum: (m) => `未達單筆門檻 ${F.money(m.minimumSpend, { decimals: 0 })}`
  };

  function intro() {
    results.innerHTML = `<div class="card">${A.emptyState('bolt', '輸入金額看看哪張最划算', '會比較所有進行中的活動，扣掉這期已經拿到的回饋與上限')}</div>`;
  }

  function contributionLine(c) {
    const badges = [];
    if (c.needsRegistration) badges.push('<span class="badge badge-rose">需登錄</span>');
    if (c.capBefore) badges.push('<span class="badge badge-slate">已滿額</span>');
    else if (c.capReachedAfter) badges.push('<span class="badge badge-green">刷完滿額</span>');
    if (c.thresholdMetAfter === false) badges.push(`<span class="badge badge-amber">還差 ${F.money(c.remainingToThresholdAfter, { decimals: 0 })} 達門檻</span>`);
    if (c.merchantKeyword) badges.push(`<span class="badge badge-brand"><span class="truncate">${esc(c.merchantKeyword)}</span></span>`);
    return `<li class="flex items-start justify-between gap-3 py-1.5">
      <span class="min-w-0"><span class="text-[13px] font-medium">${esc(c.title)}</span>${badges.length ? `<span class="mt-1 flex flex-wrap gap-1">${badges.join('')}</span>` : ''}</span>
      <span class="shrink-0 text-[13px] font-semibold money ${c.reward > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'faint'}">${c.reward > 0 ? F.reward(c.reward, c.rewardType, { sign: true }) : '+0'}</span>
    </li>`;
  }

  function totalText(o) {
    const types = new Set(o.contributions.filter((c) => c.reward > 0).map((c) => c.rewardType || 'cash'));
    if (!(o.totalReward > 0)) return 'NT$0';
    return types.size === 1 ? F.reward(o.totalReward, Array.from(types)[0], { sign: true }) : F.money(o.totalReward, { sign: true });
  }

  function optionCard(o, idx, amount) {
    const best = idx === 0 && o.totalReward > 0;
    const missed = o.missed.length
      ? `<details class="mt-2 text-[13px]"><summary class="cursor-pointer muted">${icon('info', 'i-sm')} ${o.missed.length} 個活動這筆不適用</summary>
          <ul class="mt-1 space-y-1 pl-5">${o.missed.map((m) => `<li class="muted">${esc(m.title)}：${esc((REASON[m.reason] || (() => m.reason))(m))}</li>`).join('')}</ul></details>`
      : '';
    return `<article class="card card-pad ${best ? 'ring-2 ring-brand-500/60' : ''}">
      <div class="flex items-start gap-3">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${best ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${idx + 1}</span>
        <div class="min-w-0 flex-1">
          ${best ? '<div class="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">最划算</div>' : ''}
          <div class="flex flex-wrap items-center gap-1.5">${A.payTag(o.card)}${o.paymentMethod ? `<span class="faint">+</span>${A.payTag(o.paymentMethod)}` : '<span class="text-xs muted">直接刷卡</span>'}</div>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-xl font-extrabold money ${o.totalReward > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'faint'}">${esc(totalText(o))}</div>
          <div class="text-[12px] muted">回饋率 ${F.num(o.effectiveRate)}%</div>
        </div>
      </div>
      ${o.contributions.length ? `<ul class="mt-2 border-t border-slate-100 pt-1 dark:border-slate-800">${o.contributions.map(contributionLine).join('')}</ul>` : ''}
      ${missed}
      <div class="mt-3 flex gap-2">
        <button type="button" class="btn btn-sm ${best ? 'btn-primary' : 'btn-secondary'} flex-1" data-record="${idx}">${icon('check', 'i-sm')}用這張，記下這筆 ${F.money(amount, { decimals: 0 })}</button>
      </div>
    </article>`;
  }

  async function run() {
    const amount = Number(amountEl.value);
    const qs = new URLSearchParams();
    if (amountEl.value) qs.set('amount', amountEl.value);
    if (merchantEl.value.trim()) qs.set('merchant', merchantEl.value.trim());
    if (state.pm) qs.set('paymentMethodId', state.pm);
    history.replaceState(history.state, '', `${location.pathname}${qs.toString() ? '?' + qs : ''}`);
    document.querySelectorAll('#amountChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.amt) === amount)));
    if (!(amount > 0)) { intro(); return; }

    const seq = ++state.seq;
    results.innerHTML = A.skeletonRows(3, 'h-32');
    try {
      const data = await A.get(`/cashback/recommend?${qs}`);
      if (seq !== state.seq) return;
      state.last = data;
      if (!data.consideredEvents) {
        results.innerHTML = `<div class="card">${A.emptyState('gift', '目前沒有進行中的回饋活動', '先新增活動並綁定卡片，就能比較', `<a class="btn btn-primary btn-sm" href="${A.url('/cashback?new=1')}">${icon('plus', 'i-sm')}新增活動</a>`)}</div>`;
        return;
      }
      if (!data.options.length) {
        results.innerHTML = `<div class="card">${A.emptyState('card', '沒有符合條件的卡片組合', '試試「全部比較」或換個商家')}</div>`;
        return;
      }
      const head = data.options[0].totalReward > 0
        ? `<p class="px-1 text-[13px] muted">比較了 ${data.consideredEvents} 個進行中活動，依這筆可多拿的回饋排序</p>`
        : '<div class="error-box !border-amber-200 !bg-amber-50 !text-amber-800 dark:!bg-amber-500/10 dark:!text-amber-300">這筆在所有活動都拿不到額外回饋（可能已滿額或不符條件），以下列出原因。</div>';
      results.innerHTML = head + data.options.map((o, i) => optionCard(o, i, amount)).join('');
    } catch (err) {
      if (seq !== state.seq) return;
      results.innerHTML = `<div class="card">${A.errorState(err)}</div>`;
    }
  }
  const runSoon = A.debounce(run, 350);

  amountEl.addEventListener('input', runSoon);
  merchantEl.addEventListener('input', runSoon);
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); run(); } });
  document.getElementById('amountChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-amt]');
    if (!c) return;
    amountEl.value = c.dataset.amt;
    run();
  });
  pmChips.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pm]');
    if (!c) return;
    state.pm = c.dataset.pm;
    A.setPressed(pmChips, '[data-pm]', state.pm, 'pm');
    run();
  });

  results.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-record]');
    if (!b || !state.last) return;
    const o = state.last.options[Number(b.dataset.record)];
    A.setLoading(b, true, '記錄中');
    try {
      await A.send('POST', '/transactions', {
        cardId: o.cardId,
        paymentMethodId: o.paymentMethodId,
        amount: Number(amountEl.value),
        note: merchantEl.value.trim() || null,
        transactionAt: new Date().toISOString()
      });
      A.toast(`已記錄 ${o.card.name}${o.paymentMethod ? ' + ' + o.paymentMethod.name : ''} ${F.money(Number(amountEl.value), { decimals: 0 })}`);
      amountEl.value = '';
      run();
    } catch (err) {
      A.setLoading(b, false);
      A.toast(err.message, { type: 'error' });
    }
  });

  async function loadAux() {
    try {
      const [{ pms }, events, txns] = await Promise.all([
        A.loadTags(),
        A.get('/cashback?status=ongoing'),
        A.get('/transactions?pageSize=60')
      ]);
      pmChips.insertAdjacentHTML('beforeend', `<button type="button" class="chip" data-pm="none">直接刷卡</button>`
        + pms.map((p) => `<button type="button" class="chip" data-pm="${p.id}">${p.imageUrl ? `<img class="chip-img" src="${esc(A.asset(p.imageUrl))}" alt="">` : ''}${esc(p.name)}</button>`).join(''));
      A.setPressed(pmChips, '[data-pm]', state.pm, 'pm');
      const names = new Set();
      events.forEach((ev) => String(ev.merchantKeywords || '').split('\n').forEach((k) => k.trim() && names.add(k.trim())));
      (txns.items || []).forEach((t) => t.note && names.add(String(t.note).split(/\s/)[0]));
      document.getElementById('merchantList').innerHTML = Array.from(names).slice(0, 80).map((n) => `<option value="${esc(n)}"></option>`).join('');
    } catch (_) { /* suggestions are optional */ }
  }

  loadAux();
  if (amountEl.value) run(); else intro();
  if (!amountEl.value && window.matchMedia('(min-width: 768px)').matches) amountEl.focus();
})();
