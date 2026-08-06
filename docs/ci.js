const CiView = (() => {
  "use strict";

  const { displayCategory, fmtNumber } = DataStore;
  const el = (id) => document.getElementById(id);

  const searchInput = el("ci-muni-search");
  const suggestionsEl = el("ci-muni-suggestions");
  const yearSelect = el("ci-year-select");
  const categorySelect = el("ci-category-select");
  const indexedField = el("ci-indexed-field");
  const indexedToggle = el("ci-indexed-toggle");
  const emptyHint = el("ci-empty-hint");
  const bodyEl = el("ci-body");
  const summaryEl = el("ci-summary");
  const cardsEl = el("ci-cards");

  const ORG_KEY = "ci_econ";
  const IP_KEY = "ci_ip";
  const TOTAL_STEM = "КИ всего";

  const state = {
    initialized: false,
    econData: null, // текущий (индексированный или нет) ci_econ
    ipData: null,
    munis: [],
    currentMuni: null,
    currentYear: null,
    currentStem: "", // "" = все категории
    indexed: false,
    charts: [], // активные Chart.js инстансы (для destroy)
  };

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const { datasetsMeta } = await DataStore.loadMeta();
    state.ipData = await DataStore.loadDataset(IP_KEY);
    state.econData = await DataStore.loadDataset(ORG_KEY);
    state.munis = state.econData.municipalities;

    const meta = datasetsMeta[ORG_KEY];
    if (meta.indexedKey) indexedField.classList.remove("hidden");

    const stems = state.econData.categories
      .map(displayCategory)
      .filter((s) => s !== TOTAL_STEM)
      .sort((a, b) => a.localeCompare(b, "ru"));
    for (const stem of stems) {
      const opt = document.createElement("option");
      opt.value = stem;
      opt.textContent = stem;
      categorySelect.appendChild(opt);
    }

    for (const y of state.econData.years) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    state.currentYear = state.econData.years[state.econData.years.length - 1];
    yearSelect.value = state.currentYear;

    searchInput.addEventListener("input", updateSuggestions);
    searchInput.addEventListener("focus", updateSuggestions);
    document.addEventListener("click", (e) => {
      if (e.target !== searchInput && !suggestionsEl.contains(e.target)) {
        suggestionsEl.classList.add("hidden");
      }
    });
    yearSelect.addEventListener("change", () => {
      state.currentYear = Number(yearSelect.value);
      render();
    });
    categorySelect.addEventListener("change", () => {
      state.currentStem = categorySelect.value;
      render();
    });
    indexedToggle.addEventListener("change", async () => {
      state.indexed = indexedToggle.checked;
      const key = DataStore.dataKeyFor(ORG_KEY, state.indexed);
      state.econData = await DataStore.loadDataset(key);
      render();
    });
  }

  function onShow() {}

  function updateSuggestions() {
    const q = searchInput.value.trim().toLowerCase();
    let matches = state.munis;
    if (q) matches = matches.filter((m) => m.toLowerCase().includes(q));
    matches = [...matches].sort((a, b) => a.localeCompare(b, "ru"));

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
        div.addEventListener("click", () => {
          state.currentMuni = m;
          searchInput.value = m;
          suggestionsEl.classList.add("hidden");
          render();
        });
        suggestionsEl.appendChild(div);
      }
    }
    suggestionsEl.classList.remove("hidden");
  }

  function rowFor(data, muniIdx, year, category) {
    const catIdx = data.categories.indexOf(category);
    return data.rows.find((r) => r[0] === muniIdx && r[1] === year && r[2] === catIdx);
  }

  function valueOf(data, row, colName) {
    if (!row) return null;
    const idx = 3 + data.columns.indexOf(colName);
    return row[idx];
  }

  function destroyCharts() {
    state.charts.forEach((c) => c.destroy());
    state.charts = [];
  }

  function render() {
    if (!state.currentMuni) {
      emptyHint.style.display = "flex";
      bodyEl.classList.add("hidden");
      destroyCharts();
      return;
    }
    emptyHint.style.display = "none";
    bodyEl.classList.remove("hidden");
    destroyCharts();

    const econ = state.econData;
    const ip = state.ipData;
    const muniIdx = econ.municipalities.indexOf(state.currentMuni);
    const ipMuniIdx = ip.municipalities.indexOf(state.currentMuni);
    const year = state.currentYear;

    renderSummary(econ, ip, muniIdx, ipMuniIdx, year);

    const stems = state.currentStem
      ? [state.currentStem]
      : econ.categories.map(displayCategory).filter((s) => s !== TOTAL_STEM).sort((a, b) => a.localeCompare(b, "ru"));

    cardsEl.innerHTML = "";
    for (const stem of stems) {
      cardsEl.appendChild(buildCard(econ, ip, muniIdx, ipMuniIdx, year, stem));
    }
  }

  function renderSummary(econ, ip, muniIdx, ipMuniIdx, year) {
    const orgRow = rowFor(econ, muniIdx, year, "Организации_" + TOTAL_STEM);
    const ipRow = rowFor(ip, ipMuniIdx, year, "ИП_" + TOTAL_STEM);

    const g = (row, dataObj, col) => valueOf(dataObj, row, col);

    const tiles = [
      {
        label: "Действующие",
        value: `${fmtNumber(g(orgRow, econ, "existing"))} орг. / ${fmtNumber(g(ipRow, ip, "existing_ip"))} ИП`,
      },
      {
        label: "Зарегистрировано",
        value: `${fmtNumber(g(orgRow, econ, "registered"))} орг. / ${fmtNumber(g(ipRow, ip, "registered_ip"))} ИП`,
      },
      {
        label: "Ликвидировано",
        value: `${fmtNumber(g(orgRow, econ, "liquidated"))} орг. / ${fmtNumber(g(ipRow, ip, "liquidated_ip"))} ИП`,
      },
      { label: "Выручка организаций", value: fmtNumber(g(orgRow, econ, "revenues")) + " ₽" },
      { label: "Основные средства", value: fmtNumber(g(orgRow, econ, "fixed_assets")) + " ₽" },
      { label: "Зарплата (ФОТ)", value: fmtNumber(g(orgRow, econ, "wages")) + " ₽" },
      { label: "HHI по выручке", value: fmtNumber(g(orgRow, econ, "hhi_revenues")) },
      { label: "HHI по осн. средствам", value: fmtNumber(g(orgRow, econ, "hhi_fixed_assets")) },
      { label: "HHI по зарплате", value: fmtNumber(g(orgRow, econ, "hhi_wages")) },
    ];

    summaryEl.innerHTML = "";
    for (const t of tiles) {
      const div = document.createElement("div");
      div.className = "ci-stat";
      div.innerHTML = `<div class="ci-stat-label">${t.label}</div><div class="ci-stat-value">${t.value}</div>`;
      summaryEl.appendChild(div);
    }
  }

  function buildCard(econ, ip, muniIdx, ipMuniIdx, year, stem) {
    const orgCat = "Организации_" + stem;
    const ipCat = "ИП_" + stem;
    const orgRow = rowFor(econ, muniIdx, year, orgCat);
    const ipRow = rowFor(ip, ipMuniIdx, year, ipCat);

    const existingOrg = valueOf(econ, orgRow, "existing") || 0;
    const existingIp = valueOf(ip, ipRow, "existing_ip") || 0;
    const registeredOrg = valueOf(econ, orgRow, "registered");
    const registeredIp = valueOf(ip, ipRow, "registered_ip");
    const liquidatedOrg = valueOf(econ, orgRow, "liquidated");
    const liquidatedIp = valueOf(ip, ipRow, "liquidated_ip");
    const revenues = valueOf(econ, orgRow, "revenues");
    const fixedAssets = valueOf(econ, orgRow, "fixed_assets");
    const wages = valueOf(econ, orgRow, "wages");

    const card = document.createElement("div");
    card.className = "ci-card";

    const hasDonutData = existingOrg > 0 || existingIp > 0;
    const donutHtml = hasDonutData
      ? `<div class="ci-card-donut"><canvas></canvas><div class="ci-card-donut-total">${fmtNumber(existingOrg + existingIp)}</div></div>`
      : `<div class="ci-card-donut" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;text-align:center;">Нет данных</div>`;

    card.innerHTML = `
      <h3>${stem}</h3>
      <div class="ci-card-body">
        ${donutHtml}
        <div class="ci-card-stats">
          <div><div class="stat-label">Действующие, орг.</div><div class="stat-value">${fmtNumber(existingOrg)}</div></div>
          <div><div class="stat-label">Действующие, ИП</div><div class="stat-value">${fmtNumber(existingIp)}</div></div>
          <div><div class="stat-label">Зарегистрировано, орг.</div><div class="stat-value">${fmtNumber(registeredOrg)}</div></div>
          <div><div class="stat-label">Зарегистрировано, ИП</div><div class="stat-value">${fmtNumber(registeredIp)}</div></div>
          <div><div class="stat-label">Ликвидировано, орг.</div><div class="stat-value">${fmtNumber(liquidatedOrg)}</div></div>
          <div><div class="stat-label">Ликвидировано, ИП</div><div class="stat-value">${fmtNumber(liquidatedIp)}</div></div>
        </div>
      </div>
      <div class="ci-card-financials">
        <div><div class="stat-label">Выручка</div><div class="stat-value">${fmtNumber(revenues)} ₽</div></div>
        <div><div class="stat-label">Осн. средства</div><div class="stat-value">${fmtNumber(fixedAssets)} ₽</div></div>
        <div><div class="stat-label">ФОТ</div><div class="stat-value">${fmtNumber(wages)} ₽</div></div>
      </div>
    `;

    if (hasDonutData) {
      const canvas = card.querySelector("canvas");
      const chart = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: ["Организации", "ИП"],
          datasets: [{ data: [existingOrg, existingIp], backgroundColor: ["#38bdf8", "#f87171"], borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmtNumber(ctx.raw)}` } },
          },
        },
      });
      state.charts.push(chart);
    }

    return card;
  }

  return { init, onShow };
})();
