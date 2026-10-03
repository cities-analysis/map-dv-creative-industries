"""
Геометрия карты:
  data/map_DV_for_Moran_final.gpkg -> docs/data/geo.json (муниципалитеты)
  data/regions.geojson.gz          -> docs/data/regions_geo.json (регионы)

Муниципалитеты читаются напрямую из GeoPackage (SQLite) без GDAL: парсим
заголовок GeoPackage Binary и передаём WKB в shapely. Полигоны
упрощаются (Douglas-Peucker), чтобы карта быстро грузилась в браузере.
"""
import gzip
import json
import sqlite3
import struct

import pandas as pd
import shapely
from shapely import wkb
from shapely.geometry import mapping, shape
from shapely.ops import transform

from common import DATA_DIR, OUT_DIR, write_json
import os

GPKG_PATH = os.path.join(DATA_DIR, "map_DV_for_Moran_final.gpkg")
TABLE = "map_dv_for_moran_final"
SIMPLIFY_TOLERANCE = 0.0015  # градусы; ~150м, компромисс между весом и детализацией

REGIONS_GEOJSON = os.path.join(DATA_DIR, "regions.geojson.gz")
REGIONS_CSV = os.path.join(DATA_DIR, "region_calculations.csv")
REGIONS_NAME_FIELD = "name"  # поле слоя регионов с названием (как в region_calculations.csv)
REGIONS_SIMPLIFY_TOLERANCE = 0.01  # градусы; регионы крупные, детальный контур не нужен


def parse_gpkg_geom(blob):
    if blob is None:
        return None
    assert blob[0:2] == b"GP", "не GeoPackage geometry blob"
    flags = blob[3]
    byte_order = "<" if (flags & 0x01) else ">"
    envelope_code = (flags >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    env_len = envelope_sizes[envelope_code]
    wkb_start = 8 + env_len
    return wkb.loads(blob[wkb_start:])


def fix_antimeridian(geom):
    """Весь датасет - Дальний Восток России, поэтому легитимных отрицательных
    долгот тут нет: они всегда означают "восточнее 180-го меридиана", хранимое
    в формате -180..0. Это относится и к полигонам, пересекающим 180-й меридиан
    (напр. Эгвекинот), и к полигонам, целиком лежащим по другую сторону от
    него (напр. Провиденский округ, Чукотский район) - у них своя ширина bbox
    не превышает 180°, поэтому раньше такая проверка их не находила. Сдвигаем
    в диапазон >180, чтобы соседние муниципалитеты рисовались рядом, а не на
    другой стороне карты."""
    minx, _, maxx, _ = geom.bounds
    if minx >= 0:
        return geom
    return transform(lambda x, y, z=None: (x + 360 if x < 0 else x, y), geom)


def main():
    con = sqlite3.connect(GPKG_PATH)
    cur = con.cursor()
    cur.execute(f'SELECT "QGIS_name", "admin_level", geom FROM "{TABLE}"')
    rows = cur.fetchall()
    con.close()

    features = []
    municipalities = []
    seen = set()
    raw_points = 0
    simplified_points = 0

    for qgis_name, admin_level, blob in rows:
        if not qgis_name:
            continue
        name = qgis_name.strip()
        geom = parse_gpkg_geom(blob)
        if geom is None or geom.is_empty:
            continue

        raw_points += _count_points(geom)
        geom = fix_antimeridian(geom)
        geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        simplified_points += _count_points(geom)

        centroid = geom.centroid
        features.append(
            {
                "type": "Feature",
                "properties": {"QGIS_name": name, "admin_level": admin_level},
                "geometry": mapping(geom),
            }
        )
        if name not in seen:
            seen.add(name)
            lng = centroid.x - 360 if centroid.x > 180 else centroid.x
            municipalities.append({"name": name, "lat": centroid.y, "lng": lng})

    geojson = {"type": "FeatureCollection", "features": features}
    write_json(os.path.join(OUT_DIR, "geo.json"), geojson)
    write_json(os.path.join(OUT_DIR, "municipalities.json"), municipalities)

    print(f"  Точек до упрощения: {raw_points}, после: {simplified_points}")
    print(f"  Муниципалитетов: {len(municipalities)}, полигонов (features): {len(features)}")


def build_regions_geo():
    """data/regions.geojson.gz -> docs/data/regions_geo.json (свойство region = название)."""
    with gzip.open(REGIONS_GEOJSON, "rt", encoding="utf-8") as f:
        layer = json.load(f)

    features = []
    raw_points = simplified_points = 0
    for feat in layer["features"]:
        geom = shape(feat["geometry"])
        raw_points += _count_points(geom)
        # Регион, разрезанный по 180-му меридиану (Чукотка), после сдвига состоит
        # из двух касающихся частей; небольшой buffer туда-обратно склеивает их,
        # иначе по шву на карте видна тонкая линия.
        geom = fix_antimeridian(geom).buffer(1e-4).buffer(-1e-4)
        geom = geom.simplify(REGIONS_SIMPLIFY_TOLERANCE, preserve_topology=True)
        geom = shapely.set_precision(geom, 1e-4)  # ~10 м: убирает "шум" в знаках после запятой
        simplified_points += _count_points(geom)
        features.append(
            {
                "type": "Feature",
                "properties": {"region": feat["properties"][REGIONS_NAME_FIELD].strip()},
                "geometry": mapping(geom),
            }
        )
    write_json(os.path.join(OUT_DIR, "regions_geo.json"), {"type": "FeatureCollection", "features": features})
    print(f"  Регионов: {len(features)}. Точек до упрощения: {raw_points}, после: {simplified_points}")

    in_layer = {f["properties"]["region"] for f in features}
    in_data = set(pd.read_csv(REGIONS_CSV, usecols=["region"])["region"].unique())
    if in_layer != in_data:
        print("  !!! Названия регионов в слое и в region_calculations.csv не совпадают:")
        print(f"      только в слое:   {sorted(in_layer - in_data)}")
        print(f"      только в данных: {sorted(in_data - in_layer)}")


def _count_points(geom):
    if geom.geom_type == "Polygon":
        return len(geom.exterior.coords) + sum(len(r.coords) for r in geom.interiors)
    if geom.geom_type == "MultiPolygon":
        return sum(_count_points(g) for g in geom.geoms)
    return 0


if __name__ == "__main__":
    main()
