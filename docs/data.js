/* Общий слой загрузки/кэширования данных для всех вкладок приложения. */
const DataStore = (() => {
  "use strict";
  const DATA_DIR = "data/";
  let datasetsMeta = null;
  let geo = null;
  let municipalities = null;
  const cache = {};

  async function fetchJson(path) {
    // "no-cache" = каждый раз спрашивать сервер, не изменился ли файл (если нет - ответ 304
    // и файл не скачивается заново). Без этого браузер мог показывать старые данные после
    // пересборки docs/data/*.json.
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
    return res.json();
  }

  async function loadMeta() {
    if (!datasetsMeta) {
      [datasetsMeta, municipalities] = await Promise.all([
        fetchJson(DATA_DIR + "datasets.json"),
        fetchJson(DATA_DIR + "municipalities.json"),
      ]);
    }
    return { datasetsMeta, municipalities };
  }

  async function loadGeo() {
    if (!geo) geo = await fetchJson(DATA_DIR + "geo.json");
    return geo;
  }

  async function loadDataset(key) {
    if (!cache[key]) cache[key] = await fetchJson(DATA_DIR + key + ".json");
    return cache[key];
  }

  // Любой JSON из docs/data/ по имени файла (например, "regions.json").
  async function loadJson(fileName) {
    if (!cache[fileName]) cache[fileName] = await fetchJson(DATA_DIR + fileName);
    return cache[fileName];
  }

  function dataKeyFor(baseKey, indexed) {
    const meta = datasetsMeta[baseKey];
    return indexed && meta.indexedKey ? meta.indexedKey : baseKey;
  }

  function displayCategory(cat) {
    return cat ? cat.replace(/^(Организации_|ИП_)/, "") : cat;
  }

  // По умолчанию выбираем категорию "КИ всего" (суммарно по всем отраслям),
  // если она есть в списке; иначе - первую по алфавиту.
  function defaultCategory(categories) {
    return categories.find((c) => displayCategory(c) === "КИ всего") || categories[0];
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

  // Короткая запись для подписей на легенде и осях: 5 614 276 925 000 -> "5,6 трлн".
  function fmtCompact(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "нет данных";
    const abs = Math.abs(v);
    const units = [
      [1e12, " трлн"],
      [1e9, " млрд"],
      [1e6, " млн"],
      [1e3, " тыс."],
    ];
    for (const [size, suffix] of units) {
      if (abs >= size) return (v / size).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + suffix;
    }
    return v.toLocaleString("ru-RU", { maximumFractionDigits: abs < 10 ? 3 : 1 });
  }

  // Общая легенда-пилюля для карты и регионов: цветные классы и значения на их границах.
  // colors - цвета классов слева направо (длина = breaks.length - 1).
  function legendHtml({ title, colors, breaks, emptyText, noDataText = "нет данных" }) {
    if (breaks.length < 2) {
      return `<div class="legend-title">${title}</div><div class="legend-empty">${emptyText || noDataText}</div>`;
    }
    const classes = breaks.length - 1;
    const bar = colors.map((c) => `<span style="background:${c}"></span>`).join("");
    // Одинаковые подряд идущие границы (бывает у показателей с множеством нулей)
    // сливаем в одну подпись: левая сохраняет своё место, а если повтор доходит до
    // правого края, подпись уезжает к нему.
    const marks = [];
    breaks.forEach((v, i) => {
      const prev = marks[marks.length - 1];
      if (prev && prev.v === v) {
        if (i === classes) prev.i = i;
        return;
      }
      marks.push({ v, i });
    });
    const ticks = marks
      .map(({ v, i }) => {
        const cls = i === 0 ? "first" : i === classes ? "last" : "";
        return `<span class="legend-tick ${cls}" style="left:${(i / classes) * 100}%">${fmtCompact(v)}</span>`;
      })
      .join("");
    return `
      <div class="legend-title">${title}</div>
      <div class="legend-bar">${bar}</div>
      <div class="legend-ticks">${ticks}</div>
      <div class="legend-nodata"><i></i> ${noDataText}</div>`;
  }

  return {
    loadMeta,
    loadGeo,
    loadDataset,
    loadJson,
    dataKeyFor,
    displayCategory,
    defaultCategory,
    fmtNumber,
    fmtCompact,
    legendHtml,
    get datasetsMeta() {
      return datasetsMeta;
    },
    get municipalities() {
      return municipalities;
    },
  };
})();
