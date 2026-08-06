"""Общие утилиты для build-скриптов карты."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(ROOT, "docs", "data")

MAPPING_XLSX = os.path.join(DATA_DIR, "Сопоставление MunicOffic и QGIS_name.xlsx")


def load_mapping():
    """oktmo_name_actual -> QGIS_name, построчно из файла сопоставления."""
    import pandas as pd

    df = pd.read_excel(MAPPING_XLSX)
    df = df.dropna(subset=["oktmo_name_actual", "QGIS_name"])
    mapping = dict(zip(df["oktmo_name_actual"].str.strip(), df["QGIS_name"].str.strip()))
    return mapping


def write_json(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, allow_nan=False, separators=(",", ":") if indent is None else None, indent=indent)
    size = os.path.getsize(path)
    print(f"  -> {os.path.relpath(path, ROOT)} ({size/1024:.1f} KB)")
