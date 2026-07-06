(function () {
  'use strict';
  const A = window.App;

  const mapEl = document.getElementById('map');
  if (!mapEl) return; // no API key configured — server already rendered a message instead

  const cardFilter = document.getElementById('cardFilter');
  const heatmapToggle = document.getElementById('heatmapToggle');
  const markersToggle = document.getElementById('markersToggle');
  const mapStats = document.getElementById('mapStats');

  let map = null;
  let heatmap = null;
  let markers = [];
  let infoWindow = null;
  let points = [];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function markerContentHtml(t) {
    const card = t.card ? escapeHtml(t.card.name) : '已刪除的卡片';
    const pm = t.paymentMethod ? escapeHtml(t.paymentMethod.name) : '未使用電子支付';
    return `<div style="font-size:12px;min-width:160px">
      <div style="font-weight:600">${card} · ${pm}</div>
      <div style="margin-top:2px">NT$${A.fmtNumber(t.amount)}</div>
      <div style="color:#64748b;margin-top:2px">${A.fmtDate(t.transactionAt)}</div>
      ${t.note ? `<div style="color:#64748b;margin-top:2px">${escapeHtml(t.note)}</div>` : ''}
    </div>`;
  }

  function clearMarkers() {
    markers.forEach((m) => m.setMap(null));
    markers = [];
  }

  function render() {
    if (!map) return;
    clearMarkers();
    if (heatmap) { heatmap.setMap(null); heatmap = null; }

    if (!points.length) {
      mapStats.textContent = '目前沒有含經緯度的交易紀錄';
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    const heatData = [];
    let total = 0;

    points.forEach((t) => {
      const pos = { lat: t.latitude, lng: t.longitude };
      bounds.extend(pos);
      total += Number(t.amount) || 0;
      heatData.push({ location: new google.maps.LatLng(pos.lat, pos.lng), weight: Math.max(1, Number(t.amount) || 1) });

      if (markersToggle.checked) {
        const marker = new google.maps.Marker({ position: pos, map, title: t.card ? t.card.name : '' });
        marker.addListener('click', () => {
          infoWindow.setContent(markerContentHtml(t));
          infoWindow.open(map, marker);
        });
        markers.push(marker);
      }
    });

    heatmap = new google.maps.visualization.HeatmapLayer({
      data: heatData,
      map: heatmapToggle.checked ? map : null,
      radius: 28
    });

    map.fitBounds(bounds);
    mapStats.textContent = `${points.length} 筆交易 · 合計 NT$${A.fmtNumber(total)}`;
  }

  async function loadPoints() {
    mapStats.textContent = '載入中…';
    const params = new URLSearchParams();
    if (cardFilter.value) params.set('cardId', cardFilter.value);
    try {
      points = await A.jsonFetch(A.api('/transactions/locations?' + params.toString()));
      render();
    } catch (err) {
      mapStats.textContent = '載入失敗：' + err.message;
    }
  }

  async function loadCardFilter() {
    try {
      const cards = await A.jsonFetch(A.api('/tags/cards'));
      cardFilter.innerHTML = '<option value="">全部</option>'
        + cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    } catch (_) { /* filter just stays on "全部" */ }
  }

  // Google Maps JS API loader calls this once the script + visualization
  // library are ready (see the callback= param in loadScript()).
  window.initGoogleMap = function initGoogleMap() {
    map = new google.maps.Map(mapEl, {
      center: { lat: 23.6978, lng: 120.9605 }, // roughly the centre of Taiwan
      zoom: 8,
      mapTypeControl: false,
      streetViewControl: false
    });
    infoWindow = new google.maps.InfoWindow();
    loadCardFilter().then(loadPoints);
  };

  function loadScript() {
    const key = window.GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key)
      + '&libraries=visualization&callback=initGoogleMap';
    s.async = true;
    document.head.appendChild(s);
  }

  cardFilter?.addEventListener('change', loadPoints);
  heatmapToggle?.addEventListener('change', () => { if (heatmap) heatmap.setMap(heatmapToggle.checked ? map : null); });
  markersToggle?.addEventListener('change', render);

  loadScript();
})();
