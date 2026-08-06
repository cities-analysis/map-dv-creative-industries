"""
Полная пересборка данных карты: data/*.csv, *.xlsx, *.gpkg -> docs/data/*.json

Запуск:
    python3 scripts/build.py

(из корня репозитория; предварительно pip install -r scripts/requirements.txt)
"""
import build_geo
import build_data

if __name__ == "__main__":
    print("=== Геометрия (gpkg -> geo.json) ===")
    build_geo.main()
    print("\n=== Данные (csv -> json) ===")
    build_data.main()
    print("\nГотово. Обновите docs/ в браузере или запушьте в GitHub.")
