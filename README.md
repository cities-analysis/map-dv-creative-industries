# Креативные индустрии Дальнего Востока — интерактивная карта

Интерактивная карта-хороплет по муниципалитетам Дальнего Востока: экономика
и ИП креативных индустрий по категориям, а также общие муниципальные
показатели (население, инвестиции, культурная инфраструктура и т.д.),
2009–2025.

**Карта:** `docs/index.html` — статический сайт на Leaflet, публикуется
через GitHub Pages. Открывается прямо в браузере (`docs/data/*.json`
подгружаются через fetch, поэтому локально карту нужно открывать через
локальный сервер, а не файлом `file://`).

## Структура проекта

```
data/                  исходные данные (обновляете вы)
  city_calculations.csv             общие показатели по муниципалитетам
  city_ci_2025_calculations.csv     экономика КИ по муниципалитетам и категориям
  final_calculations_ci_ip.csv      ИП КИ по муниципалитетам и категориям
  region_calculations.csv           показатели по регионам (вкладка «Регионы»)
  regions.geojson.gz                контуры 11 регионов (поле name = название региона)
  map_DV_for_Moran_final.gpkg
  ci_mapping.xlsx
  indicators_mapping.xlsx
  Сопоставление MunicOffic и QGIS_name.xlsx

scripts/                build-скрипты (Python)
  build.py               точка входа: пересобирает всё
  build_geo.py            gpkg -> geo.json, municipalities.json; regions.geojson.gz -> regions_geo.json
  build_data.py            муниципальные csv -> docs/data/*.json
  build_regions.py         region_calculations.csv -> docs/data/regions.json
  common.py                общие функции
  requirements.txt

docs/                   сайт карты (публикуется GitHub Pages)
  index.html, style.css, data.js, main.js
  map.js, charts.js, ci.js, regions.js   по одному модулю на вкладку
  data/                   сгенерированные JSON (НЕ редактировать руками)
```

## Как это устроено

- Геометрия муниципалитетов хранится в `map_DV_for_Moran_final.gpkg`, поле
  `QGIS_name`.
- Муниципальные данные (`city_*.csv`, `final_calculations_ci_ip.csv`) используют поле
  `oktmo_name_actual`; региональные (`region_calculations.csv`) — поле `region`.
- Файл **`Сопоставление MunicOffic и QGIS_name.xlsx`** — таблица
  соответствия `oktmo_name_actual -> QGIS_name`, по ней build-скрипт
  сопоставляет данные с геометрией.
- В файлах `city_*.csv` и `region_calculations.csv` есть колонка `indexed`
  (`True` — значения с поправкой на инфляцию, `False` — номинальные). В
  интерфейсе это не отдельный набор данных, а тумблер «Индексировано».
- Вкладка «Регионы» берёт контуры из `docs/data/regions_geo.json` (собирается из
  `data/regions.geojson.gz`, названия в поле `name` должны совпадать с колонкой
  `region` в `region_calculations.csv`), значения — из `docs/data/regions.json`. Нули в показателях, зависящих от оплаты труда
  (`wages == 0`, это 2009–2011 годы), считаются «нет данных».
- Русские названия показателей берутся из `indicators_mapping.xlsx` (код
  показателя → название); если кода там нет, в интерфейсе виден сам код.

## Обновление данных

Когда у вас появятся новые версии данных:

1. Замените нужные файлы в `data/` (названия и структура столбцов должны
   совпадать с текущими: `region, year, city, oktmo_name_actual, category, ...,
   indexed` для `city_ci_2025_calculations.csv`; `region, year, city,
   oktmo_name_actual, ..., indexed` для `city_calculations.csv`;
   `region, year, ..., indexed` для `region_calculations.csv`).
2. Если появились новые муниципалитеты — добавьте строки в файл
   сопоставления `Сопоставление MunicOffic и QGIS_name.xlsx`
   (`oktmo_name_actual`, `QGIS_name`).
3. Пересоберите карту:

   ```bash
   pip install -r scripts/requirements.txt   # один раз
   python3 scripts/build.py
   ```

   Скрипт выведет предупреждения, если какие-то `oktmo_name_actual` не
   нашлись в файле сопоставления, либо если `QGIS_name` из данных не
   нашёлся в геометрии карты — их стоит проверить вручную.

4. Проверьте локально (см. ниже) и закоммитьте изменения в `docs/data/*`
   вместе с обновлёнными файлами в `data/`.
5. `git push` — GitHub Pages пересоберёт сайт автоматически за 1-2 минуты.


## Локальный просмотр

```bash
python3 -m http.server 8642 --directory docs
```

Откройте http://localhost:8642

## Публикация / обновление на GitHub Pages

Сайт публикуется из папки `docs/` ветки `main`. После `git commit -am "update site" && git push` в `main`
GitHub Pages автоматически обновит сайт (Settings → Pages → Source: `main`
/ `docs`).
