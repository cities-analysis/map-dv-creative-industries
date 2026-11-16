const ChartsView = (() => {
  "use strict";

  const { displayCategory, defaultCategory, fmtNumber } = DataStore;
  const el = (id) => document.getElementById(id);

  const datasetSelect = el("ch-dataset-select");
  const indexedField = el("ch-indexed-field");
  const indexedToggle = el("ch-indexed-toggle");
  const categoryField = el("ch-category-field");
  const categorySelect = el("ch-category-select");
  const indicatorSelect = el("ch-indicator-select");
  const chipsEl = el("ch-muni-chips");
  const resetMunisBtn = el("ch-muni-reset");
  const searchInput = el("ch-muni-search");
  const suggestionsEl = el("ch-muni-suggestions");
  const yearFromSelect = el("ch-year-from");
  const yearToSelect = el("ch-year-to");
  const lineToggle = el("ch-line-toggle");
  const emptyHint = el("ch-empty-hint");
  const chartWrap = el("ch-chart-wrap");
  const canvas = el("ch-canvas");

  const PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#c026d3", "#4f46e5"];

  const state = {
    currentBaseKey: null,
    currentIndexed: false,
    currentData: null,
    currentCategory: null,
    currentIndicator: null,
    selectedMunis: [],
    yearFrom: null,
    yearTo: null,
    initialized: false,
    chart: null,
  };

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const { datasetsMeta } = await DataStore.loadMeta();
    for (const [key, meta] of Object.entries(datasetsMeta)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.title;
      datasetSelect.appendChild(opt);
    }

    datasetSelect.addEventListener("change", () => selectBaseDataset(datasetSelect.value));
    indexedToggle.addEventListener("change", () => {
      state.currentIndexed = indexedToggle.checked;
      loadDataKey(DataStore.dataKeyFor(state.currentBaseKey, state.currentIndexed), true);
    });
    categorySelect.addEventListener("change", () => {
      state.currentCategory = categorySelect.value;
      render();
    });
    indicatorSelect.addEventListener("change", () => {
      state.currentIndicator = indicatorSelect.value;
      render();
    });
    yearFromSelect.addEventListener("change", () => {
      syncYearRange("from");
      render();
    });
    yearToSelect.addEventListener("change", () => {
      syncYearRange("to");
      render();
    });
    lineToggle.addEventListener("change", render);

    resetMunisBtn.addEventListener("click", () => {
      state.selectedMunis = [];
      renderChips();
      render();
    });

    searchInput.addEventListener("input", updateSuggestions);
    searchInput.addEventListener("focus", updateSuggestions);
    document.addEventListener("click", (e) => {
      if (e.target !== searchInput && !suggestionsEl.contains(e.target)) {
        suggestionsEl.classList.add("hidden");
      }
    });

    const firstKey = Object.keys(datasetsMeta)[0];
    datasetSelect.value = firstKey;
    await selectBaseDataset(firstKey);
  }

  function onShow() {
    if (state.chart) state.chart.resize();
  }

  async function selectBaseDataset(baseKey) {
    state.currentBaseKey = baseKey;
    const meta = DataStore.datasetsMeta[baseKey];
    indexedField.classList.toggle("hidden", !meta.indexedKey);
    state.currentIndexed = false;
    indexedToggle.checked = false;
    await loadDataKey(baseKey, false);
  }

  async function loadDataKey(key, preserve) {
    const data = await DataStore.loadDataset(key);
    const prevCategory = state.currentCategory;
    const prevIndicator = state.currentIndicator;
    const prevFrom = state.yearFrom;
    const prevTo = state.yearTo;

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
      state.currentCategory = preserve && data.categories.includes(prevCategory) ? prevCategory : defaultCategory(data.categories);
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
    state.currentIndicator = preserve && data.columns.includes(prevIndicator) ? prevIndicator : data.columns[0];
    indicatorSelect.value = state.currentIndicator;

    const years = data.years;
    yearFromSelect.innerHTML = "";
    yearToSelect.innerHTML = "";
    for (const y of years) {
      const o1 = document.createElement("option");
      o1.value = y;
      o1.textContent = y;
      yearFromSelect.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = y;
      o2.textContent = y;
      yearToSelect.appendChild(o2);
    }
    state.yearFrom = preserve && prevFrom && years.includes(prevFrom) ? prevFrom : years[0];
    state.yearTo = preserve && prevTo && years.includes(prevTo) ? prevTo : years[years.length - 1];
    yearFromSelect.value = state.yearFrom;
    yearToSelect.value = state.yearTo;

    if (!preserve && state.selectedMunis.length === 0) {
      state.selectedMunis = [...data.municipalities].sort((a, b) => a.localeCompare(b, "ru")).slice(0, 5);
      renderChips();
    }

    render();
  }

  function syncYearRange(which) {
    let from = Number(yearFromSelect.value);
    let to = Number(yearToSelect.value);
    if (from > to) {
      if (which === "from") {
        yearToSelect.value = from;
        to = from;
      } else {
        yearFromSelect.value = to;
        from = to;
      }
    }
    state.yearFrom = from;
    state.yearTo = to;
  }

  function updateSuggestions() {
    if (!state.currentData) return;
    const q = searchInput.value.trim().toLowerCase();
    let matches = state.currentData.municipalities.filter((m) => !state.selectedMunis.includes(m));
    if (q) matches = matches.filter((m) => m.toLowerCase().includes(q));
    matches = matches.sort((a, b) => a.localeCompare(b, "ru"));

    suggestionsEl.innerHTML = "";
    if (matches.length === 0) {
      const div = document.createElement("div");
      div.className = "suggestion-empty";
      div.textContent = "Ничего не найдено";
      suggestionsEl.appendChild(div);
    } else {
      for (const m of matches) {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.textContent = m;
        div.addEventListener("click", () => addMuni(m));
        suggestionsEl.appendChild(div);
      }
    }
    suggestionsEl.classList.remove("hidden");
  }

  function addMuni(name) {
    if (!state.selectedMunis.includes(name)) {
      state.selectedMunis.push(name);
      renderChips();
      render();
    }
    searchInput.value = "";
    suggestionsEl.classList.add("hidden");
    searchInput.focus();
  }

  function removeMuni(name) {
    state.selectedMunis = state.selectedMunis.filter((m) => m !== name);
    renderChips();
    render();
  }

  function renderChips() {
    chipsEl.innerHTML = "";
    state.selectedMunis.forEach((name, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.style.borderColor = PALETTE[i % PALETTE.length];
      const label = document.createElement("span");
      label.textContent = name;
      const btn = document.createElement("button");
      btn.textContent = "×";
      btn.title = "Убрать";
      btn.addEventListener("click", () => removeMuni(name));
      chip.appendChild(label);
      chip.appendChild(btn);
      chipsEl.appendChild(chip);
    });
  }

  function currentColumnIndex() {
    const data = state.currentData;
    const offset = data.categories ? 3 : 2;
    return offset + data.columns.indexOf(state.currentIndicator);
  }

  function seriesFor(muniName) {
    const data = state.currentData;
    const isCategory = !!data.categories;
    const catIdx = isCategory ? data.categories.indexOf(state.currentCategory) : -1;
    const colIdx = currentColumnIndex();
    const muniIdx = data.municipalities.indexOf(muniName);

    const byYear = new Map();
    for (const row of data.rows) {
      if (row[0] !== muniIdx) continue;
      if (row[1] < state.yearFrom || row[1] > state.yearTo) continue;
      if (isCategory && row[2] !== catIdx) continue;
      byYear.set(row[1], row[colIdx]);
    }
    const years = [];
    for (let y = state.yearFrom; y <= state.yearTo; y++) years.push(y);
    return years.map((y) => (byYear.has(y) ? byYear.get(y) : null));
  }

  function render() {
    if (!state.currentData || state.selectedMunis.length === 0 || state.yearFrom == null) {
      emptyHint.style.display = "flex";
      chartWrap.classList.remove("visible");
      if (state.chart) {
        state.chart.destroy();
        state.chart = null;
      }
      return;
    }
    emptyHint.style.display = "none";
    chartWrap.classList.add("visible");

    const years = [];
    for (let y = state.yearFrom; y <= state.yearTo; y++) years.push(y);

    const data = state.currentData;
    const label = (data.columnLabels && data.columnLabels[state.currentIndicator]) || state.currentIndicator;
    const isLine = lineToggle.checked;

    const datasets = state.selectedMunis.map((name, i) => {
      const color = PALETTE[i % PALETTE.length];
      return {
        label: name,
        data: seriesFor(name),
        borderColor: color,
        backgroundColor: isLine ? color : color + "b3",
        spanGaps: true,
        tension: 0.25,
        borderWidth: isLine ? 2 : 1,
        pointRadius: isLine ? 3 : 0,
      };
    });

    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas.getContext("2d"), {
      type: isLine ? "line" : "bar",
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: {
            display: true,
            text: label + (state.currentCategory ? " — " + displayCategory(state.currentCategory) : ""),
            font: { size: 15 },
          },
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.raw)}` } },
        },
        scales: {
          y: { ticks: { callback: (v) => fmtNumber(v) } },
        },
      },
    });
  }

  return { init, onShow };
})();
