const MapView = (() => {
  "use strict";

  const COLORS = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"]; // YlGnBu, 6 классов
  const NO_DATA_COLOR = "#e5e7eb";
  const { displayCategory, defaultCategory, fmtNumber } = DataStore;

  const el = (id) => document.getElementById(id);
  const datasetSelect = el("dataset-select");
  const indexedField = el("indexed-field");
  const indexedToggle = el("indexed-toggle");
  const categoryField = el("category-field");
  const categorySelect = el("category-select");
  const indicatorSelect = el("indicator-select");
  const yearSelect = el("year-select");
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
    yearSelect.addEventListener("change", () => {
      state.currentYear = Number(yearSelect.value);
      refresh();
    });
    legendEl.addEventListener("click", (e) => {
      const link = e.target.closest("[data-year]");
      if (!link) return;
      e.preventDefault();
      state.currentYear = Number(link.dataset.year);
      yearSelect.value = state.currentYear;
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
    state.map = L.map("map", {
      zoomControl: true,
      worldCopyJump: false,
      minZoom: 3,
      maxBounds: [
        [-85, -200],
        [85, 200],
      ],
      maxBoundsViscosity: 1,
    }).setView([55, 135], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
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
            e.target.setStyle(e.target._choroplethStyle || styleFor(null));
          },
          click: () => onFeatureClick(feature),
        });
      },
    }).addTo(state.map);

    // На холодной загрузке контейнер карты иногда ещё не получил
    // окончательные размеры от раскладки страницы, из-за чего Leaflet
    // неверно измеряет его и fitBounds ниже может посчитать абсурдный зум.
    state.map.invalidateSize();

    // Данные помимо "ядра" Дальнего Востока включают и часть западных
    // муниципалитетов Забайкалья (до ~98° в.д.), из-за чего fitBounds по
    // всем данным сильно отдалял карту и обрезал акцент с самого ДВ. Поэтому
    // по умолчанию центрируемся на фиксированной рамке вокруг основного
    // региона ДВ, а не на фактическом bbox всех данных.
    state.map.fitBounds(
      [
        [42, 118],
        [78, 195],
      ],
      { padding: [10, 10] }
    );
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
        preserveSelections && data.categories.includes(prevCategory) ? prevCategory : defaultCategory(data.categories);
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
    yearSelect.innerHTML = "";
    for (const y of years) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    state.currentYear = preserveSelections && years.includes(prevYear) ? prevYear : years[years.length - 1];
    yearSelect.value = state.currentYear;

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

  const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  // Верхние границы k классов с равным числом значений в каждом
  function quantileUppers(pos, k) {
    const uppers = [];
    for (let i = 1; i <= k; i++) uppers.push(pos[Math.min(pos.length - 1, Math.ceil((i / k) * pos.length) - 1)]);
    return uppers;
  }

  // Округление вверх до "круглого" числа из ряда 1-2-5 (…, 1, 2, 5, 10, 20, 50, 100, …)
  function niceCeil(x) {
    const base = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / base;
    return base * (m <= 1.0000001 ? 1 : m <= 2.0000001 ? 2 : m <= 5.0000001 ? 5 : 10);
  }

  // Верхние границы k классов по порядку величины: отношение соседних границ примерно
  // постоянно, а сами границы округлены до "круглых" чисел. Последняя граница - максимум.
  function geometricUppers(pos, k) {
    const min = pos[0];
    const max = pos[pos.length - 1];
    const uppers = [];
    for (let i = 1; i < k; i++) {
      const edge = niceCeil(min * Math.pow(max / min, i / k));
      if (edge < max) uppers.push(edge);
    }
    uppers.push(max);
    return uppers;
  }

  const unique = (arr) => arr.filter((v, i) => i === 0 || v > arr[i - 1]);

  // Классы: класс i = (breaks[i], breaks[i+1]]. Если среди значений есть нули, ноль - отдельный
  // (самый светлый) класс: у многих показателей нулей большинство, и квантили на них вырождаются
  // ("0, 0, 0, 0, 0, 1, 72"). Остальные значения делятся на квантили, а при повторяющихся
  // значениях или длинном хвосте - на классы по порядку величины (см. geometricUppers).
  function classify(values) {
    const nums = [...values.values()].filter(isNum).sort((a, b) => a - b);
    // Нет значений вовсе или везде ноль: в этих данных нули вместо пропусков означают, что
    // статистика за год ещё не опубликована, поэтому закрашивать карту как "0" было бы неверно.
    if (nums.length === 0 || nums[nums.length - 1] === 0) return { breaks: [], colors: [], color: () => NO_DATA_COLOR };

    const hasZero = nums[0] === 0 && nums[nums.length - 1] > 0;
    const pos = hasZero ? nums.filter((v) => v > 0) : nums;
    const k = Math.min(hasZero ? COLORS.length - 1 : COLORS.length, new Set(pos).size);

    let uppers = unique(quantileUppers(pos, k));
    // Геометрическая шкала нужна, если квантили не набрали k классов (много одинаковых значений)
    // или верхний класс охватывает больше порядка величины ("длинный хвост": Владивосток на фоне
    // остальных), а все значения положительны.
    const tooFew = uppers.length < k;
    const longTail = uppers.length >= 2 && uppers[uppers.length - 1] / uppers[uppers.length - 2] > 10;
    if ((tooFew || longTail) && pos[0] > 0 && pos[pos.length - 1] / pos[0] > 10) {
      uppers = unique(geometricUppers(pos, k));
    }

    const breaks = hasZero ? [0, 0, ...uppers] : [pos[0], ...uppers];
    const n = breaks.length - 1;
    const colors = Array.from({ length: n }, (_, c) =>
      n === 1 ? COLORS[COLORS.length - 1] : COLORS[Math.round((c * (COLORS.length - 1)) / (n - 1))]
    );
    const offset = hasZero ? 1 : 0;
    const color = (v) => {
      if (!isNum(v)) return NO_DATA_COLOR;
      if (hasZero && v === 0) return colors[0];
      const j = uppers.findIndex((u) => v <= u);
      return colors[offset + (j === -1 ? uppers.length - 1 : j)];
    };
    return { breaks, colors, color };
  }

  function styleFor(color) {
    return { fillColor: color || NO_DATA_COLOR, weight: 0.8, color: "#94a3b8", fillOpacity: 0.85 };
  }

  function refresh() {
    if (!state.currentData) return;
    const values = computeValues();
    const { breaks, colors, color } = classify(values);

    state.geoLayer.eachLayer((layer) => {
      const name = layer.feature.properties.QGIS_name;
      const v = values.has(name) ? values.get(name) : null;
      const style = styleFor(color(v));
      layer._choroplethStyle = style;
      layer.setStyle(style);
      const label = (state.currentData.columnLabels && state.currentData.columnLabels[state.currentIndicator]) || state.currentIndicator;
      layer.unbindTooltip();
      layer.bindTooltip(`<b>${name}</b><br>${label}: ${fmtNumber(v)}`, { className: "muni-tooltip", sticky: true });
    });

    renderLegend(breaks, colors, breaks.length ? null : lastYearWithData());
    if (!detailPanel.classList.contains("hidden") && state.selectedFeature) {
      renderDetail(state.selectedFeature);
    }
  }

  // Последний год, в котором у выбранного показателя есть хоть одно ненулевое значение
  function lastYearWithData() {
    const data = state.currentData;
    const catIdx = data.categories ? data.categories.indexOf(state.currentCategory) : -1;
    const colIdx = currentColumnIndex();
    let last = null;
    for (const row of data.rows) {
      if (data.categories && row[2] !== catIdx) continue;
      const v = row[colIdx];
      if (v !== null && v !== undefined && v !== 0 && (last === null || row[1] > last)) last = row[1];
    }
    return last;
  }

  function renderLegend(breaks, colors, lastYear) {
    const label = (state.currentData.columnLabels && state.currentData.columnLabels[state.currentIndicator]) || state.currentIndicator;
    const hint = lastYear
      ? ` — последний год с данными: <a href="#" class="legend-link" data-year="${lastYear}">${lastYear}</a>`
      : "";
    legendEl.innerHTML = DataStore.legendHtml({
      title: label + (state.currentCategory ? " — " + displayCategory(state.currentCategory) : ""),
      colors,
      breaks,
      emptyText: `Нет данных за ${state.currentYear} год${hint}`,
      noDataText: "нет данных",
    });
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
      const years = state.currentData.years;
      const next = state.currentYear >= years[years.length - 1] ? years[0] : state.currentYear + 1;
      state.currentYear = next;
      yearSelect.value = next;
      refresh();
    }, 1200);
  }

  return { init, onShow };
})();
