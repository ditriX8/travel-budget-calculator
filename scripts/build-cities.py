#!/usr/bin/env python3
"""
TripBudget — сборка списков городов из открытой базы GeoNames.

Источник: https://download.geonames.org/export/dump/ (лицензия CC BY 4.0).
Нужны три файла (скачайте их в одну папку):
  cities1000.zip         — населённые пункты от 1000 жителей
  alternateNamesV2.zip   — названия на разных языках (берём русские)
  admin1CodesASCII.txt   — регионы (для подсказки при одинаковых названиях)

Запуск (из корня проекта):
  python3 -I scripts/build-cities.py ПАПКА_С_ФАЙЛАМИ assets/data/cities

Результат: по файлу на страну, например assets/data/cities/PL.json:
  {"source": "...", "cities": [["Варшава", "Warsaw", ""], ["Эльблонг", "Elblag", ""], ...]}
  Каждый город: [название для показа, латинское название для поиска, подсказка-регион].
  Города отсортированы по численности населения (крупные — первыми).

Отбор:
  - население от 15 000, а также столицы стран и регионов (PPLC, PPLA);
  - без районов городов, исторических и заброшенных мест;
  - русское название, если оно есть в GeoNames (без украинских/сербских вариантов),
    иначе — оригинальное название.
Только стандартная библиотека Python, ничего устанавливать не нужно.
"""

import csv
import io
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path

MIN_POPULATION = 15000
CAPITAL_CODES = {"PPLC", "PPLA"}                     # столица страны / региона
SKIP_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}  # район, исторический, заброшенный, разрушенный

# Русское название: кириллица без украинских (іїєґ) и сербских/македонских (ђјљњћџѓќѕ) букв
RU_NAME = re.compile(r"^[А-Яа-яЁё0-9\s\-–'’.()]+$")
NOT_RU = re.compile(r"[іїєґІЇЄҐђјљњћџѓќѕЂЈЉЊЋЏЃЌЅ]")


def is_russian(name):
    return bool(RU_NAME.match(name)) and not NOT_RU.search(name) and re.search(r"[А-Яа-яЁё]", name)


def read_cities(zip_path):
    """Города из cities1000.zip, прошедшие отбор."""
    cities = {}
    with zipfile.ZipFile(zip_path) as z, z.open("cities1000.txt") as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            c = line.rstrip("\n").split("\t")
            if len(c) < 15:
                continue
            gid, name, ascii_name, fcode, country = c[0], c[1], c[2], c[7], c[8]
            admin1, admin2, admin3, population = c[10], c[11], c[12], int(c[14] or 0)
            if fcode in SKIP_CODES:
                continue
            if population < MIN_POPULATION and fcode not in CAPITAL_CODES:
                continue
            cities[gid] = {
                "name": name, "ascii": ascii_name, "country": country, "code": fcode,
                "admin1": f"{country}.{admin1}", "pop": population, "capital": fcode == "PPLC",
                # Муниципалитет (если указан): по нему находим районы больших городов
                "municipality": f"{country}.{admin1}.{admin2}.{admin3}" if admin3 else "",
            }
    return drop_city_districts(cities)


def drop_city_districts(cities):
    """
    Районы больших городов записаны в GeoNames как обычные населённые пункты (PPL),
    но с тем же кодом муниципалитета, что и сам город (Włochy — район Варшавы).
    В каждом муниципалитете оставляем самый крупный пункт и административные центры,
    а остальные PPL считаем районами и убираем.
    """
    largest = {}
    for gid, c in cities.items():
        m = c["municipality"]
        if m and (m not in largest or c["pop"] > cities[largest[m]]["pop"]):
            largest[m] = gid
    kept = {}
    for gid, c in cities.items():
        m = c["municipality"]
        is_district = m and largest[m] != gid and c["code"] == "PPL"
        if not is_district:
            kept[gid] = c
    print(f"  убрано районов больших городов: {len(cities) - len(kept)}")
    return kept


def read_regions(path):
    """Регионы: код "PL.86" → (geonameid, английское название)."""
    regions = {}
    with open(path, encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if len(row) >= 4:
                regions[row[0]] = (row[3], row[2])
    return regions


def read_russian_names(zip_path, wanted_ids):
    """Лучшее русское название для каждого нужного geonameid."""
    best = {}
    with zipfile.ZipFile(zip_path) as z, z.open("alternateNamesV2.txt") as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            c = line.rstrip("\n").split("\t")
            if len(c) < 8 or c[2] != "ru" or c[1] not in wanted_ids:
                continue
            name, preferred, short, colloquial, historic = c[3].strip(), c[4], c[5], c[6], c[7]
            if colloquial == "1" or historic == "1" or not is_russian(name):
                continue
            # Чем меньше ключ, тем лучше: официально предпочтительное, короткое, без скобок
            rank = (preferred != "1", short != "1", "(" in name, len(name))
            if c[1] not in best or rank < best[c[1]][0]:
                best[c[1]] = (rank, name)
    return {gid: v[1] for gid, v in best.items()}


def main(src_dir, out_dir):
    src, out = Path(src_dir), Path(out_dir)
    print("Читаю города…")
    cities = read_cities(src / "cities1000.zip")
    regions = read_regions(src / "admin1CodesASCII.txt")
    wanted = set(cities) | {regions[c["admin1"]][0] for c in cities.values() if c["admin1"] in regions}
    print(f"  отобрано городов: {len(cities)}. Ищу русские названия…")
    ru = read_russian_names(src / "alternateNamesV2.zip", wanted)

    by_country = {}
    for gid, c in cities.items():
        display = ru.get(gid, c["name"])
        region_id, region_en = regions.get(c["admin1"], ("", ""))
        region = ru.get(region_id, region_en)
        by_country.setdefault(c["country"], []).append(
            {"name": display, "ascii": c["ascii"], "region": region, "pop": c["pop"], "capital": c["capital"]})

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()  # пересобираем с нуля
    source = f"GeoNames (geonames.org), CC BY 4.0, выгрузка {date.today().isoformat()}"
    total = with_ru = 0
    for country, items in sorted(by_country.items()):
        # Столица первой, дальше по населению
        items.sort(key=lambda x: (not x["capital"], -x["pop"]))
        seen, rows = {}, []
        for it in items:
            seen[it["name"].lower()] = seen.get(it["name"].lower(), 0) + 1
        added = set()
        for it in items:
            key = (it["name"].lower(), it["region"])
            if key in added:
                continue  # полный дубликат (то же название в том же регионе)
            added.add(key)
            hint = it["region"] if seen[it["name"].lower()] > 1 else ""
            latin = it["ascii"] if it["ascii"] != it["name"] else ""
            rows.append([it["name"], latin, hint])
            total += 1
            with_ru += bool(re.search(r"[А-Яа-яЁё]", it["name"]))
        (out / f"{country}.json").write_text(
            json.dumps({"source": source, "cities": rows}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
    print(f"Готово: {total} городов в {len(by_country)} странах, с русским названием: {with_ru} "
          f"({round(100 * with_ru / max(total, 1))}%). Папка: {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
