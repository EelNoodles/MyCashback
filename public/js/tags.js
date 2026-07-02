(function () {
  'use strict';
  const A = window.App;

  const cardListEl = document.getElementById('cardList');
  const pmListEl = document.getElementById('pmList');
  const newCardBtn = document.getElementById('newCardBtn');
  const newPmBtn = document.getElementById('newPmBtn');

  const cardForm = document.getElementById('cardForm');
  const cardFormError = document.getElementById('cardFormError');
  const cardModalTitle = document.getElementById('cardModalTitle');
  const deleteCardBtn = document.getElementById('deleteCardBtn');
  const cardPreview = document.getElementById('cardPreview');

  const pmForm = document.getElementById('pmForm');
  const pmFormError = document.getElementById('pmFormError');
  const pmModalTitle = document.getElementById('pmModalTitle');
  const deletePmBtn = document.getElementById('deletePmBtn');

  const KIND_LABELS = { credit: '信用卡', debit: '金融卡', bank: '銀行', other: '其他' };
  const NETWORK_LABELS = {
    visa: 'VISA', mastercard: 'Mastercard', jcb: 'JCB',
    amex: 'AMEX', unionpay: '銀聯', other: ''
  };
  // Display order for network sections: JCB → VISA → Mastercard → AMEX → UnionPay → Other → Unspecified.
  const NETWORK_ORDER = ['jcb', 'visa', 'mastercard', 'amex', 'unionpay', 'other', ''];
  const NETWORK_SECTION_LABEL = {
    jcb: 'JCB', visa: 'VISA', mastercard: 'Mastercard',
    amex: 'AMEX', unionpay: '銀聯', other: '其他',
    '': '未指定發卡組織'
  };

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Credit Card Renderer ───
  function renderCreditCard(item, opts = {}) {
    const { clickable = true, size = 'full' } = opts;
    const wrap = document.createElement('div');
    wrap.className = `credit-card credit-card--${item.kind || 'credit'}`;
    if (size === 'mini') {
      wrap.style.maxWidth = '180px';
      wrap.style.fontSize = '0.6rem';
    }

    let bgHtml = '';
    if (item.imageUrl) {
      bgHtml = `<img class="credit-card__bg" src="${A.url(item.imageUrl)}" alt="" />`;
    }

    const lastFourDisplay = item.lastFour
      ? `•••• •••• •••• ${item.lastFour}`
      : '•••• •••• •••• ••••';

    const networkLabel = item.network ? (NETWORK_LABELS[item.network] || '') : '';

    const copyBtnHtml = (item.hasPan && item.id)
      ? `<button type="button" class="credit-card__copy" data-copy-pan="${item.id}" title="複製 16 碼卡號" aria-label="複製 16 碼卡號">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
             <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
             <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
           </svg>
         </button>`
      : '';

    wrap.innerHTML = `
      ${bgHtml}
      ${copyBtnHtml}
      <div class="credit-card__content">
        <div class="credit-card__header">
          <div>
            <div style="opacity:0.7;font-size:0.55rem">${KIND_LABELS[item.kind] || ''}</div>
            <div>${escapeAttr(item.issuer || '')}</div>
          </div>
          <div class="credit-card__chip"></div>
        </div>
        <div class="credit-card__number">${lastFourDisplay}</div>
        <div class="credit-card__footer">
          <div class="credit-card__name">${escapeAttr(item.name)}</div>
          <div class="credit-card__network">${networkLabel}</div>
        </div>
      </div>`;

    const copyBtn = wrap.querySelector('[data-copy-pan]');
    if (copyBtn) copyBtn.addEventListener('click', (e) => copyCardPan(e, item.id));

    if (clickable) {
      wrap.addEventListener('click', () => openCardModal(item));
    }
    return wrap;
  }

  // ─── Copy PAN ───
  let toastEl = null;
  function showToast(msg, isErr = false) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-lg text-sm text-white shadow-lg transition-opacity duration-200 pointer-events-none';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = isErr ? '#e11d48' : '#0f172a';
    toastEl.style.opacity = '1';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 1600);
  }

  async function copyCardPan(evt, id) {
    evt.stopPropagation();
    evt.preventDefault();
    try {
      const data = await A.jsonFetch(A.api(`/tags/cards/${id}/pan`));
      if (!data || !data.pan) throw new Error('沒有可複製的卡號');
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('瀏覽器不支援自動複製');
      }
      await navigator.clipboard.writeText(data.pan);
      showToast(`已複製卡號 ${data.pan.slice(-4)} (${data.pan.length} 碼)`);
    } catch (err) {
      showToast(err.status === 404 ? '此卡尚未儲存完整卡號' : ('複製失敗：' + err.message), true);
    }
  }

  // ─── Payment Method Renderer ───
  function renderPmCard(item) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'w-14 h-14 rounded-xl overflow-hidden flex-shrink-0';

    if (item.imageUrl) {
      iconWrap.innerHTML = `<img src="${A.url(item.imageUrl)}" alt="${item.name}" class="w-full h-full object-contain" />`;
    } else {
      iconWrap.style.background = A.gradientFromName(item.name);
      iconWrap.className += ' grid place-items-center text-white text-lg font-bold';
      iconWrap.textContent = A.initialsFrom(item.name);
    }

    const label = document.createElement('div');
    label.className = 'text-xs font-medium text-center truncate w-full';
    label.textContent = item.name;

    wrap.append(iconWrap, label);
    wrap.addEventListener('click', () => openPmModal(item));
    return wrap;
  }

  async function loadCards() {
    try {
      const data = await A.jsonFetch(A.api('/tags/cards'));
      cardListEl.innerHTML = '';
      if (!data.length) {
        cardListEl.innerHTML = `<div class="text-sm text-slate-400">尚未新增任何卡片</div>`;
        return;
      }
      // Group by network so each section (JCB → VISA → …) reads as its own row.
      const grouped = new Map();
      for (const c of data) {
        const k = c.network || '';
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(c);
      }
      for (const net of NETWORK_ORDER) {
        const group = grouped.get(net);
        if (!group || !group.length) continue;
        const section = document.createElement('section');
        const header = document.createElement('div');
        header.className = 'flex items-baseline gap-2 mb-2';
        header.innerHTML = `<span class="text-xs font-semibold tracking-widest text-slate-500 uppercase">${NETWORK_SECTION_LABEL[net]}</span><span class="text-[10px] text-slate-400">${group.length} 張</span>`;
        section.appendChild(header);
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
        for (const c of group) grid.appendChild(renderCreditCard(c));
        section.appendChild(grid);
        cardListEl.appendChild(section);
      }
    } catch (err) {
      cardListEl.innerHTML = `<div class="text-sm text-rose-500">載入失敗：${err.message}</div>`;
    }
  }

  async function loadPms() {
    try {
      const data = await A.jsonFetch(A.api('/tags/payment-methods'));
      pmListEl.innerHTML = '';
      if (!data.length) {
        pmListEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">尚未新增任何支付方式</div>`;
        return;
      }
      for (const p of data) pmListEl.appendChild(renderPmCard(p));
    } catch (err) {
      pmListEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  // Derive the last four digits from whatever the user has typed so the live
  // preview matches what will be saved. Ignores any non-digit input.
  function digitsFromPan(value) {
    return String(value || '').replace(/\D/g, '');
  }

  // ─── Live Card Preview ───
  function updateCardPreview() {
    if (!cardPreview) return;
    const editingId = cardForm.id.value;
    const panDigits = digitsFromPan(cardForm.pan.value);
    let lastFour = panDigits.length >= 4 ? panDigits.slice(-4) : '';
    // If we're editing and the PAN field is blank, keep whatever last four was
    // already stored so the preview reflects the persisted card.
    if (!lastFour && editingId && cardForm.dataset.storedLastFour) {
      lastFour = cardForm.dataset.storedLastFour;
    }
    const item = {
      name: cardForm.name.value || '卡片名稱',
      kind: cardForm.kind.value || 'credit',
      issuer: cardForm.issuer.value || '',
      lastFour,
      network: cardForm.network.value || '',
      imageUrl: null  // no preview for file upload
    };
    cardPreview.innerHTML = '';
    cardPreview.appendChild(renderCreditCard(item, { clickable: false }));
  }

  // Format the PAN input as "1234 5678 9012 3456" as the user types.
  function reformatPanInput() {
    const el = cardForm.pan;
    if (!el) return;
    const digits = digitsFromPan(el.value).slice(0, 19);
    el.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }
  cardForm?.pan?.addEventListener('input', () => { reformatPanInput(); updateCardPreview(); });

  // Listen to other form changes to update preview
  ['name', 'kind', 'issuer', 'network'].forEach((n) => {
    const el = cardForm?.[n];
    if (el) el.addEventListener('input', updateCardPreview);
    if (el) el.addEventListener('change', updateCardPreview);
  });

  // ─── Card modal ───
  function openCardModal(c) {
    cardForm.reset();
    A.showError(cardFormError, '');
    if (c) {
      cardModalTitle.textContent = '編輯卡片';
      cardForm.id.value = c.id;
      cardForm.name.value = c.name;
      cardForm.kind.value = c.kind || 'credit';
      cardForm.issuer.value = c.issuer || '';
      cardForm.pan.value = '';
      cardForm.pan.placeholder = c.hasPan
        ? `已儲存 •••• •••• •••• ${c.lastFour || '••••'}（留空可保留）`
        : '1234 5678 9012 3456';
      cardForm.dataset.storedLastFour = c.lastFour || '';
      cardForm.network.value = c.network || '';
      cardForm.note.value = c.note || '';
      deleteCardBtn.classList.remove('hidden');
    } else {
      cardModalTitle.textContent = '新增卡片';
      cardForm.id.value = '';
      cardForm.pan.placeholder = '1234 5678 9012 3456';
      delete cardForm.dataset.storedLastFour;
      deleteCardBtn.classList.add('hidden');
    }
    updateCardPreview();
    A.openModal('cardModal');
  }
  newCardBtn?.addEventListener('click', () => openCardModal(null));

  cardForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = cardForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(cardFormError, '');
    try {
      const fd = new FormData(cardForm);
      const id = fd.get('id');
      // strip empty file input
      if (fd.get('image') && !(fd.get('image').size > 0)) fd.delete('image');
      if (id) {
        fd.delete('id');
        await A.jsonFetch(A.api(`/tags/cards/${id}`), { method: 'PUT', body: fd });
      } else {
        fd.delete('id');
        await A.jsonFetch(A.api('/tags/cards'), { method: 'POST', body: fd });
      }
      A.closeModal('cardModal');
      await loadCards();
    } catch (err) {
      const code = err.body && err.body.error;
      let msg = err.message;
      if (err.status === 409) msg = '名稱重複';
      else if (code === 'INVALID_PAN') msg = '卡號長度不正確（需 13-19 碼數字）';
      A.showError(cardFormError, msg);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deleteCardBtn?.addEventListener('click', async () => {
    const id = cardForm.id.value;
    if (!id) return;
    if (!confirm('刪除此卡片？已關聯的活動會自動解除綁定。')) return;
    try {
      await A.jsonFetch(A.api(`/tags/cards/${id}`), { method: 'DELETE' });
      A.closeModal('cardModal');
      await loadCards();
    } catch (err) {
      A.showError(cardFormError, err.message);
    }
  });

  // ─── PM modal ───
  function openPmModal(p) {
    pmForm.reset();
    A.showError(pmFormError, '');
    if (p) {
      pmModalTitle.textContent = '編輯支付方式';
      pmForm.id.value = p.id;
      pmForm.name.value = p.name;
      pmForm.note.value = p.note || '';
      deletePmBtn.classList.remove('hidden');
    } else {
      pmModalTitle.textContent = '新增支付方式';
      pmForm.id.value = '';
      deletePmBtn.classList.add('hidden');
    }
    A.openModal('pmModal');
  }
  newPmBtn?.addEventListener('click', () => openPmModal(null));

  pmForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = pmForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(pmFormError, '');
    try {
      const fd = new FormData(pmForm);
      const id = fd.get('id');
      if (fd.get('image') && !(fd.get('image').size > 0)) fd.delete('image');
      if (id) {
        fd.delete('id');
        await A.jsonFetch(A.api(`/tags/payment-methods/${id}`), { method: 'PUT', body: fd });
      } else {
        fd.delete('id');
        await A.jsonFetch(A.api('/tags/payment-methods'), { method: 'POST', body: fd });
      }
      A.closeModal('pmModal');
      await loadPms();
    } catch (err) {
      A.showError(pmFormError, err.status === 409 ? '名稱重複' : err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deletePmBtn?.addEventListener('click', async () => {
    const id = pmForm.id.value;
    if (!id) return;
    if (!confirm('刪除此支付方式？已關聯的活動會自動解除綁定。')) return;
    try {
      await A.jsonFetch(A.api(`/tags/payment-methods/${id}`), { method: 'DELETE' });
      A.closeModal('pmModal');
      await loadPms();
    } catch (err) {
      A.showError(pmFormError, err.message);
    }
  });

  loadCards();
  loadPms();
})();
