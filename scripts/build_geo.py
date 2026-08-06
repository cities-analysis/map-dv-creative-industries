"""
Конвертирует data/map_DV_for_Moran_final.gpkg -> docs/data/geo.json (GeoJSON).

Геометрия читается напрямую из GeoPackage (SQLite) без GDAL: парсим
заголовок GeoPackage Binary и передаём WKB в shapely. Полигоны
упрощаются (Douglas-Peucker), чтобы карта быстро грузилась в браузере.
"""
import sqlite3
import struct

from shapely import wkb
from shapely.geometry import mapping
from shapely.ops import transform

from common import DATA_DIR, OUT_DIR, write_json
import os

GPKG_PATH = os.path.join(DATA_DIR, "map_DV_for_Moran_final.gpkg")
TABLE = "map_dv_for_moran_final"
SIMPLIFY_TOLERANCE = 0.0015  # градусы; ~150м, компромисс между весом и детализацией


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
    """Полигоны, пересекающие 180-й меридиан (напр. Чукотка), сдвигаем
    в диапазон >180, чтобы Leaflet не считал их шириной во весь земной шар."""
    minx, _, maxx, _ = geom.bounds
    if maxx - minx <= 180:
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


def _count_points(geom):
    if geom.geom_type == "Polygon":
        return len(geom.exterior.coords) + sum(len(r.coords) for r in geom.interiors)
    if geom.geom_type == "MultiPolygon":
        return sum(_count_points(g) for g in geom.geoms)
    return 0


if __name__ == "__main__":
    main()
