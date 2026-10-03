"""
Конвертирует муниципальные CSV из data/ в компактный JSON для карты
(docs/data/*.json), сопоставляя oktmo_name_actual -> QGIS_name через
файл 'Сопоставление MunicOffic и QGIS_name.xlsx'.

Если в CSV есть колонка `indexed` (True/False), строки делятся на два
набора: обычный и индексированный (с поправкой на инфляцию). В интерфейсе
это не отдельные наборы данных, а тумблер «Индексировано».
"""
import math
import os

import pandas as pd

from common import DATA_DIR, OUT_DIR, load_mapping, write_json

INDICATORS_MAPPING_XLSX = os.path.join(DATA_DIR, "indicators_mapping.xlsx")

# Наборы данных "по категориям КИ" (долгий формат: строка = муниципалитет+год+категория)
CATEGORY_DATASETS = {
    "ci_econ": {
        "file": "city_ci_2025_calculations.csv",
        "has_indexed_flag": True,
        "category_prefix": "Организации_",
        "title": "Экономика креативных индустрий",
    },
    "ci_ip": {
        "file": "final_calculations_ci_ip.csv",
        "has_indexed_flag": False,
        "category_prefix": "ИП_",
        "title": "Индивидуальные предприниматели КИ",
    },
}

# Наборы данных "широкие" (строка = муниципалитет+год, много колонок-индикаторов)
WIDE_DATASETS = {
    "with_extra": {
        "file": "city_calculations.csv",
        "has_indexed_flag": True,
        "title": "Общие муниципальные показатели",
    },
}

NON_INDICATOR_COLS = {"region", "year", "city", "oktmo_name_actual", "category", "indexed"}


def clean_col(name):
    return name.replace("/", "").replace(" ", "_")


def round_val(v):
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return None
    if isinstance(v, float):
        r = round(v, 3)
        return int(r) if r.is_integer() else r
    return v


def load_indicator_labels():
    df = pd.read_excel(INDICATORS_MAPPING_XLSX, header=None)
    return {str(row[0]).strip(): str(row[1]).strip() for _, row in df.iterrows() if pd.notna(row[0])}


def load_variants(cfg):
    """-> (обычный df, индексированный df или None) из одного CSV."""
    df = pd.read_csv(os.path.join(DATA_DIR, cfg["file"]), low_memory=False)
    if not cfg["has_indexed_flag"]:
        return df, None
    flag = df["indexed"].astype(str).str.strip().str.lower() == "true"
    return df[~flag].drop(columns="indexed"), df[flag].drop(columns="indexed")


def build_category_dataset(out_key, df, title, mapping, unmatched, labels, category_prefix):
    df = df.copy()
    # Сайт ищет категории с префиксом ("Организации_КИ всего", "ИП_КИ всего"). Если при
    # выгрузке префикс потерялся, возвращаем его, иначе все значения "пропадут".
    has_prefix = df["category"].str.startswith(category_prefix)
    if not has_prefix.all():
        print(f"  Префикс '{category_prefix}' добавлен к категориям: {int((~has_prefix).sum())} строк")
        df.loc[~has_prefix, "category"] = category_prefix + df.loc[~has_prefix, "category"]
    df["QGIS_name"] = df["oktmo_name_actual"].str.strip().map(mapping)
    miss = df[df["QGIS_name"].isna()]["oktmo_name_actual"].unique().tolist()
    if miss:
        unmatched.setdefault(out_key, set()).update(miss)
    df = df.dropna(subset=["QGIS_name"])

    ind_cols = [c for c in df.columns if c not in NON_INDICATOR_COLS and c != "QGIS_name" and c != "most_profitable"]
    ind_cols = [c for c in ind_cols if pd.api.types.is_numeric_dtype(df[c])]
    col_out_names = [clean_col(c) for c in ind_cols]

    has_mp = "most_profitable" in df.columns
    mp_col = df["most_profitable"].tolist() if has_mp else None

    munis = sorted(df["QGIS_name"].unique().tolist())
    muni_idx = {m: i for i, m in enumerate(munis)}
    years = sorted(int(y) for y in df["year"].unique().tolist())
    cats = sorted(df["category"].dropna().unique().tolist())
    cat_idx = {c: i for i, c in enumerate(cats)}

    value_cols = [df[c].tolist() for c in ind_cols]
    rows = []
    for i, (m, y, cat) in enumerate(zip(df["QGIS_name"], df["year"], df["category"])):
        row = [muni_idx[m], int(y), cat_idx[cat]]
        for col in value_cols:
            row.append(round_val(col[i]))
        if has_mp:
            v = mp_col[i]
            row.append(v if isinstance(v, str) and v.strip() else None)
        rows.append(row)

    out = {
        "title": title,
        "columns": col_out_names,
        "columnLabels": {clean_col(c): labels.get(c, c) for c in ind_cols},
        "categories": cats,
        "municipalities": munis,
        "years": years,
        "hasMostProfitable": has_mp,
        "rows": rows,
    }
    write_json(os.path.join(OUT_DIR, f"{out_key}.json"), out)


