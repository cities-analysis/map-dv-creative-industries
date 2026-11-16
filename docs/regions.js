const RegionsView = (() => {
  "use strict";

  const { fmtNumber, fmtCompact } = DataStore;
  const el = (id) => document.getElementById(id);

  const PALETTE = ["#e6f2f3", "#bfe0e3", "#8ac6cd", "#4aa3af", "#1d6f7e"]; // одноцветная бирюзовая шкала
  const NO_DATA = "#e9edef";
  const BORDER = "#ffffff";
  const BORDER_ACTIVE = "#0f3d47";

  // Группы показателей для выпадающего списка; всё, чего нет в списке, попадёт в "Прочее".
  const GROUPS = [
    ["Финансы", ["revenues", "fixed_assets", "wages"]],
    ["Концентрация (HHI)", ["hhi_revenues", "hhi_fixed_assets", "hhi_wages"]],
    [
      "Индекс Тейла",
      ["ti_revenues", "ti_w_revenues", "ti_b_revenues", "ti_fixed_assets", "ti_w_fixed_assets", "ti_b_fixed_assets", "ti_wages", "ti_w_wages", "ti_b_wages"],
    ],
    [
      "Организации и ИП",
      ["existing_total", "existing_orgs", "registered_orgs", "liquidated_orgs", "existing_ip", "registered_ip", "liquidated_ip"],
    ],
    ["Труд", ["ssch", "labor_productivity", "capital_labor_ratio", "avg_labor_cost"]],
  ];
  const UNITS = {
    revenues: "₽",
    fixed_assets: "₽",
    wages: "₽",
    labor_productivity: "₽",
    capital_labor_ratio: "₽",
    avg_labor_cost: "₽",
    ssch: "чел.",
  };
  // Показатели в плитках боковой панели региона
  const KPI = ["revenues", "fixed_assets", "wages", "existing_orgs", "existing_ip", "ssch"];
  const DEFAULT_INDICATOR = "revenues";

  // Подписи на карте: короткие названия (для длинных) и ручная подстройка положения/размера.
  // dx/dy - сдвиг в градусах (долгота/широта), size - множитель размера шрифта,
  // outside - подпись вынесена за контур региона (на фон карты), цвет не зависит от заливки.
  const SHORT_NAMES = {
    "Республика Бурятия": "Бурятия",
    "Республика Саха (Якутия)": "Республика Саха (Якутия)",
    "Еврейская автономная область": "Еврейская АО",
    "Чукотский автономный округ": "Чукотский АО",
  };
  const LABEL_TWEAKS = {
    "Еврейская автономная область": { size: 0.78 },
    "Сахалинская область": { size: 0.85, dx: 3.6, dy: 0.4, outside: true },
    "Хабаровский край": { dx: 2.2, dy: 2.6 },
    "Амурская область": { dx: -1.2, dy: 0.5 },
    "Приморский край": { dy: -0.4 },
    "Республика Бурятия": { size: 0.9 },
  };

  const state = {
    initialized: false,
    data: null,
    byKey: [null, null], // [обычные, индексированные]: Map "регион|год" -> строка
    colIdx: {},
    regionIdx: {},
    map: null,
    geoLayer: null,
    layers: {}, // имя региона -> слой Leaflet
    features: {}, // имя региона -> GeoJSON-фича
    labelLayer: null,
    labels: {}, // имя региона -> {marker, outside}
    hoverOutline: null,
    selectOutline: null,
    indicator: DEFAULT_INDICATOR,
    year: null,
    indexed: false,
    selected: null,
    breaks: [],
    playTimer: null,
    chart: null,
  };

  const indicatorSelect = el("rg-indicator");
  const yearSelect = el("rg-year");
  const playBtn = el("rg-play");
  const indexedToggle = el("rg-indexed");
  const legendEl = el("rg-legend");
  const detailEl = el("rg-detail");

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const [data, geo] = await Promise.all([DataStore.loadJson("regions.json"), DataStore.loadJson("regions_geo.json")]);
    state.data = data;
    state.byKey = [buildIndex(data.rows), buildIndex(data.rowsIndexed)];
    state.colIdx = Object.fromEntries(data.columns.map((c, i) => [c, i + 2]));
    state.regionIdx = Object.fromEntries(data.regions.map((r, i) => [r, i]));
    state.year = data.years[data.years.length - 1];

    fillIndicatorSelect();
    for (const y of data.years) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = state.year;

    initMap(geo);
    bindEvents();
    refresh();
  }

  function buildIndex(rows) {
    return new Map(rows.map((r) => [`${r[0]}|${r[1]}`, r]));
  }

  function valueOf(region, year, col = state.indicator, indexed = state.indexed) {
    const row = state.byKey[indexed ? 1 : 0].get(`${state.regionIdx[region]}|${year}`);
    return row ? row[state.colIdx[col]] : null;
  }

  function labelOf(col) {
    return state.data.columnLabels[col] || col;
  }

  function fmtValue(v, col = state.indicator) {
    if (v === null || v === undefined) return "нет данных";
    return fmtNumber(v) + (UNITS[col] ? " " + UNITS[col] : "");
  }

  function fillIndicatorSelect() {
    const known = new Set(GROUPS.flatMap(([, cols]) => cols));
    const groups = GROUPS.map(([title, cols]) => [title, cols.filter((c) => c in state.colIdx)]);
    const rest = state.data.columns.filter((c) => !known.has(c));
    if (rest.length) groups.push(["Прочее", rest]);
    for (const [title, cols] of groups) {
      if (!cols.length) continue;
      const group = document.createElement("optgroup");
      group.label = title;
      for (const c of cols) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = labelOf(c);
        group.appendChild(opt);
      }
      indicatorSelect.appendChild(group);
    }
    indicatorSelect.value = state.indicator;
  }

  function initMap(geo) {
    state.map = L.map("rg-map", {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      minZoom: 2,
    });
    state.geoLayer = L.geoJSON(geo, {
      style: () => ({ fillColor: NO_DATA, fillOpacity: 1, color: BORDER, weight: 1.5 }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties.region;
        state.layers[name] = layer;
        state.features[name] = feature;
        layer.on({
          mouseover: () => showOutline(state.hoverOutline, name),
          mouseout: () => showOutline(state.hoverOutline, null),
          click: () => select(name === state.selected ? null : name),
        });
      },
    }).addTo(state.map);
    // Контуры наведённого/выбранного региона - отдельные слои поверх. Сами
    // регионы не переставляются в DOM: перестановка при наведении "съедала"
    // клик (особенно первое касание на тач-экране).
    const outline = (weight) => L.geoJSON(null, { style: { fill: false, color: BORDER_ACTIVE, weight }, interactive: false }).addTo(state.map);
    state.hoverOutline = outline(2.5);
    state.selectOutline = outline(3.5);
    state.labelLayer = L.layerGroup().addTo(state.map);
    addLabels();
    state.bounds = state.geoLayer.getBounds();
    state.map.on("zoomend resize", updateLabelScale);
    state.map.setMaxBounds(state.bounds.pad(0.6));
    fitAll();
    updateLabelScale();
  }

  // Подписи регионов: всегда видны, не перехватывают мышь. Позиция - "полюс недоступности"
  // самого большого полигона региона (точка, наиболее удалённая от границ), поэтому
  // подпись не уезжает в море у вытянутых и составных регионов.
  function addLabels() {
    for (const [name, feature] of Object.entries(state.features)) {
      const pos = labelPoint(feature.geometry);
      if (!pos) continue;
      const tweak = LABEL_TWEAKS[name] || {};
      const text = escapeHtml(SHORT_NAMES[name] || name);
      const icon = L.divIcon({
        className: "rg-label-wrap",
        html: `<span class="rg-label" style="font-size:calc(var(--rg-scale, 1) * ${(tweak.size || 1) * 12.5}px)">${text}</span>`,
        iconSize: [0, 0],
      });
      state.labels[name] = {
        outside: !!tweak.outside,
        marker: L.marker([pos[1] + (tweak.dy || 0), pos[0] + (tweak.dx || 0)], { icon, interactive: false, keyboard: false }).addTo(state.labelLayer),
      };
    }
  }

  // Размер подписей следует за масштабом карты: ширина региона на экране ~625px = базовый размер.
  function updateLabelScale() {
    const nw = state.map.latLngToContainerPoint(state.bounds.getNorthWest());
    const se = state.map.latLngToContainerPoint(state.bounds.getSouthEast());
    const scale = Math.max(0.6, Math.min(1.7, Math.abs(se.x - nw.x) / 625));
    state.map.getContainer().style.setProperty("--rg-scale", scale.toFixed(3));
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function labelPoint(geometry) {
    const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
    let best = null;
    let bestArea = -1;
    for (const poly of polys) {
      const a = Math.abs(ringArea(poly[0]));
      if (a > bestArea) {
        bestArea = a;
        best = poly;
      }
    }
    return best ? poleOfInaccessibility(best) : null;
  }

  function ringArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return a / 2;
  }

  function poleOfInaccessibility(poly) {
    const rings = poly;
    const outer = rings[0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180); // сжатие долготы на этой широте
    const inside = (x, y) => {
      let c = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
      }
      return c;
    };
    const dist = (x, y) => {
      let d = Infinity;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const ax = ring[j][0] * k, ay = ring[j][1], bx = ring[i][0] * k, by = ring[i][1];
          const px = x * k, dx = bx - ax, dy = by - ay;
          const len = dx * dx + dy * dy;
          let t = len ? ((px - ax) * dx + (y - ay) * dy) / len : 0;
          t = Math.max(0, Math.min(1, t));
          const ex = ax + t * dx - px, ey = ay + t * dy - y;
          d = Math.min(d, ex * ex + ey * ey);
        }
      }
      return Math.sqrt(d);
    };
    let best = [(minX + maxX) / 2, (minY + maxY) / 2];
    let bestD = -1;
    let sx = (maxX - minX) / 24, sy = (maxY - minY) / 24;
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    let w = maxX - minX, h = maxY - minY;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i <= 24; i++) {
        for (let j = 0; j <= 24; j++) {
          const x = cx - w / 2 + (w * i) / 24;
          const y = cy - h / 2 + (h * j) / 24;
          if (!inside(x, y)) continue;
          const d = dist(x, y);
          if (d > bestD) {
            bestD = d;
            best = [x, y];
          }
        }
      }
      cx = best[0];
      cy = best[1];
      w = sx * 4;
      h = sy * 4;
      sx /= 6;
      sy /= 6;
    }
    return best;
  }

  // Карта вписывается в свободную область: слева - панель фильтров, справа -
  // панель региона (когда открыта), снизу - легенда.
  function fitAll() {
    state.map.invalidateSize();
    const wide = window.innerWidth > 720;
    const rightPad = wide && state.selected ? 380 : 20;
    state.map.fitBounds(state.bounds, { paddingTopLeft: [wide ? 330 : 20, 20], paddingBottomRight: [rightPad, 90] });
  }

  function bindEvents() {
    indicatorSelect.addEventListener("change", () => {
      state.indicator = indicatorSelect.value;
      refresh();
    });
    yearSelect.addEventListener("change", () => {
      state.year = Number(yearSelect.value);
      refresh();
    });
    indexedToggle.addEventListener("change", () => {
      state.indexed = indexedToggle.checked;
      refresh();
    });
    playBtn.addEventListener("click", togglePlay);
    el("rg-zoom-in").addEventListener("click", () => state.map.zoomIn());
    el("rg-zoom-out").addEventListener("click", () => state.map.zoomOut());
    el("rg-zoom-reset").addEventListener("click", fitAll);
    el("rg-detail-close").addEventListener("click", () => select(null));
  }

  function onShow() {
    if (state.map) state.map.invalidateSize();
  }

  // Классы считаются по значениям за ВСЕ годы выбранного показателя, чтобы цвета
  // были сопоставимы между годами (иначе при перемотке шкала "прыгала" бы).
  function computeBreaks() {
    const col = state.colIdx[state.indicator];
    const rows = state.indexed ? state.data.rowsIndexed : state.data.rows;
    const vals = rows.map((r) => r[col]).filter((v) => v !== null);
    vals.sort((a, b) => a - b);
    if (!vals.length) return [];
    const n = PALETTE.length;
    const raw = [];
    for (let i = 0; i <= n; i++) raw.push(vals[Math.min(vals.length - 1, Math.round((i / n) * (vals.length - 1)))]);
    return raw.filter((v, i) => i === 0 || v > raw[i - 1]);
  }

  function colorFor(v) {
    if (v === null || v === undefined || state.breaks.length < 2) return NO_DATA;
    const classes = state.breaks.length - 1;
    let k = classes - 1;
    for (let i = 0; i < classes; i++) {
      if (v <= state.breaks[i + 1]) {
        k = i;
        break;
      }
    }
    return PALETTE[Math.round((k * (PALETTE.length - 1)) / Math.max(classes - 1, 1))];
  }

  function applyStyle(name) {
    const fill = colorFor(valueOf(name, state.year));
    state.layers[name].setStyle({ fillColor: fill, fillOpacity: 1, color: BORDER, weight: 1.5 });
    // На тёмной заливке подпись светлая, на светлой - тёмная
    const label = state.labels[name];
    const span = label && label.marker.getElement() && label.marker.getElement().firstChild;
    if (span) span.classList.toggle("on-dark", !label.outside && isDark(fill));
  }

  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum < 0.55;
  }

  function showOutline(group, name) {
    group.clearLayers();
    if (name) group.addData(state.features[name]);
  }

  function refresh() {
    state.breaks = computeBreaks();
    for (const name of Object.keys(state.layers)) {
      applyStyle(name);
      const v = valueOf(name, state.year);
      state.layers[name].unbindTooltip();
      state.layers[name].bindTooltip(`<b>${name}</b><br>${labelOf(state.indicator)}: ${fmtValue(v)}`, {
        className: "rg-tooltip",
        sticky: true,
      });
    }
    renderLegend();
    if (state.selected) renderDetail();
  }

  function renderLegend() {
    const classes = state.breaks.length - 1;
    const anyData = state.data.regions.some((r) => valueOf(r, state.year) !== null);
    const unit = UNITS[state.indicator] ? ", " + UNITS[state.indicator] : "";
    legendEl.innerHTML = DataStore.legendHtml({
      title: labelOf(state.indicator) + unit,
      colors: Array.from({ length: Math.max(classes, 0) }, (_, i) => PALETTE[Math.round((i * (PALETTE.length - 1)) / Math.max(classes - 1, 1))]),
      breaks: state.breaks,
      emptyText: "Нет данных по показателю",
      noDataText: anyData ? "нет данных" : `нет данных за ${state.year} год`,
    });
  }

  function select(name) {
    const wasOpen = !!state.selected;
    state.selected = name;
    showOutline(state.selectOutline, name);
    if (!name) {
      detailEl.classList.add("hidden");
      destroyChart();
      fitAll();
      return;
    }
    detailEl.classList.remove("hidden");
    renderDetail();
    if (!wasOpen) fitAll();
  }

  function renderDetail() {
    const name = state.selected;
    el("rg-detail-name").textContent = name;

    const v = valueOf(name, state.year);
    const ranked = state.data.regions
      .map((r) => [r, valueOf(r, state.year)])
      .filter(([, x]) => x !== null)
      .sort((a, b) => b[1] - a[1]);
    const place = ranked.findIndex(([r]) => r === name) + 1;
    el("rg-detail-sub").innerHTML =
      `${labelOf(state.indicator)}, ${state.year}<br><b>${fmtValue(v)}</b>` +
      (place ? ` <span class="rg-rank">· ${place}-е место из ${ranked.length}</span>` : "");

    el("rg-kpi").innerHTML = KPI.filter((c) => c in state.colIdx)
      .map((c) => {
        const x = valueOf(name, state.year, c);
        return `<div class="rg-kpi-item"><div class="rg-kpi-label">${labelOf(c)}</div><div class="rg-kpi-value">${
          x === null ? "нет данных" : fmtCompact(x) + (UNITS[c] ? " " + UNITS[c] : "")
        }</div></div>`;
      })
      .join("");

    drawChart(name);
  }

  function destroyChart() {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
  }

  function drawChart(name) {
    destroyChart();
    const years = state.data.years;
    const series = years.map((y) => valueOf(name, y));
    const unit = UNITS[state.indicator] ? " " + UNITS[state.indicator] : "";
    state.chart = new Chart(el("rg-chart").getContext("2d"), {
      type: "line",
      data: {
        labels: years,
        datasets: [
          {
            data: series,
            borderColor: PALETTE[4],
            backgroundColor: "rgba(29,111,126,0.12)",
            fill: true,
            tension: 0.25,
            borderWidth: 2,
            pointRadius: years.map((y) => (y === state.year ? 5 : 2)),
            pointBackgroundColor: years.map((y) => (y === state.year ? BORDER_ACTIVE : PALETTE[4])),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmtNumber(c.raw) + unit } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { callback: (v) => fmtCompact(v) }, grid: { color: "#eef1f3" } },
        },
      },
    });
  }

  function togglePlay() {
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
      playBtn.classList.remove("active");
      playBtn.textContent = "▶";
      return;
    }
    playBtn.classList.add("active");
    playBtn.textContent = "⏸";
    state.playTimer = setInterval(() => {
      const years = state.data.years;
      state.year = state.year >= years[years.length - 1] ? years[0] : state.year + 1;
      yearSelect.value = state.year;
      refresh();
    }, 1200);
  }

  return { init, onShow };
})();
