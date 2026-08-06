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
  final_calculations_ci_econ.csv
  final_calculations_ci_econ_indexed.csv
  final_calculations_ci_ip.csv
  final_calculations_with_extra.csv
  final_calculations_with_extra_indexed.csv
  map_DV_for_Moran_final.gpkg
  ci_mapping.xlsx
  indicators_mapping.xlsx
  Сопоставление MunicOffic и QGIS_name.xlsx

scripts/                build-скрипты (Python)
  build.py               точка входа: пересобирает всё
  build_geo.py            gpkg -> docs/data/geo.json, municipalities.json
  build_data.py            csv -> docs/data/*.json
  common.py                общие функции
  requirements.txt

docs/                   сайт карты (публикуется GitHub Pages)
  index.html, app.js, style.css
  data/                   сгенерированные JSON (НЕ редактировать руками)
```

## Как это устроено

- Геометрия муниципалитетов хранится в `map_DV_for_Moran_final.gpkg`, поле
  `QGIS_name`.
- Данные (`final_*.csv`) используют поле `oktmo_name_actual`.
- Файл **`Сопоставление MunicOffic и QGIS_name.xlsx`** — таблица
  соответствия `oktmo_name_actual -> QGIS_name`, по ней build-скрипт
  сопоставляет данные с геометрией.
- `final_calculations_ci_econ_indexed.csv` и
  `final_calculations_with_extra_indexed.csv` — те же данные с поправкой на
  инфляцию. В интерфейсе карты это не отдельный набор данных, а тумблер
  «Индексировано» рядом с выбором набора.

## Обновление данных

Когда у вас появятся новые версии данных:

1. Замените нужные файлы в `data/` (названия и структура столбцов должны
   совпадать с текущими: `region, year, city, oktmo_name_actual, category, ...`
   для файлов по категориям КИ; `region, year, city, oktmo_name_actual, ...`
   для `with_extra`).
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
