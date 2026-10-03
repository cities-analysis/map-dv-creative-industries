"""
Полная пересборка данных карты: data/*.csv, *.xlsx, *.gpkg -> docs/data/*.json

Запуск:
    python3 scripts/build.py

(из корня репозитория; предварительно pip install -r scripts/requirements.txt)
"""
import build_geo
import build_data
import build_regions

if __name__ == "__main__":
    print("=== Геометрия (gpkg -> geo.json) ===")
    build_geo.main()
    print("\n=== Данные по муниципалитетам (csv -> json) ===")
    build_data.main()
    print("\n=== Контуры регионов (regions.geojson.gz -> regions_geo.json) ===")
    build_geo.build_regions_geo()
    print("\n=== Данные по регионам (region_calculations.csv -> regions.json) ===")
    build_regions.main()
    print("\nГотово. Обновите docs/ в браузере или запушьте в GitHub.")
