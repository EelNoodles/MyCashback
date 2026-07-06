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
    const color = (t.card && t.card.color) || '#94a3b8';
    const card = t.card ? escapeHtml(t.card.name) : '已刪除的卡片';
    const pm = t.paymentMethod ? escapeHtml(t.paymentMethod.name) : '未使用電子支付';
    return `<div style="font-size:12px;min-width:160px">
      <div style="font-weight:600;display:flex;align-items:center;gap:6px">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>
        ${card} · ${pm}
      </div>
      <div style="margin-top:2px">NT$${A.fmtNumber(t.amount)}</div>
      <div style="color:#64748b;margin-top:2px">${A.fmtDate(t.transactionAt)}</div>
      ${t.note ? `<div style="color:#64748b;margin-top:2px">${escapeHtml(t.note)}</div>` : ''}
    </div>`;
  }

  function clearMarkers() {
    markers.forEach((m) => m.setMap(null));
    markers = [];
  }

  // A classic "location pin" glyph (Material Icons "place", 24x24 viewBox),
  // recolored per-marker instead of the stock red teardrop. Colored by the
  // card used (each card already has its own colour, e.g. shown as chips
  // elsewhere in the app) and sized relative to the transaction amount
  // within whatever's currently loaded, so the map visually distinguishes
  // both which card and how big a transaction each pin represents.
  const PIN_PATH = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z';

  function markerIcon(t, maxAmount) {
    const color = (t.card && t.card.color) || '#1a76f5';
    const amt = Number(t.amount) || 0;
    const ratio = maxAmount > 0 ? amt / maxAmount : 0;
    const scale = 1.1 + Math.sqrt(Math.max(0, ratio)) * 0.9; // ~1.1x - 2.0x
    return {
      path: PIN_PATH,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
      scale,
      anchor: new google.maps.Point(12, 22)
    };
  }

  // ─── Dependency-free heatmap ───
  // google.maps.visualization.HeatmapLayer was removed from the Maps
  // JavaScript API in v3.65 (May 2026) with no first-party replacement —
  // Google's own guidance is to pull in a third-party library (deck.gl /
  // MapLibre). Rather than add a whole extra mapping library just for this,
  // draw the heatmap ourselves: a canvas OverlayView with per-point radial
  // gradients (grayscale, weighted by spend) recolored through a blue→red
  // palette. Same core technique the removed layer used internally.
  const PALETTE = buildPalette();

  function buildPalette() {
    const stops = [
      [0.00, [0, 0, 255]],
      [0.25, [0, 255, 255]],
      [0.50, [0, 255, 0]],
      [0.75, [255, 255, 0]],
      [1.00, [255, 0, 0]]
    ];
    const palette = new Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let lo = stops[0];
      let hi = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) { lo = stops[s]; hi = stops[s + 1]; break; }
      }
      const span = hi[0] - lo[0] || 1;
      const localT = (t - lo[0]) / span;
      palette[i] = [
        Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * localT),
        Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * localT),
        Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * localT)
      ];
    }
    return palette;
  }

  // Constructor only; the prototype chain is wired up inside initGoogleMap()
  // below, once google.maps.OverlayView actually exists (this file loads
  // and runs before the Maps JS API script does).
  function CanvasHeatmap(data) {
    this.data = data; // [{ lat, lng, weight }]
    this.canvas = null;
  }
  CanvasHeatmap.prototype.onAdd = function () {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.getPanes().overlayLayer.appendChild(this.canvas);
  };
  CanvasHeatmap.prototype.onRemove = function () {
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
  };
  CanvasHeatmap.prototype.draw = function () {
    const projection = this.getProjection();
    const map = this.getMap();
    if (!projection || !this.canvas || !map) return;
    const bounds = map.getBounds();
    if (!bounds) return;

    const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
    const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
    const width = Math.max(1, Math.round(ne.x - sw.x));
    const height = Math.max(1, Math.round(sw.y - ne.y));
    this.canvas.style.left = sw.x + 'px';
    this.canvas.style.top = ne.y + 'px';
    this.canvas.width = width;
    this.canvas.height = height;

    // Pass 1: grayscale alpha mask, additive radial gradients per point.
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = width;
    alphaCanvas.height = height;
    const actx = alphaCanvas.getContext('2d');
    const maxWeight = this.data.reduce((m, p) => Math.max(m, p.weight), 1);

    this.data.forEach((p) => {
      const px = projection.fromLatLngToDivPixel(new google.maps.LatLng(p.lat, p.lng));
      const x = px.x - sw.x;
      const y = px.y - ne.y;
      if (x < -60 || y < -60 || x > width + 60 || y > height + 60) return; // outside viewport, skip
      const intensity = Math.min(1, p.weight / maxWeight);
      const radius = 24 + intensity * 24;
      const grad = actx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(0,0,0,${(0.35 + intensity * 0.35).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      actx.fillStyle = grad;
      actx.beginPath();
      actx.arc(x, y, radius, 0, Math.PI * 2);
      actx.fill();
    });

    // Pass 2: recolor the alpha mask through the palette onto the visible canvas.
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (width > 0 && height > 0) {
      const img = actx.getImageData(0, 0, width, height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (!a) continue;
        const c = PALETTE[a];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
        d[i + 3] = Math.min(255, a + 60);
      }
      ctx.putImageData(img, 0, 0);
    }
  };

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
    const maxAmount = points.reduce((m, t) => Math.max(m, Number(t.amount) || 0), 0);

    points.forEach((t) => {
      const pos = { lat: t.latitude, lng: t.longitude };
      bounds.extend(pos);
      total += Number(t.amount) || 0;
      heatData.push({ lat: pos.lat, lng: pos.lng, weight: Math.max(1, Number(t.amount) || 1) });

      if (markersToggle.checked) {
        const marker = new google.maps.Marker({
          position: pos,
          map,
          title: t.card ? `${t.card.name} · NT$${A.fmtNumber(t.amount)}` : '',
          icon: markerIcon(t, maxAmount)
        });
        marker.addListener('click', () => {
          infoWindow.setContent(markerContentHtml(t));
          infoWindow.open(map, marker);
        });
        markers.push(marker);
      }
    });

    heatmap = new CanvasHeatmap(heatData);
    heatmap.setMap(heatmapToggle.checked ? map : null);

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

  // Google Maps JS API loader calls this once the script is ready (see the
  // callback= param in loadScript()).
  window.initGoogleMap = function initGoogleMap() {
    Object.setPrototypeOf(CanvasHeatmap.prototype, google.maps.OverlayView.prototype);
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
      + '&callback=initGoogleMap';
    s.async = true;
    document.head.appendChild(s);
  }

  cardFilter?.addEventListener('change', loadPoints);
  heatmapToggle?.addEventListener('change', () => { if (heatmap) heatmap.setMap(heatmapToggle.checked ? map : null); });
  markersToggle?.addEventListener('change', render);

  loadScript();
})();