def build_wide_dataset(out_key, df, title, mapping, unmatched, labels):
    df = df.copy()
    df["QGIS_name"] = df["oktmo_name_actual"].str.strip().map(mapping)
    miss = df[df["QGIS_name"].isna()]["oktmo_name_actual"].unique().tolist()
    if miss:
        unmatched.setdefault(out_key, set()).update(miss)
    df = df.dropna(subset=["QGIS_name"])

    ind_cols = [c for c in df.columns if c not in NON_INDICATOR_COLS and c != "QGIS_name"]
    ind_cols = [c for c in ind_cols if pd.api.types.is_numeric_dtype(df[c])]
    col_out_names = [clean_col(c) for c in ind_cols]

    munis = sorted(df["QGIS_name"].unique().tolist())
    muni_idx = {m: i for i, m in enumerate(munis)}
    years = sorted(int(y) for y in df["year"].unique().tolist())

    value_cols = [df[c].tolist() for c in ind_cols]
    rows = []
    for i, (m, y) in enumerate(zip(df["QGIS_name"], df["year"])):
        row = [muni_idx[m], int(y)]
        for col in value_cols:
            row.append(round_val(col[i]))
        rows.append(row)

    out = {
        "title": title,
        "columns": col_out_names,
        "columnLabels": {clean_col(c): labels.get(c, c) for c in ind_cols},
        "municipalities": munis,
        "years": years,
        "rows": rows,
    }
    write_json(os.path.join(OUT_DIR, f"{out_key}.json"), out)


def main():
    mapping = load_mapping()
    labels = load_indicator_labels()
    unmatched = {}

    datasets_meta = {}

    for key, cfg in CATEGORY_DATASETS.items():
        base, indexed = load_variants(cfg)
        print(f"[{key}]")
        build_category_dataset(key, base, cfg["title"], mapping, unmatched, labels, cfg["category_prefix"])
        indexed_key = None
        if indexed is not None:
            indexed_key = key + "_indexed"
            print(f"[{indexed_key}]")
            build_category_dataset(indexed_key, indexed, cfg["title"] + " (индексировано)", mapping, unmatched, labels, cfg["category_prefix"])
        datasets_meta[key] = {"title": cfg["title"], "type": "category", "indexedKey": indexed_key}

    for key, cfg in WIDE_DATASETS.items():
        base, indexed = load_variants(cfg)
        print(f"[{key}]")
        build_wide_dataset(key, base, cfg["title"], mapping, unmatched, labels)
        indexed_key = None
        if indexed is not None:
            indexed_key = key + "_indexed"
            print(f"[{indexed_key}]")
            build_wide_dataset(indexed_key, indexed, cfg["title"] + " (индексировано)", mapping, unmatched, labels)
        datasets_meta[key] = {"title": cfg["title"], "type": "wide", "indexedKey": indexed_key}

    write_json(os.path.join(OUT_DIR, "datasets.json"), datasets_meta)

    if unmatched:
        print("\n!!! Несопоставленные названия муниципалитетов (нет в файле сопоставления):")
        for key, names in unmatched.items():
            print(f"  {key}: {sorted(names)}")
    else:
        print("\nВсе муниципалитеты успешно сопоставлены с QGIS_name.")

    geo_path = os.path.join(OUT_DIR, "municipalities.json")
    if os.path.exists(geo_path):
        import json

        geo_names = {m["name"] for m in json.load(open(geo_path, encoding="utf-8"))}
        all_qgis = set()
        for key in list(CATEGORY_DATASETS) + list(WIDE_DATASETS):
            ds = json.load(open(os.path.join(OUT_DIR, f"{key}.json"), encoding="utf-8"))
            all_qgis.update(ds["municipalities"])
        no_geom = sorted(all_qgis - geo_names)
        if no_geom:
            print("\n!!! QGIS_name из данных не найдены в геометрии карты (проверьте файл сопоставления или map_DV_for_Moran_final.gpkg):")
            for n in no_geom:
                print(f"  - {n}")


if __name__ == "__main__":
    main()
