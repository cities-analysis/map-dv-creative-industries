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
  const DEFAULT_MUNI = "Владивостокский городской округ";
  const TOP_ORGS_COUNT = 10;

  // Сокращения организационно-правовых форм: от самых специфичных к общим,
  // чтобы не "проглотить" более точную форму более общей заменой.
  const LEGAL_FORM_ABBR = [
    ["ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ФГБУ"],
    ["МУНИЦИПАЛЬНОЕ УНИТАРНОЕ ПРЕДПРИЯТИЕ", "МУП"],
    ["ГОСУДАРСТВЕННОЕ УНИТАРНОЕ ПРЕДПРИЯТИЕ", "ГУП"],
    ["МУНИЦИПАЛЬНОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ", "МАУ"],
    ["ГОСУДАРСТВЕННОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ", "ГАУ"],
    ["МУНИЦИПАЛЬНОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "МБУ"],
    ["ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ГБУ"],
    ["ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ОАО"],
    ["ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ЗАО"],
    ["ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ПАО"],
    ["АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"],
    ["ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", "ООО"],
    ["ОБЩЕСТВО С ДОПОЛНИТЕЛЬНОЙ ОТВЕТСТВЕННОСТЬЮ", "ОДО"],
    ["АВТОНОМНАЯ НЕКОММЕРЧЕСКАЯ ОРГАНИЗАЦИЯ", "АНО"],
    ["НЕКОММЕРЧЕСКОЕ ПАРТНЕРСТВО", "НП"],
    ["МУНИЦИПАЛЬНОЕ ПРЕДПРИЯТИЕ", "МП"],
    ["МУНИЦИПАЛЬНОЕ УЧРЕЖДЕНИЕ", "МУ"],
    ["ГОСУДАРСТВЕННОЕ ПРЕДПРИЯТИЕ", "ГП"],
    ["АВТОНОМНОЕ УЧРЕЖДЕНИЕ", "АУ"],
    ["ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ", "ИП"],
    ["ЧАСТНОЕ УЧРЕЖДЕНИЕ", "ЧУ"],
  ];

  function abbreviateOrgName(name) {
    if (!name) return name;
    for (const [phrase, abbr] of LEGAL_FORM_ABBR) {
      if (name.startsWith(phrase)) {
        return abbr + name.slice(phrase.length);
      }
    }
    return name;
  }

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

    if (state.munis.includes(DEFAULT_MUNI)) {
      state.currentMuni = DEFAULT_MUNI;
      searchInput.value = DEFAULT_MUNI;
    }
    render();
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

  function mostProfitableOf(data, row) {
    if (!row || !data.hasMostProfitable) return [];
    const idx = 3 + data.columns.length;
    return parseMostProfitable(row[idx]);
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

    const groups = [
      {
        title: "Действующие, зарегистрированные, ликвидированные организации и ИП",
        tiles: [
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
        ],
      },
      {
        title: "Выручка, основные средства, зарплата организаций",
        tiles: [
          { label: "Выручка", value: fmtNumber(g(orgRow, econ, "revenues")) + " ₽" },
          { label: "Основные средства", value: fmtNumber(g(orgRow, econ, "fixed_assets")) + " ₽" },
          { label: "Зарплата (ФОТ)", value: fmtNumber(g(orgRow, econ, "wages")) + " ₽" },
        ],
      },
      {
        title: "HHI по выручке, основным средствам, зарплате",
        tiles: [
          { label: "HHI по выручке", value: fmtNumber(g(orgRow, econ, "hhi_revenues")) },
          { label: "HHI по осн. средствам", value: fmtNumber(g(orgRow, econ, "hhi_fixed_assets")) },
          { label: "HHI по зарплате", value: fmtNumber(g(orgRow, econ, "hhi_wages")) },
        ],
      },
    ];

    summaryEl.innerHTML = "";

    const note = document.createElement("div");
    note.className = "ci-summary-note";
    note.textContent = "Данные по всем категориям креативных индустрий";
    summaryEl.appendChild(note);

    for (const group of groups) {
      const groupEl = document.createElement("div");
      groupEl.className = "ci-summary-group";
      const rowHtml = group.tiles
        .map((t) => `<div class="ci-stat"><div class="ci-stat-label">${t.label}</div><div class="ci-stat-value">${t.value}</div></div>`)
        .join("");
      groupEl.innerHTML = `<div class="ci-summary-row">${rowHtml}</div>`;
      summaryEl.appendChild(groupEl);
    }

    summaryEl.appendChild(buildTopOrgsBlock(econ, muniIdx, year));
  }

  // Название -> категория (без префикса), по most_profitable всех отраслевых категорий (кроме "КИ всего")
  function industryLookupFor(econ, muniIdx, year) {
    const lookup = new Map();
    for (const cat of econ.categories) {
      if (!cat.endsWith(TOTAL_STEM)) {
        const row = rowFor(econ, muniIdx, year, cat);
        for (const org of mostProfitableOf(econ, row)) {
          if (!lookup.has(org.name)) lookup.set(org.name, displayCategory(cat));
        }
      }
    }
    return lookup;
  }

  function buildTopOrgsBlock(econ, muniIdx, year) {
    const totalRow = rowFor(econ, muniIdx, year, "Организации_" + TOTAL_STEM);
    const top = mostProfitableOf(econ, totalRow).slice(0, TOP_ORGS_COUNT);

    const wrap = document.createElement("div");
    wrap.className = "ci-summary-group ci-top-orgs";

    if (top.length === 0) {
      wrap.innerHTML = `
        <div class="ci-stat-label">Крупнейшие организации креативных индустрий</div>
        <div class="ci-top-orgs-empty">Нет данных</div>`;
      return wrap;
    }

    const industryOf = industryLookupFor(econ, muniIdx, year);
    const rowsHtml = top
      .map((o, i) => {
        const industry = industryOf.get(o.name) || "—";
        return `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="name">${escapeHtml(abbreviateOrgName(o.name))}</td>
          <td class="industry">${escapeHtml(industry)}</td>
          <td class="revenue">${fmtNumber(o.revenue)} ₽</td>
        </tr>`;
      })
      .join("");

    wrap.innerHTML = `
      <div class="ci-stat-label">Крупнейшие организации креативных индустрий (топ-${TOP_ORGS_COUNT} по выручке)</div>
      <table class="ci-top-orgs-table">
        <thead><tr><th></th><th>Организация</th><th>Индустрия</th><th>Выручка</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
    return wrap;
  }

  // "НАЗВАНИЕ~~~ВЫРУЧКА$$$НАЗВАНИЕ~~~ВЫРУЧКА..." -> [{name, revenue}, ...]
  function parseMostProfitable(raw) {
    if (!raw) return [];
    return raw
      .split("$$$")
      .map((chunk) => {
        const idx = chunk.lastIndexOf("~~~");
        if (idx === -1) return null;
        const name = chunk.slice(0, idx).trim();
        const revenue = Number(chunk.slice(idx + 3));
        return name ? { name, revenue: Number.isFinite(revenue) ? revenue : null } : null;
      })
      .filter(Boolean);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
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
    const mostProfitable = mostProfitableOf(econ, orgRow);

    const card = document.createElement("div");
    card.className = "ci-card";

    const hasDonutData = existingOrg > 0 || existingIp > 0;
    const donutHtml = hasDonutData
      ? `<div class="ci-card-donut"><canvas></canvas><div class="ci-card-donut-total">${fmtNumber(existingOrg + existingIp)}</div></div>`
      : `<div class="ci-card-donut" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;text-align:center;">Нет данных</div>`;

    const MAX_MP = 5;
    const mpHtml = mostProfitable.length
      ? `
      <div class="ci-card-most-profitable">
        <div class="stat-label">Крупнейшие организации</div>
        <ol>
          ${mostProfitable
            .slice(0, MAX_MP)
            .map((o) => `<li><span class="mp-name">${escapeHtml(abbreviateOrgName(o.name))}</span><span class="mp-revenue">${fmtNumber(o.revenue)} ₽</span></li>`)
            .join("")}
        </ol>
        ${mostProfitable.length > MAX_MP ? `<div class="mp-more">и ещё ${mostProfitable.length - MAX_MP}</div>` : ""}
      </div>`
      : "";

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
      ${mpHtml}
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
