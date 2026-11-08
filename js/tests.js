/* =========================================================
   TripBudget — tests.js
   Автотесты чистых функций. Запуск: откройте сайт, нажмите F12,
   вкладка Console, введите runTests(). Страницу тесты не меняют.
   ========================================================= */

function runTests() {
  const results = [];
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ "Тест": name, "Ожидалось": expected, "Получено": actual, "Итог": pass ? "✅" : "❌" });
  };
  const NB = " "; // неразрывный пробел, его ставит Intl в суммах

  const base = { days: 5, nights: 4, travelers: 2, accommodation: 120, food: 40, transport: 300, activities: 150, limit: 0 };

  // 1. Обычная поездка (пример при открытии страницы)
  const r1 = calculateBudget(base);
  check("Проживание: 120 × 4 ночи", r1.amounts.accommodation, 480);
  check("Еда: 40 × 5 дней × 2 чел.", r1.amounts.food, 400);
  check("Итого", r1.total, 1330);
  check("В день: 1330 / 5", r1.perDay, 266);
  check("На человека: 1330 / 2", r1.perPerson, 665);

  // 2. Проценты
  const sum = Object.values(r1.percentages).reduce((a, b) => a + b, 0);
  check("Точные доли в сумме = 100", Math.round(sum), 100);
  check("Подписи процентов: 36/30/23/11", r1.labels, { accommodation: 36, food: 30, transport: 23, activities: 11 });
  const thirds = splitPercentages({ a: 1, b: 1, c: 1 }, 3);
  check("Три равные части → 34+33+33 = 100", Object.values(thirds).reduce((a, b) => a + b, 0), 100);
  check("Итог 0 → все проценты 0", splitPercentages({ a: 0, b: 0 }, 0), { a: 0, b: 0 });

  // 3. Деление на ноль
  const r3 = calculateBudget({ ...base, days: 0, travelers: 0 });
  check("0 дней → «в день» не считается", r3.perDay, null);
  check("0 человек → «на человека» не считается", r3.perPerson, null);

  // 4. Все расходы 0
  const r4 = calculateBudget({ ...base, accommodation: 0, food: 0, transport: 0, activities: 0 });
  check("Нулевые расходы: итог", r4.total, 0);
  check("Нулевые расходы: проценты без NaN", r4.percentages.food, 0);

  // 5. Дроби и округление
  const r5 = calculateBudget({ days: 1, nights: 1, travelers: 1, accommodation: 0.1, food: 0, transport: 0.2, activities: 0 });
  check("Дроби: 0.1 + 0.2 = 0.3", r5.total, 0.3);
  check("Округление вверх до цента: 13.001 → 13.01", ceilMoney(13.001), 13.01);
  check("Округление вверх: 32.5 остаётся 32.5", ceilMoney(32.5), 32.5);

  // 6. 0 ночей → проживание 0
  check("0 ночей → проживание 0", calculateBudget({ ...base, nights: 0 }).amounts.accommodation, 0);

  // 7. Проверка ввода
  check("Пустая сумма → 0 без ошибки", validateValue("", FIELD_RULES.food), { value: 0, error: null });
  check("Отрицательная сумма → ошибка", validateValue("-5", FIELD_RULES.food).error !== null, true);
  check("Пустые дни → ошибка", validateValue("", FIELD_RULES.days).error !== null, true);
  check("2.5 человека → ошибка", validateValue("2.5", FIELD_RULES.travelers).error !== null, true);
  check("Слишком большое число → ошибка", validateValue("1e12", FIELD_RULES.transport).error !== null, true);
  check("«12.50» → 12.5", validateValue("12.50", FIELD_RULES.food), { value: 12.5, error: null });
  check("Пустой лимит → без ошибки (необязательно)", validateValue("", FIELD_RULES.limit), { value: 0, error: null });

  // 8. Форматирование
  check("Формат EUR", formatMoney(1330, "EUR"), `1${NB}330,00${NB}€`);
  check("Формат USD", formatMoney(1330, "USD"), `1${NB}330,00${NB}$`);
  check("Формат PLN", formatMoney(1330.5, "PLN"), `1${NB}330,50${NB}zł`);
  check("Нет значения → «—»", formatMoney(null, "EUR"), "—");
  check("1 день", plural(1, DAY_FORMS), "1 день");
  check("3 дня", plural(3, DAY_FORMS), "3 дня");
  check("11 дней", plural(11, DAY_FORMS), "11 дней");
  check("Формат даты", formatIsoDate("2026-11-06"), "06.11.2026");

  // 9. Пустая форма
  check("Все поля пустые → форма пустая", isFormBlank(["", "", "  "]), true);
  check("Есть хоть одно значение → не пустая", isFormBlank(["", "5", ""]), false);
  check("Ноль — это значение, а не пустота", isFormBlank(["0", ""]), false);

  // 10. Лимит бюджета
  check("Лимит не задан → null", limitStatus(1330, 0), null);
  const ok = limitStatus(1330, 1500);
  check("В лимите: остаётся 170", [ok.over, ok.remaining], [false, 170]);
  const over = limitStatus(1330, 1000);
  check("Сверх лимита: превышение 330", [over.over, over.remaining], [true, -330]);

  // 11. Советы при превышении
  const tips = buildSuggestions(base, r1, 1200, "EUR"); // превышение 130 €
  check("Советов не больше 4", tips.length <= 4, true);
  check("Совет 1 — самая крупная статья (жильё): дешевле на 32,50 €",
    tips[0].includes(`32,50${NB}€`) && tips[0].includes(`87,50${NB}€`), true);
  check("Есть совет сократить поездку на день (40×2 + 120 = 200 €)",
    tips.some((t) => t.includes(`200,00${NB}€`)), true);
  check("Последний совет — увеличить лимит до итога", tips[tips.length - 1].includes(`1${NB}330,00${NB}€`), true);
  check("В пределах лимита — советов нет", buildSuggestions(base, r1, 2000, "EUR"), []);
  check("Без лимита — советов нет", buildSuggestions(base, r1, 0, "EUR"), []);

  // 12. Конвертация по курсам NBP
  const rates = { eur: 4.3925, usd: 3.9321 };
  check("100 EUR → 439,25 PLN", convertAmount(100, "EUR", "PLN", rates), 439.25);
  check("439,25 PLN → 100 EUR", convertAmount(439.25, "PLN", "EUR", rates), 100);
  check("100 USD → 89,52 EUR (кросс-курс)", convertAmount(100, "USD", "EUR", rates), 89.52);
  check("Та же валюта — без изменений", convertAmount(55.5, "USD", "USD", rates), 55.5);
  check("Нет курсов → null", convertAmount(100, "EUR", "PLN", null), null);

  // 13. Курсы NBP
  const sampleNbp = [{ table: "A", effectiveDate: "2026-11-06", rates: [
    { code: "USD", mid: 3.9321 }, { code: "EUR", mid: 4.3925 }, { code: "GBP", mid: 5.1 },
  ] }];
  check("NBP: дата и курсы из ответа", parseNbpTable(sampleNbp), { date: "2026-11-06", eur: 4.3925, usd: 3.9321 });
  let badAnswerRejected = false;
  try { parseNbpTable([{ effectiveDate: "2026-11-06", rates: [] }]); } catch { badAnswerRejected = true; }
  check("NBP: ответ без курсов отклоняется", badAnswerRejected, true);
  const rows = buildRateRows({ eur: 4, usd: 2 });
  check("Строки курсов: EUR→PLN 4, USD→PLN 2, USD→EUR 0.5", rows.map((r) => `${r.from}-${r.to}:${r.value}`).join(" "),
    "EUR-PLN:4 USD-PLN:2 USD-EUR:0.5");
  check("Формат курса: 4 знака", formatRate(4.3925, "PLN"), `4,3925${NB}zł`);
  check("Курсы: полный набор годится", isValidRates({ date: "2026-11-06", eur: 4.39, usd: 3.93, fetchedAt: "2026-11-07T11:00:00Z" }), true);
  check("Курсы: без времени получения не годятся", isValidRates({ date: "2026-11-06", eur: 4.39, usd: 3.93 }), false);

  // 14. Сохранённые поездки
  const tripA = { id: "a", currency: "EUR", fields: { destination: "Рим", days: "3" }, updatedAt: "2026-11-01T10:00:00Z" };
  const tripB = { id: "b", currency: "PLN", fields: { destination: "Гданьск" }, updatedAt: "2026-11-05T10:00:00Z" };
  check("Поездка правильной формы", isValidTrip(tripA), true);
  check("Поездка с неизвестной валютой отклоняется", isValidTrip({ ...tripA, currency: "GBP" }), false);
  check("Добавление: новая поездка встаёт первой", upsertTrip([tripA], tripB).map((t) => t.id), ["b", "a"]);
  check("Изменение: та же поездка заменяется, список не растёт",
    upsertTrip([tripA, tripB], { ...tripA, currency: "USD" }).map((t) => `${t.id}:${t.currency}`), ["a:USD", "b:PLN"]);
  check("Удаление", removeTrip([tripA, tripB], "a").map((t) => t.id), ["b"]);
  check("Сортировка: свежие сверху", sortTrips([tripA, tripB]).map((t) => t.id), ["b", "a"]);
  check("Числа поездки: неверные значения → 0", tripNumbers({ fields: { days: "abc", food: "-5", nights: "2" } }).days, 0);
  check("Числа поездки: правильные значения читаются", tripNumbers({ fields: { nights: "2" } }).nights, 2);

  // 15. Страны и города
  check("Стран в списке больше 240", COUNTRIES.length > 240, true);
  check("Список стран — по алфавиту", COUNTRIES[0].name, "Австралия");
  const empty = searchCountries("");
  check("Без запроса: 20 популярных сверху, остальные ниже, без повторов",
    [empty.popular.length, empty.popular.length + empty.others.length], [20, COUNTRIES.length]);
  check("Первое популярное направление — Италия", empty.popular[0].name, "Италия");
  check("«ита» → Италия первой", searchCountries("ита").matches[0].country.code, "IT");
  check("По-английски: «spain» → Испания", searchCountries("spain").matches[0].country.code, "ES");
  check("Синоним: «Англия» → Великобритания", searchCountries("англия").matches[0].country.code, "GB");
  check("Буква ё не важна: «турция» и «ТУРЦИЯ»", searchCountries("ТУРЦИЯ").matches[0].country.code, "TR");
  const byCity = searchCountries("рим").matches[0];
  check("По городу: «рим» → Италия (через город Рим)", [byCity.country.code, byCity.via], ["IT", "Рим"]);
  check("При равных совпадениях популярные первыми: «гре» → Греция", searchCountries("гре").matches[0].country.code, "GR");
  check("Ничего не найдено → пустой список", searchCountries("ыыыыы").matches.length, 0);
  check("Точное название страны распознаётся", findCountryByName("  франция ").code, "FR");
  check("Неточное название не распознаётся", findCountryByName("франц"), null);
  check("США — привычное название", countryName("US"), "США");
  check("Города Италии: популярные первыми", searchCities("IT", "").slice(0, 3), ["Рим", "Венеция", "Флоренция"]);
  check("Поиск города: «фл» → Флоренция", searchCities("IT", "фл"), ["Флоренция"]);
  check("Поиск по части слова: «крус» → Санта-Крус-де-Тенерифе", searchCities("ES", "крус"), ["Санта-Крус-де-Тенерифе"]);
  check("Страна без списка городов → пусто", searchCities("TV", ""), []);
  check("Каждая страна с городами есть в списке стран", Object.keys(CITIES).every((c) => COUNTRY_BY_CODE[c]), true);
  check("В списках городов нет повторов", Object.values(CITIES).every((l) => new Set(l).size === l.length), true);
  check("Подпись в формате «Страна, Город»: «Италия, Рим»", destinationLabel("Рим", "IT"), "Италия, Рим");
  check("Только страна: «Италия»", destinationLabel("", "IT"), "Италия");
  check("Подпись без повтора: Сингапур", destinationLabel("Сингапур", "SG"), "Сингапур");
  check("Старая поездка без страны: только город", destinationLabel("Москва", ""), "Москва");
  check("Название поездки: пусто → «Без названия»", tripName({ destination: "" }), "Без названия");

  // 16. Случайный фон
  let repeats = 0;
  let outOfRange = 0;
  for (let last = 0; last < 12; last++) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const i = pickBackgroundIndex(12, last, () => r);
      if (i === last) repeats++;
      if (i < 0 || i > 11) outOfRange++;
    }
  }
  check("Фон: прошлое фото не повторяется", repeats, 0);
  check("Фон: номер всегда от 0 до 11", outOfRange, 0);
  check("Фон: одно фото — всегда 0", pickBackgroundIndex(1, 0), 0);

  console.table(results);
  const failed = results.filter((r) => r["Итог"] === "❌").length;
  const summary = `${results.length - failed} из ${results.length} тестов пройдено`;
  console.log(failed === 0 ? `✅ ${summary}` : `❌ ${summary}`);
  return { total: results.length, failed, failures: results.filter((r) => r["Итог"] === "❌") };
}
