const MapView = (() => {
  "use strict";

  const COLORS = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"]; // YlGnBu, 6 классов
  const NO_DATA_COLOR = "#e5e7eb";
  const { displayCategory, fmtNumber } = DataStore;

  const el = (id) => document.getElementById(id);
  const datasetSelect = el("dataset-select");
  const indexedField = el("indexed-field");
  const indexedToggle = el("indexed-toggle");
  const categoryField = el("category-field");
  const categorySelect = el("category-select");
  const indicatorSelect = el("indicator-select");
  const yearSlider = el("year-slider");
  const yearLabel = el("year-label");
  const playBtn = el("play-btn");
  const legendEl = el("legend");
  const detailPanel = el("detail-panel");
  const detailName = el("detail-name");
  const detailValue = el("detail-value");
  const detailClose = el("detail-close");
  const detailChart = el("detail-chart");

  const state = {
    currentBaseKey: null,
    currentIndexed: false,
    currentData: null,
    currentCategory: null,
    currentIndicator: null,
    currentYear: 2025,
    geoLayer: null,
    map: null,
    selectedFeature: null,
    playTimer: null,
    initialized: false,
  };

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const { datasetsMeta } = await DataStore.loadMeta();
    const geo = await DataStore.loadGeo();

    for (const [key, meta] of Object.entries(datasetsMeta)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.title;
      datasetSelect.appendChild(opt);
    }

    initMap(geo);

    datasetSelect.addEventListener("change", () => selectBaseDataset(datasetSelect.value));
    indexedToggle.addEventListener("change", () => {
      state.currentIndexed = indexedToggle.checked;
      loadDataKey(DataStore.dataKeyFor(state.currentBaseKey, state.currentIndexed), { preserveSelections: true });
    });
    categorySelect.addEventListener("change", () => {
      state.currentCategory = categorySelect.value;
      refresh();
    });
    indicatorSelect.addEventListener("change", () => {
      state.currentIndicator = indicatorSelect.value;
      refresh();
    });
    yearSlider.addEventListener("input", () => {
      state.currentYear = Number(yearSlider.value);
      yearLabel.textContent = state.currentYear;
      refresh();
    });
    playBtn.addEventListener("click", togglePlay);
    detailClose.addEventListener("click", () => detailPanel.classList.add("hidden"));

    const firstKey = Object.keys(datasetsMeta)[0];
    datasetSelect.value = firstKey;
    await selectBaseDataset(firstKey);
  }

  function onShow() {
    if (state.map) state.map.invalidateSize();
  }

  function initMap(geo) {
    state.map = L.map("map", { zoomControl: true }).setView([55, 135], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 18,
    }).addTo(state.map);

    state.geoLayer = L.geoJSON(geo, {
      style: () => styleFor(null),
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({ weight: 2, color: "#111827" });
            e.target.bringToFront();
          },
          mouseout: (e) => {
            state.geoLayer.resetStyle(e.target);
          },
          click: () => onFeatureClick(feature),
        });
      },
    }).addTo(state.map);

    try {
      const b = state.geoLayer.getBounds();
      const lngSpan = b.getEast() - b.getWest();
      if (b.isValid() && lngSpan > 0 && lngSpan < 180) {
        state.map.fitBounds(b, { padding: [10, 10] });
      }
    } catch (e) {
      /* используем дефолтный view, если границы не удалось вычислить */
    }
  }

  async function selectBaseDataset(baseKey) {
    state.currentBaseKey = baseKey;
    const meta = DataStore.datasetsMeta[baseKey];

    if (meta.indexedKey) {
      indexedField.classList.remove("hidden");
    } else {
      indexedField.classList.add("hidden");
    }
    state.currentIndexed = false;
    indexedToggle.checked = false;

    await loadDataKey(baseKey, { preserveSelections: false });
  }

  async function loadDataKey(key, { preserveSelections }) {
    const data = await DataStore.loadDataset(key);
    const prevCategory = state.currentCategory;
    const prevIndicator = state.currentIndicator;
    const prevYear = state.currentYear;

    state.currentData = data;
    const isCategory = !!data.categories;

    if (isCategory) {
      categoryField.classList.remove("hidden");
      categorySelect.innerHTML = "";
      for (const cat of data.categories) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = displayCategory(cat);
        categorySelect.appendChild(opt);
      }
      state.currentCategory =
        preserveSelections && data.categories.includes(prevCategory) ? prevCategory : data.categories[0];
      categorySelect.value = state.currentCategory;
    } else {
      categoryField.classList.add("hidden");
      state.currentCategory = null;
    }

    indicatorSelect.innerHTML = "";
    for (const col of data.columns) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = (data.columnLabels && data.columnLabels[col]) || col;
      indicatorSelect.appendChild(opt);
    }
    state.currentIndicator =
      preserveSelections && data.columns.includes(prevIndicator) ? prevIndicator : data.columns[0];
    indicatorSelect.value = state.currentIndicator;

    const years = data.years;
    yearSlider.min = years[0];
    yearSlider.max = years[years.length - 1];
    state.currentYear =
      preserveSelections && prevYear >= years[0] && prevYear <= years[years.length - 1]
        ? prevYear
        : years[years.length - 1];
    yearSlider.value = state.currentYear;
    yearLabel.textContent = state.currentYear;

    if (!preserveSelections) detailPanel.classList.add("hidden");
    refresh();
  }

  function currentColumnIndex() {
    const data = state.currentData;
    const offset = data.categories ? 3 : 2;
    return offset + data.columns.indexOf(state.currentIndicator);
  }

  function computeValues() {
    const data = state.currentData;
    const isCategory = !!data.categories;
    const catIdx = isCategory ? data.categories.indexOf(state.currentCategory) : -1;
    const colIdx = currentColumnIndex();
    const values = new Map();

    for (const row of data.rows) {
      if (row[1] !== state.currentYear) continue;
      if (isCategory && row[2] !== catIdx) continue;
      const muniName = data.municipalities[row[0]];
      values.set(muniName, row[colIdx]);
    }
    return values;
  }

  function classify(values) {
    const nums = [...values.values()].filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    if (nums.length === 0) return { breaks: [], color: () => NO_DATA_COLOR };
    nums.sort((a, b) => a - b);
    const nClasses = Math.min(COLORS.length, new Set(nums).size);
    if (nClasses <= 1) {
      return { breaks: [nums[0], nums[0]], color: (v) => (v === null || v === undefined ? NO_DATA_COLOR : COLORS[COLORS.length - 1]) };
    }
    const breaks = [];
    for (let i = 0; i <= nClasses; i++) {
      const idx = Math.min(nums.length - 1, Math.round((i / nClasses) * (nums.length - 1)));
      breaks.push(nums[idx]);
    }
    const color = (v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return NO_DATA_COLOR;
      for (let i = 0; i < nClasses; i++) {
        if (v <= breaks[i + 1] || i === nClasses - 1) return COLORS[i];
      }
      return COLORS[nClasses - 1];
    };
    return { breaks, color, nClasses };
  }

  function styleFor(color) {
    return { fillColor: color || NO_DATA_COLOR, weight: 0.8, color: "#94a3b8", fillOpacity: 0.85 };
  }

  function refresh() {
    if (!state.currentData) return;
    const values = computeValues();
    const { breaks, color, nClasses } = classify(values);

    state.geoLayer.eachLayer((layer) => {
      const name = layer.feature.properties.QGIS_name;
      const v = values.has(name) ? values.get(name) : null;
      layer.setStyle(styleFor(color(v)));
      const label = (state.currentData.columnLabels && state.currentData.columnLabels[state.currentIndicator]) || state.currentIndicator;
      layer.unbindTooltip();
      layer.bindTooltip(`<b>${name}</b><br>${label}: ${fmtNumber(v)}`, { className: "muni-tooltip", sticky: true });
    });

    renderLegend(breaks, nClasses);
    if (!detailPanel.classList.contains("hidden") && state.selectedFeature) {
      renderDetail(state.selectedFeature);
    }
  }

  function renderLegend(breaks, nClasses) {
    const label = (state.currentData.columnLabels && state.currentData.columnLabels[state.currentIndicator]) || state.currentIndicator;
    let html = `<div class="legend-title">${label}${state.currentCategory ? " — " + displayCategory(state.currentCategory) : ""}</div>`;
    if (!breaks.length) {
      html += `<div class="legend-nodata"><span class="swatch"></span> Нет данных за ${state.currentYear} год</div>`;
      legendEl.innerHTML = html;
      return;
    }
    html += '<div class="legend-scale">';
    for (let i = 0; i < nClasses; i++) html += `<span style="background:${COLORS[i]}"></span>`;
    html += "</div>";
    html += `<div class="legend-labels"><span>${fmtNumber(breaks[0])}</span><span>${fmtNumber(breaks[breaks.length - 1])}</span></div>`;
    html += `<div class="legend-nodata"><span class="swatch"></span> Нет данных</div>`;
    legendEl.innerHTML = html;
  }

  function onFeatureClick(feature) {
    state.selectedFeature = feature;
    renderDetail(feature);
  }

  function renderDetail(feature) {
    const name = feature.properties.QGIS_name;
    detailPanel.classList.remove("hidden");
    detailName.textContent = name;

    const data = state.currentData;
    const isCategory = !!data.categories;
    const catIdx = isCategory ? data.categories.indexOf(state.currentCategory) : -1;
    const colIdx = currentColumnIndex();
    const muniIdx = data.municipalities.indexOf(name);

    const series = data.years.map((y) => {
      const row = data.rows.find((r) => r[0] === muniIdx && r[1] === y && (!isCategory || r[2] === catIdx));
      return row ? row[colIdx] : null;
    });

    const label = (data.columnLabels && data.columnLabels[state.currentIndicator]) || state.currentIndicator;
    const curVal = series[data.years.indexOf(state.currentYear)];
    detailValue.textContent = `${label}, ${state.currentYear}: ${fmtNumber(curVal)}`;

    drawSparkline(detailChart, data.years, series);
  }

  function drawSparkline(canvas, years, series) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pts = years.map((y, i) => [y, series[i]]).filter(([, v]) => v !== null && v !== undefined);
    if (pts.length < 2) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px sans-serif";
      ctx.fillText("Недостаточно данных для графика", 8, h / 2);
      return;
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const pad = 8;
    const xScale = (x) => pad + ((x - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
    const yScale = (y) => h - pad - ((y - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = xScale(x), py = yScale(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = "#2563eb";
    pts.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(xScale(x), yScale(y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#6b7280";
    ctx.font = "10px sans-serif";
    ctx.fillText(String(xMin), pad, h - 1);
    ctx.textAlign = "right";
    ctx.fillText(String(xMax), w - pad, h - 1);
    ctx.textAlign = "left";
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
      const min = Number(yearSlider.min), max = Number(yearSlider.max);
      let next = state.currentYear + 1;
      if (next > max) next = min;
      state.currentYear = next;
      yearSlider.value = next;
      yearLabel.textContent = next;
      refresh();
    }, 1200);
  }

  return { init, onShow };
})();
