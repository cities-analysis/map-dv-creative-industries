/* Общий слой загрузки/кэширования данных для всех вкладок приложения. */
const DataStore = (() => {
  "use strict";
  const DATA_DIR = "data/";
  let datasetsMeta = null;
  let geo = null;
  let municipalities = null;
  const cache = {};

  async function fetchJson(path) {
    const res = await fetch(path);
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

  return {
    loadMeta,
    loadGeo,
    loadDataset,
    dataKeyFor,
    displayCategory,
    defaultCategory,
    fmtNumber,
    get datasetsMeta() {
      return datasetsMeta;
    },
    get municipalities() {
      return municipalities;
    },
  };
})();
