"""
data/region_calculations.csv -> docs/data/regions.json (вкладка «Регионы»).

Строка CSV = регион + год + флаг `indexed` (True - с поправкой на инфляцию).
В JSON обычные и индексированные значения лежат в одном файле (rows и
rowsIndexed): данных мало, а тумблер должен переключаться мгновенно.
"""
import os

import pandas as pd

from build_data import load_indicator_labels, round_val
from common import DATA_DIR, OUT_DIR, write_json

REGIONS_CSV = os.path.join(DATA_DIR, "region_calculations.csv")
NON_INDICATOR_COLS = {"region", "year", "indexed", "temp_block"}

# Показатели, зависящие от оплаты труда: если wages == 0, данных по зарплате
# за этот год нет (в файле это записано нулями), и показывать 0 как
# реальное минимальное значение на карте было бы неверно.
WAGE_DEPENDENT = [
    "wages", "hhi_wages", "ti_wages", "ti_w_wages", "ti_b_wages",
    "ssch", "labor_productivity", "capital_labor_ratio", "avg_labor_cost",
]


def rows_for(df, regions_idx, columns):
    no_wage = df["wages"] == 0
    wage_cols = [c for c in WAGE_DEPENDENT if c in columns]
    rows = []
    for (_, rec), missing in zip(df.iterrows(), no_wage):
        row = [regions_idx[rec["region"]], int(rec["year"])]
        for c in columns:
            row.append(None if missing and c in wage_cols else round_val(float(rec[c])))
        rows.append(row)
    return rows, int(no_wage.sum())


def main():
    df = pd.read_csv(REGIONS_CSV)
    flag = df["indexed"].astype(str).str.strip().str.lower() == "true"
    columns = [c for c in df.columns if c not in NON_INDICATOR_COLS and pd.api.types.is_numeric_dtype(df[c])]
    regions = sorted(df["region"].unique().tolist())
    regions_idx = {r: i for i, r in enumerate(regions)}
    labels = load_indicator_labels()

    rows, masked = rows_for(df[~flag].sort_values(["region", "year"]), regions_idx, columns)
    rows_indexed, _ = rows_for(df[flag].sort_values(["region", "year"]), regions_idx, columns)

    out = {
        "regions": regions,
        "years": sorted(int(y) for y in df["year"].unique()),
        "columns": columns,
        "columnLabels": {c: labels.get(c, c) for c in columns},
        "rows": rows,
        "rowsIndexed": rows_indexed,
    }
    write_json(os.path.join(OUT_DIR, "regions.json"), out)
    print(f"  Регионов: {len(regions)}, показателей: {len(columns)}, строк без данных по зарплате: {masked}")
    no_label = [c for c in columns if c not in labels]
    if no_label:
        print(f"  !!! Нет названия в indicators_mapping.xlsx: {no_label}")


if __name__ == "__main__":
    main()
