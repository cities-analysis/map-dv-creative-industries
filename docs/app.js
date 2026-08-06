(() => {
  "use strict";

  const DATA_DIR = "data/";
  const COLORS = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"]; // YlGnBu, 6 классов
  const NO_DATA_COLOR = "#e5e7eb";

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
    datasetsMeta: null,
    datasetCache: {},
    currentBaseKey: null, // ключ из dataset-select (без учёта индексации)
    currentIndexed: false,
    currentData: null, // загруженный json
    currentCategory: null, // строка категории (для типа "category")
    currentIndicator: null, // имя колонки
    currentYear: 2025,
    geoLayer: null,
    map: null,
    selectedFeatureLayer: null,
    playTimer: null,
  };

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
    return res.json();
  }

  function displayCategory(cat) {
    return cat ? cat.replace(/^(Организации_|ИП_)/, "") : cat;
  }

  function fmtNumber(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "нет данных";
    const abs = Math.abs(v);
    let opts;
    if (Number.isInteger(v) || abs >= 1000) {
      opts = { maximumFractionDigits: 0 };
    } else if (abs >= 1) {
      opts = { maximumFractionDigits: 2 };
    } else {
      opts = { maximumFractionDigits: 4 };
    }
    return v.toLocaleString("ru-RU", opts);
  }

  async function init() {
    const [datasetsMeta, geo] = await Promise.all([
      fetchJson(DATA_DIR + "datasets.json"),
      fetchJson(DATA_DIR + "geo.json"),
    ]);
    state.datasetsMeta = datasetsMeta;
    state.geo = geo;

    for (const [key, meta] of Object.entries(datasetsMeta)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.title;
      datasetSelect.appendChild(opt);
    }

    initMap();

    datasetSelect.addEventListener("change", () => selectBaseDataset(datasetSelect.value));
    indexedToggle.addEventListener("change", () => {
      state.currentIndexed = indexedToggle.checked;
      loadDataKey(currentDataKey(), { preserveSelections: true });
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

  function initMap() {
    state.map = L.map("map", { zoomControl: true }).setView([55, 135], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 18,
    }).addTo(state.map);

    state.geoLayer = L.geoJSON(state.geo, {
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

  function currentDataKey() {
    const meta = state.datasetsMeta[state.currentBaseKey];
    return state.currentIndexed && meta.indexedKey ? meta.indexedKey : state.currentBaseKey;
  }

  async function selectBaseDataset(baseKey) {
    state.currentBaseKey = baseKey;
    const meta = state.datasetsMeta[baseKey];

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
    if (!state.datasetCache[key]) {
      state.datasetCache[key] = await fetchJson(DATA_DIR + key + ".json");
    }
    const prevCategory = state.currentCategory;
    const prevIndicator = state.currentIndicator;
    const prevYear = state.currentYear;

    state.currentData = state.datasetCache[key];
    const isCategory = !!state.currentData.categories;

    if (isCategory) {
      categoryField.classList.remove("hidden");
      categorySelect.innerHTML = "";
      for (const cat of state.currentData.categories) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = displayCategory(cat);
        categorySelect.appendChild(opt);
      }
      state.currentCategory =
        preserveSelections && state.currentData.categories.includes(prevCategory)
          ? prevCategory
          : state.currentData.categories[0];
      categorySelect.value = state.currentCategory;
    } else {
      categoryField.classList.add("hidden");
      state.currentCategory = null;
    }

    indicatorSelect.innerHTML = "";
    for (const col of state.currentData.columns) {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = (state.currentData.columnLabels && state.currentData.columnLabels[col]) || col;
      indicatorSelect.appendChild(opt);
    }
    state.currentIndicator =
      preserveSelections && state.currentData.columns.includes(prevIndicator)
        ? prevIndicator
        : state.currentData.columns[0];
    indicatorSelect.value = state.currentIndicator;

    const years = state.currentData.years;
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
    const offset = data.categories ? 3 : 2; // [muniIdx, year, catIdx?, ...values]
    return offset + data.columns.indexOf(state.currentIndicator);
  }

  function computeValues() {
    const data = state.currentData;
    const isCategory = !!data.categories;
    const catIdx = isCategory ? data.categories.indexOf(state.currentCategory) : -1;
    const colIdx = currentColumnIndex();
    const values = new Map(); // muni name -> value

    for (const row of data.rows) {
      if (row[1] !== state.currentYear) continue;
      if (isCategory && row[2] !== catIdx) continue;
      const muniName = data.municipalities[row[0]];
      const v = row[colIdx];
      values.set(muniName, v);
    }
    return values;
  }

  function classify(values) {
    const nums = [...values.values()].filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    if (nums.length === 0) return { breaks: [], color: () => NO_DATA_COLOR };
    nums.sort((a, b) => a - b);
    const nClasses = Math.min(COLORS.length, new Set(nums).size);
    if (nClasses <= 1) {
      const only = nums[0];
      return { breaks: [only, only], color: (v) => (v === null || v === undefined ? NO_DATA_COLOR : COLORS[COLORS.length - 1]) };
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
    return {
      fillColor: color || NO_DATA_COLOR,
      weight: 0.8,
      color: "#94a3b8",
      fillOpacity: 0.85,
    };
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
    for (let i = 0; i < nClasses; i++) {
      html += `<span style="background:${COLORS[i]}"></span>`;
    }
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
      const row = data.rows.find(
        (r) => r[0] === muniIdx && r[1] === y && (!isCategory || r[2] === catIdx)
      );
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

  init().catch((err) => {
    console.error(err);
    document.getElementById("panel").innerHTML = `<p style="color:red">Ошибка загрузки данных: ${err.message}</p>`;
  });
})();
