(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const $ = (id) => document.getElementById(id);

  const KIND = { credit: '信用卡', debit: '金融卡', bank: '銀行帳戶', other: '其他' };
  const NET = { visa: 'VISA', mastercard: 'Mastercard', jcb: 'JCB', amex: 'AMEX', unionpay: '銀聯', other: '' };
  const state = { cards: [], pms: [] };

  function cardVisual(c, { actions = true } = {}) {
    return `<div class="credit-card credit-card--${esc(c.kind || 'credit')}">
      ${c.imageUrl ? `<img class="credit-card__bg" src="${esc(A.asset(c.imageUrl))}" alt="">` : ''}
      ${actions && c.hasPan ? `<button type="button" class="credit-card__copy" data-copy-pan="${c.id}" aria-label="複製卡號">${icon('copy', 'i-sm')}</button>` : ''}
      <div class="credit-card__content">
        <div class="flex items-start justify-between text-[11px] font-medium opacity-90"><div><div class="opacity-70">${esc(KIND[c.kind] || '')}</div><div>${esc(c.issuer || '')}</div></div>${actions && c.hasPan ? '' : '<div class="credit-card__chip"></div>'}</div>
        <div class="credit-card__number">•••• •••• •••• ${esc(c.lastFour || '••••')}</div>
        <div class="flex items-end justify-between"><div class="credit-card__name">${esc(c.name || '卡片名稱')}</div><div class="text-[11px] font-bold tracking-wider">${esc(NET[c.network] || '')}</div></div>
      </div>
    </div>`;
  }

  function render() {
    $('cardGrid').innerHTML = state.cards.length
      ? state.cards.map((c) => `<div><button type="button" class="block w-full text-left transition active:scale-[0.99]" data-card="${c.id}">${cardVisual(c)}</button>
          <div class="mt-1.5 flex items-center justify-between px-1 text-[12px] muted"><span>${c.eventCount} 個活動・${c.transactionCount} 筆交易</span>${c.aliases ? `<span class="truncate">別名：${esc(c.aliases.split('\n').join('、'))}</span>` : ''}</div></div>`).join('')
      : `<div class="card sm:col-span-2 lg:col-span-3">${A.emptyState('card', '還沒有卡片', '新增卡片後才能綁定活動與記錄交易', `<button class="btn btn-primary btn-sm" data-new-card>${icon('plus', 'i-sm')}新增卡片</button>`)}</div>`;
    $('pmList').innerHTML = state.pms.length
      ? `<div class="list">${state.pms.map((p) => `<button type="button" class="row row-tap w-full text-left" data-pm="${p.id}">${A.avatar(p.name, p.imageUrl)}<span class="min-w-0 flex-1"><span class="block font-semibold">${esc(p.name)}</span><span class="block truncate text-[12px] muted">${p.eventCount} 個活動・${p.transactionCount} 筆交易${p.aliases ? `・別名 ${esc(p.aliases.split('\n').join('、'))}` : ''}</span></span>${icon('chevron-right', 'i-sm faint')}</button>`).join('')}</div>`
      : A.emptyState('wallet', '還沒有支付方式', 'LINE Pay、街口、全支付…', `<button class="btn btn-primary btn-sm" data-new-pm>${icon('plus', 'i-sm')}新增支付方式</button>`);
  }

  async function load() {
    try {
      const { cards, pms } = await A.loadTags(true);
      state.cards = cards;
      state.pms = pms;
      render();
    } catch (err) {
      $('cardGrid').innerHTML = `<div class="card sm:col-span-2">${A.errorState(err)}</div>`;
    }
  }

  // ─── Card form ───
  const cForm = $('cardForm');
  function preview() {
    $('cardPreview').innerHTML = cardVisual({
      name: cForm.name.value, kind: cForm.kind.value, issuer: cForm.issuer.value, network: cForm.network.value,
      lastFour: (cForm.pan.value.replace(/\D/g, '').slice(-4)) || (cForm.dataset.last4 || ''), imageUrl: cForm.dataset.img || null
    }, { actions: false });
  }
  ['name', 'kind', 'issuer', 'network', 'pan'].forEach((n) => cForm[n].addEventListener('input', preview));
  function openCard(c) {
    cForm.reset();
    A.showError($('cError'), '');
    cForm.id.value = c ? c.id : '';
    cForm.dataset.last4 = c ? c.lastFour || '' : '';
    cForm.dataset.img = c ? c.imageUrl || '' : '';
    $('cTitle').textContent = c ? '編輯卡片' : '新增卡片';
    $('cDelete').hidden = !c;
    $('removePanWrap').hidden = !(c && c.hasPan);
    $('removeImgWrap').hidden = !(c && c.imageUrl);
    $('panHint').textContent = c && c.hasPan ? '已儲存卡號（末四碼 ' + c.lastFour + '）；留空＝不變更' : '加密儲存，平常只顯示末四碼；可一鍵複製。外部回報時也能用末四碼對應。';
    if (c) ['name', 'kind', 'issuer', 'network', 'aliases', 'note'].forEach((n) => { cForm[n].value = c[n] || (n === 'kind' ? 'credit' : ''); });
    preview();
    A.sheet.open('cardSheet');
  }
  cForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!cForm.name.value.trim()) { A.showError($('cError'), '請輸入名稱'); return; }
    const fd = new FormData(cForm);
    const id = fd.get('id');
    fd.delete('id');
    if (!(fd.get('image') && fd.get('image').size > 0)) fd.delete('image');
    const btn = cForm.closest('.sheet').querySelector('[type=submit]');
    A.setLoading(btn, true);
    try {
      await A.jsonFetch(A.api(id ? `/tags/cards/${id}` : '/tags/cards'), { method: id ? 'PUT' : 'POST', body: fd });
      A.sheet.close('cardSheet');
      A.toast(id ? '已更新卡片' : '已新增卡片');
      load();
    } catch (err) { A.showError($('cError'), err.message); } finally { A.setLoading(btn, false); }
  });
  $('cDelete').addEventListener('click', async () => {
    const c = state.cards.find((x) => x.id === Number(cForm.id.value));
    const msg = c && c.transactionCount
      ? `這張卡有 ${c.transactionCount} 筆交易紀錄，刪除卡片會一併刪除這些交易，並從 ${c.eventCount} 個活動中移除。確定刪除？`
      : '確定刪除這張卡片？';
    if (!(await A.confirm(msg, { title: '刪除卡片', okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/tags/cards/${cForm.id.value}`);
      A.sheet.close('cardSheet');
      load();
    } catch (err) { A.showError($('cError'), err.message); }
  });

  // ─── Payment form ───
  const pForm = $('pmForm');
  function openPm(p) {
    pForm.reset();
    A.showError($('pError'), '');
    pForm.id.value = p ? p.id : '';
    $('pTitle').textContent = p ? '編輯支付方式' : '新增支付方式';
    $('pDelete').hidden = !p;
    $('pRemoveImgWrap').hidden = !(p && p.imageUrl);
    if (p) ['name', 'aliases', 'note'].forEach((n) => { pForm[n].value = p[n] || ''; });
    A.sheet.open('pmSheet');
  }
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pForm.name.value.trim()) { A.showError($('pError'), '請輸入名稱'); return; }
    const fd = new FormData(pForm);
    const id = fd.get('id');
    fd.delete('id');
    if (!(fd.get('image') && fd.get('image').size > 0)) fd.delete('image');
    const btn = pForm.closest('.sheet').querySelector('[type=submit]');
    A.setLoading(btn, true);
    try {
      await A.jsonFetch(A.api(id ? `/tags/payment-methods/${id}` : '/tags/payment-methods'), { method: id ? 'PUT' : 'POST', body: fd });
      A.sheet.close('pmSheet');
      A.toast(id ? '已更新' : '已新增支付方式');
      load();
    } catch (err) { A.showError($('pError'), err.message); } finally { A.setLoading(btn, false); }
  });
  $('pDelete').addEventListener('click', async () => {
    const p = state.pms.find((x) => x.id === Number(pForm.id.value));
    const msg = p && p.transactionCount
      ? `有 ${p.transactionCount} 筆交易使用這個支付方式，刪除後它們會變成「直接刷卡」，可能影響活動計算。確定刪除？`
      : '確定刪除這個支付方式？';
    if (!(await A.confirm(msg, { title: '刪除支付方式', okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/tags/payment-methods/${pForm.id.value}`);
      A.sheet.close('pmSheet');
      load();
    } catch (err) { A.showError($('pError'), err.message); }
  });

  // ─── Clicks ───
  document.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy-pan]');
    if (copy) {
      e.stopPropagation();
      try {
        const { pan } = await A.get(`/tags/cards/${copy.dataset.copyPan}/pan`);
        await navigator.clipboard.writeText(pan);
        A.toast(`已複製卡號（末四碼 ${pan.slice(-4)}）`);
      } catch (err) { A.toast(err.status === 404 ? '此卡尚未儲存完整卡號' : '複製失敗：' + err.message, { type: 'error' }); }
      return;
    }
    const c = e.target.closest('[data-card]');
    if (c) return openCard(state.cards.find((x) => x.id === Number(c.dataset.card)));
    const p = e.target.closest('[data-pm]');
    if (p) return openPm(state.pms.find((x) => x.id === Number(p.dataset.pm)));
    if (e.target.closest('[data-new-card]')) openCard(null);
    if (e.target.closest('[data-new-pm]')) openPm(null);
  });
  $('newCardBtn').addEventListener('click', () => openCard(null));
  $('newPmBtn').addEventListener('click', () => openPm(null));

  load();
})();
