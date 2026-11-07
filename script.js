/* =========================================================
   Калькулятор бюджета путешествия — логика
   Файл разделён на части:
   1. Настройки
   2. Чистые функции (только математика, без страницы)
   3. Форматирование
   4. Работа со страницей (чтение формы, проверка, вывод)
   5. События
   6. Тесты — запуск в консоли браузера: runTests()
   ========================================================= */

/* ---------- 1. НАСТРОЙКИ ---------- */

// Категории расходов: ключ, значок и название для разбивки
const CATEGORIES = [
  { key: "accommodation", icon: "🏨", name: "Проживание" },
  { key: "food",          icon: "🍽️", name: "Еда" },
  { key: "transport",     icon: "🚆", name: "Транспорт" },
  { key: "activities",    icon: "🎟️", name: "Развлечения" },
];

// Разумный верхний предел, чтобы огромные числа не ломали вывод
const MAX_AMOUNT = 1_000_000_000;
const MAX_COUNT = 1000;

// Правила проверки для каждого числового поля
const FIELD_RULES = {
  days:          { label: "Дней в поездке",       min: 1, max: MAX_COUNT,  integer: true },
  nights:        { label: "Ночей проживания",     min: 0, max: MAX_COUNT,  integer: true },
  travelers:     { label: "Путешественников",     min: 1, max: MAX_COUNT,  integer: true },
  accommodation: { label: "Проживание",           min: 0, max: MAX_AMOUNT, integer: false },
  food:          { label: "Еда",                  min: 0, max: MAX_AMOUNT, integer: false },
  transport:     { label: "Транспорт",            min: 0, max: MAX_AMOUNT, integer: false },
  activities:    { label: "Развлечения",          min: 0, max: MAX_AMOUNT, integer: false },
};

/* ---------- 2. ЧИСТЫЕ ФУНКЦИИ ----------
   "Чистая" функция: получает данные, возвращает результат
   и больше ничего не трогает. Её легко тестировать. */

// Округление до копеек/центов.
// Зачем: компьютер хранит дроби неточно, и 0.1 + 0.2 = 0.30000000000000004
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// Безопасное деление: если делить не на что — возвращаем null,
// а не Infinity или NaN. null означает "посчитать нельзя".
function safeDivide(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) {
    return null;
  }
  return a / b;
}

// Проверяет одно значение из поля (оно приходит строкой) по правилу.
// Возвращает { value, error }: число для расчёта и текст ошибки (или null).
function validateValue(raw, rule) {
  const text = String(raw).trim();

  if (text === "") {
    // Пустая сумма = 0, это нормально. Пустые дни/путешественники — ошибка.
    const error = rule.min > 0 ? `Укажите поле «${rule.label}».` : null;
    return { value: 0, error };
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return { value: 0, error: `«${rule.label}»: введите число.` };
  }
  if (number < rule.min) {
    return { value: 0, error: `«${rule.label}»: значение не может быть меньше ${rule.min}.` };
  }
  if (number > rule.max) {
    return { value: 0, error: `«${rule.label}»: слишком большое значение.` };
  }
  if (rule.integer && !Number.isInteger(number)) {
    return { value: Math.floor(number), error: `«${rule.label}»: нужно целое число.` };
  }
  return { value: number, error: null };
}

// Форма пустая? (например, сразу после сброса)
// На входе — список текстов из полей. Пустая = во всех полях ничего нет.
function isFormBlank(rawValues) {
  return rawValues.every((raw) => String(raw).trim() === "");
}

// Главный расчёт. На входе — числа, на выходе — все суммы бюджета.
function calculateBudget(input) {
  const amounts = {
    accommodation: roundMoney(input.accommodation * input.nights),
    food:          roundMoney(input.food * input.days * input.travelers),
    transport:     roundMoney(input.transport),
    activities:    roundMoney(input.activities),
  };

  const total = roundMoney(
    amounts.accommodation + amounts.food + amounts.transport + amounts.activities
  );

  // Доля каждой категории в процентах. Если итог 0 — все доли 0 (а не NaN).
  const percentages = {};
  for (const { key } of CATEGORIES) {
    const share = safeDivide(amounts[key], total);
    percentages[key] = share === null ? 0 : share * 100;
  }

  const perDay = safeDivide(total, input.days);
  const perPerson = safeDivide(total, input.travelers);

  return {
    amounts,
    total,
    perDay: perDay === null ? null : roundMoney(perDay),
    perPerson: perPerson === null ? null : roundMoney(perPerson),
    percentages,
  };
}

/* ---------- 3. ФОРМАТИРОВАНИЕ ---------- */

// Intl.NumberFormat — встроенный в браузер форматировщик.
// Он сам ставит пробелы между разрядами, запятую и символ валюты.
// narrowSymbol — короткий символ: "zł" вместо "PLN".
function formatMoney(value, currency) {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(value);
}

// Русские окончания: 1 день, 2 дня, 5 дней.
// Intl.PluralRules знает правила языка и возвращает "one", "few" или "many".
const pluralRules = new Intl.PluralRules("ru-RU");
function plural(count, forms) {
  return `${count} ${forms[pluralRules.select(count)] || forms.many}`;
}

/* ---------- 4. РАБОТА СО СТРАНИЦЕЙ ---------- */

// Находим элементы один раз и запоминаем — так не ищем их при каждом вводе
const form = document.getElementById("budget-form");
const el = {
  destination: document.getElementById("destination"),
  currency:    document.getElementById("currency"),
  message:     document.getElementById("form-message"),
  summary:     document.getElementById("trip-summary"),
  total:       document.getElementById("total"),
  perDay:      document.getElementById("per-day"),
  perPerson:   document.getElementById("per-person"),
  breakdown:   document.getElementById("breakdown"),
};

// Поля, которые человек уже трогал. Ошибку "Укажите поле" показываем
// только для них — иначе сразу после сброса всё было бы красным.
const touchedFields = new Set();

// Читаем все поля, проверяем их и подсвечиваем ошибки.
// showAllErrors = true — показать все ошибки (после нажатия "Рассчитать бюджет").
function readForm(showAllErrors = false) {
  const values = {};
  const errors = [];

  for (const [id, rule] of Object.entries(FIELD_RULES)) {
    const input = document.getElementById(id);

    // Важная ловушка: если в числовом поле недописанный ввод ("5-", "1e"),
    // браузер отдаёт пустую строку "", как будто поле пустое.
    // Отличить это можно только через validity.badInput.
    let { value, error } = input.validity.badInput
      ? { value: 0, error: `«${rule.label}»: введите число.` }
      : validateValue(input.value, rule);

    // Пустое поле, которое ещё не трогали, — пока не ошибка
    const isUntouchedEmpty = input.value.trim() === "" && !input.validity.badInput
      && !touchedFields.has(id) && !showAllErrors;
    if (isUntouchedEmpty) error = null;

    values[id] = value;

    // Красная рамка у поля с ошибкой (стиль .is-invalid уже есть в CSS)
    input.classList.toggle("is-invalid", error !== null);
    input.setAttribute("aria-invalid", error !== null);
    if (error) errors.push(error);
  }

  // Мягкое предупреждение: ночей больше, чем дней, — скорее всего опечатка
  if (values.nights > values.days && values.days > 0) {
    errors.push("Ночей больше, чем дней в поездке — проверьте значения.");
  }

  return {
    destination: el.destination.value.trim(),
    currency: el.currency.value,
    values,
    errors,
  };
}

// Создаёт одну строку разбивки. Используем textContent, а не innerHTML:
// так любой текст выводится как текст и не может стать HTML-кодом.
function createBreakdownItem(category, amountText, percent) {
  const item = document.createElement("li");
  item.className = "breakdown-item";

  const head = document.createElement("div");
  head.className = "breakdown-head";

  const name = document.createElement("span");
  name.className = "breakdown-name";
  name.textContent = `${category.icon} ${category.name}`;

  const amount = document.createElement("span");
  amount.className = "breakdown-amount";
  amount.textContent = amountText + " ";
  const percentLabel = document.createElement("small");
  percentLabel.textContent = `${Math.round(percent)}%`;
  amount.append(percentLabel);

  const bar = document.createElement("div");
  bar.className = "breakdown-bar";
  const fill = document.createElement("div");
  // Второй класс задаёт цвет полоски (например, breakdown-fill--food)
  fill.className = `breakdown-fill breakdown-fill--${category.key}`;
  fill.style.width = `${percent}%`;
  bar.append(fill);

  head.append(name, amount);
  item.append(head, bar);
  return item;
}

// Пустое состояние: прочерки вместо сумм, без ошибок и красных рамок
function showEmptyState() {
  el.summary.textContent = "Заполните данные поездки";
  el.total.textContent = "—";
  el.perDay.textContent = "—";
  el.perPerson.textContent = "—";
  el.breakdown.replaceChildren(); // CSS покажет подсказку для пустого списка
  el.message.textContent = "";
  for (const input of form.querySelectorAll(".is-invalid")) {
    input.classList.remove("is-invalid");
    input.setAttribute("aria-invalid", "false");
  }
}

// Главная функция обновления: прочитать → посчитать → показать
function update(showAllErrors = false) {
  // Совсем пустая форма (например, после сброса) — показываем прочерки,
  // без ошибок. Исключение: человек нажал "Рассчитать бюджет".
  const numberInputs = Object.keys(FIELD_RULES).map((id) => document.getElementById(id));
  const blank = isFormBlank([el.destination.value, ...numberInputs.map((i) => i.value)])
    && !numberInputs.some((i) => i.validity.badInput);
  if (blank && !showAllErrors) {
    showEmptyState();
    return [];
  }

  const data = readForm(showAllErrors);
  const result = calculateBudget(data.values);
  const { days, nights, travelers } = data.values;

  // Сводка поездки. Нулевые значения не показываем ("0 ночей" выглядит странно).
  const place = data.destination || "Направление не указано";
  const parts = [place];
  if (days > 0) parts.push(plural(days, { one: "день", few: "дня", many: "дней" }));
  if (nights > 0) parts.push(plural(nights, { one: "ночь", few: "ночи", many: "ночей" }));
  if (travelers > 0) parts.push(plural(travelers, { one: "путешественник", few: "путешественника", many: "путешественников" }));
  el.summary.textContent = parts.join(" · ");

  // Итоги
  el.total.textContent = formatMoney(result.total, data.currency);
  el.perDay.textContent = formatMoney(result.perDay, data.currency);
  el.perPerson.textContent = formatMoney(result.perPerson, data.currency);

  // Разбивка. Если итог 0 — список пустой, и CSS покажет подсказку.
  el.breakdown.replaceChildren();
  if (result.total > 0) {
    for (const category of CATEGORIES) {
      el.breakdown.append(createBreakdownItem(
        category,
        formatMoney(result.amounts[category.key], data.currency),
        result.percentages[category.key]
      ));
    }
  }

  // Сообщения об ошибках (пустая строка — блок скрыт через CSS)
  el.message.textContent = data.errors.join(" ");

  return data.errors;
}

/* ---------- 5. СОБЫТИЯ ---------- */

// Событие "input" срабатывает при каждом изменении любого поля формы
// (включая выбор валюты). Одного слушателя на форме хватает для всех полей.
// Заодно запоминаем, какое поле человек тронул.
form.addEventListener("input", (event) => {
  if (event.target.id) touchedFields.add(event.target.id);
  update();
});

// Сброс. По умолчанию браузер вернул бы поля к примеру из HTML (Париж, 5 дней…).
// preventDefault() отменяет это, и мы сами очищаем все поля.
// Валюту не трогаем: "пустой" валюты не бывает, остаётся выбранная.
form.addEventListener("reset", (event) => {
  event.preventDefault();
  for (const input of form.querySelectorAll("input")) {
    input.value = "";
  }
  touchedFields.clear();
  update();
});

// Кнопка "Рассчитать бюджет" (type="submit") и клавиша Enter вызывают
// событие "submit". По умолчанию браузер перезагрузил бы страницу —
// preventDefault() это отменяет, и вместо перезагрузки мы считаем бюджет.
const resultsCard = document.getElementById("results");
const totalBox = document.getElementById("total-box");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const errors = update(true); // true — показать все ошибки, даже в нетронутых полях

  // Есть ошибки → ставим курсор в первое поле с ошибкой
  if (errors.length > 0) {
    const firstInvalid = form.querySelector(".is-invalid");
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  // На телефоне результаты находятся ниже формы — прокручиваем к ним
  if (window.matchMedia("(max-width: 860px)").matches) {
    resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Короткая анимация итога. Класс удаляем и добавляем заново,
  // а чтение offsetWidth заставляет браузер "заметить" удаление —
  // иначе при повторном нажатии анимация не запустится.
  totalBox.classList.remove("is-updated");
  void totalBox.offsetWidth;
  totalBox.classList.add("is-updated");
});

// Первый расчёт сразу при открытии страницы
update();

/* ---------- 5б. СЛУЧАЙНЫЙ ФОН ----------
   При каждой загрузке страницы выбираем случайное фото.
   Номер прошлого фото храним в localStorage (небольшое хранилище в браузере),
   чтобы при обновлении страницы фото точно сменилось. */

const BACKGROUNDS = [
  { file: "mountains-clouds.jpg" },  // Горы над облаками
  { file: "beach-sunset.jpg" },      // Пляж на закате
  { file: "golden-valley.jpg" },     // Золотая долина
  { file: "forest-path.jpg" },       // Тропа в лесу
  { file: "mountain-lake.jpg" },     // Горное озеро
  { file: "ocean-waves.jpg" },       // Волны океана
  { file: "green-hills.jpg" },       // Зелёные холмы
  { file: "lake-boat.jpg" },         // Лодка на озере
  { file: "starry-mountains.jpg" },  // Звёздное небо над горами
  { file: "canyon-road.jpg" },       // Дорога через каньон
  { file: "lake-pier.jpg" },         // Причал на лесном озере
  { file: "alpine-valley.jpg" },     // Альпийская долина
];

// Чистая функция: случайный номер от 0 до count-1, но не равный lastIndex.
// Приём: выбираем из (count - 1) вариантов и "перепрыгиваем" через прошлый.
// random передаётся параметром, чтобы в тестах можно было подставить своё число.
function pickBackgroundIndex(count, lastIndex, random = Math.random) {
  if (count <= 1) return 0;
  const hasLast = Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < count;
  if (!hasLast) return Math.floor(random() * count);
  const index = Math.floor(random() * (count - 1));
  return index >= lastIndex ? index + 1 : index;
}

// localStorage может быть недоступен (например, в приватном режиме),
// поэтому оборачиваем в try/catch — ошибка не должна ломать страницу
function readLastBackground() {
  try {
    const saved = localStorage.getItem("lastBackground");
    return saved === null ? null : Number(saved);
  } catch {
    return null;
  }
}

function saveLastBackground(index) {
  try {
    localStorage.setItem("lastBackground", String(index));
  } catch {
    // не страшно: просто в следующий раз фото может повториться
  }
}

function setupBackground() {
  const photo = document.getElementById("bg-photo");
  const index = pickBackgroundIndex(BACKGROUNDS.length, readLastBackground());
  const background = BACKGROUNDS[index];
  const url = `images/${background.file}`;
  saveLastBackground(index);

  // Сначала загружаем фото "за кадром", и только потом показываем —
  // так оно плавно проявится, а не будет рисоваться полосами
  const loader = new Image();
  loader.onload = () => {
    photo.style.backgroundImage = `url("${url}")`;
    photo.classList.add("is-loaded");
  };
  // Если фото не загрузилось — ничего не делаем: остаётся запасной градиент из CSS
  loader.src = url;
}

setupBackground();

/* ---------- 5в. КУРСЫ ВАЛЮТ (Национальный банк Польши, NBP) ----------
   Источник: официальный API NBP, таблица A (средние курсы к злотому).
   NBP публикует новую таблицу один раз в рабочий день, около полудня.
   Сайт загружает таблицу при открытии страницы и потом каждый час —
   так новый курс появляется автоматически в тот же день.
   Встроенных (выдуманных) значений нет: показываем только полученные данные.
   Последний удачный ответ и время его получения храним в localStorage,
   чтобы показать их, если NBP временно недоступен. */

const NBP_URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const RATES_REFRESH_MS = 60 * 60 * 1000; // 1 час
const RATES_STORAGE_KEY = "nbpRates";

// Чистая функция: из ответа NBP достаёт дату таблицы и курсы EUR и USD (в злотых).
// Если ответ не похож на ожидаемый — выбрасывает ошибку, а не показывает мусор.
function parseNbpTable(json) {
  const table = Array.isArray(json) ? json[0] : null;
  const rates = table && Array.isArray(table.rates) ? table.rates : [];
  const findMid = (code) => {
    const rate = rates.find((r) => r.code === code);
    return rate ? rate.mid : NaN;
  };
  const eur = findMid("EUR");
  const usd = findMid("USD");
  const dateOk = table && /^\d{4}-\d{2}-\d{2}$/.test(table.effectiveDate);

  if (!dateOk || !(eur > 0) || !(usd > 0)) {
    throw new Error("Неожиданный ответ NBP");
  }
  return { date: table.effectiveDate, eur, usd };
}

// Чистая функция: три соотношения, рассчитанные из курсов NBP.
// NBP даёт цену 1 евро и 1 доллара в злотых, поэтому:
//   1 EUR в злотых = курс евро из NBP
//   1 USD в злотых = курс доллара из NBP
//   1 USD в евро   = (злотых за 1 доллар) / (злотых за 1 евро)
function buildRateRows({ eur, usd }) {
  return [
    { from: "EUR", to: "PLN", value: eur },
    { from: "USD", to: "PLN", value: usd },
    { from: "USD", to: "EUR", value: usd / eur },
  ];
}

// Курс с 4 знаками после запятой — с такой точностью публикует NBP: "4,3925 zł"
function formatRate(value, currency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

// "2026-11-06" → "06.11.2026". timeZone UTC — чтобы дата не "съехала" на день
function formatRateDate(isoDate) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(isoDate));
}

// Время получения данных в часовом поясе посетителя: "07.11.2026, 23:31"
function formatUpdatedAt(isoTimestamp) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(isoTimestamp));
}

// Чистая функция: курсы годятся, только если в них есть всё нужное
function isValidRates(rates) {
  return Boolean(rates && rates.eur > 0 && rates.usd > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(rates.date)
    && !Number.isNaN(Date.parse(rates.fetchedAt)));
}

function readSavedRates() {
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_STORAGE_KEY));
    return isValidRates(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveRates(rates) {
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // не страшно: просто без запасной копии
  }
}

// Показывает курсы. rates = null — данных нет совсем.
// status: "live" — только что получены из NBP, "loading" — идёт обновление,
// "offline" — NBP недоступен, показана последняя сохранённая копия.
function renderRates(rates, status) {
  const list = document.getElementById("rates-list");
  const dateLabel = document.getElementById("rates-date");
  const updatedLabel = document.getElementById("rates-updated");
  list.replaceChildren();

  if (!rates) {
    const item = document.createElement("li");
    item.className = "rate";
    item.textContent = status === "loading"
      ? "Загрузка курсов…"
      : "Нет данных: NBP недоступен";
    list.append(item);
    dateLabel.textContent = status === "loading" ? "загрузка…" : "Повторим попытку через час";
    updatedLabel.textContent = "";
    return;
  }

  for (const row of buildRateRows(rates)) {
    const item = document.createElement("li");
    item.className = "rate";

    const code = document.createElement("span");
    code.className = "rate-code";
    code.textContent = `1 ${row.from} → ${row.to}`;

    const values = document.createElement("span");
    values.className = "rate-values";
    values.textContent = formatRate(row.value, row.to);

    item.append(code, values);
    list.append(item);
  }

  dateLabel.textContent = `Курс NBP от ${formatRateDate(rates.date)}`;
  const suffix = { live: "", loading: " · обновление…", offline: " · NBP недоступен" }[status];
  updatedLabel.textContent = `Обновлено: ${formatUpdatedAt(rates.fetchedAt)}${suffix}`;
  updatedLabel.title = status === "offline"
    ? "Показаны последние полученные курсы. Новая попытка — через час."
    : "Время последней успешной загрузки курсов";
}

// Загрузка JSON с ограничением по времени: нет ответа за 10 секунд — ошибка
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Код ответа ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Курсы ищем по очереди в трёх местах:
// 1. Напрямую в API NBP — самые свежие данные.
// 2. В файле rates.json рядом с сайтом. Его раз в рабочий день обновляет
//    автоматическая задача, которая сама берёт таблицу из API NBP.
//    Нужен там, где браузеру запрещено обращаться к NBP (например, на claude.ai).
// 3. В последней сохранённой копии — если не удалось ни то, ни другое.
async function loadRates() {
  try {
    const rates = { ...parseNbpTable(await fetchJson(NBP_URL)), fetchedAt: new Date().toISOString() };
    saveRates(rates);
    renderRates(rates, "live");
    return;
  } catch {
    // NBP недоступен — пробуем файл
  }

  const saved = readSavedRates();
  try {
    const file = await fetchJson("rates.json");
    if (!isValidRates(file)) throw new Error("Неверный rates.json");
    // Из файла и сохранённой копии берём ту, что получена позже
    const newest = saved && Date.parse(saved.fetchedAt) > Date.parse(file.fetchedAt) ? saved : file;
    saveRates(newest);
    renderRates(newest, "live");
    return;
  } catch {
    // файла нет или он испорчен
  }

  renderRates(saved, "offline");
}

// Пока идёт загрузка — показываем сохранённую копию (если она есть)
renderRates(readSavedRates(), "loading");
loadRates();
setInterval(loadRates, RATES_REFRESH_MS);

/* ---------- 6. ТЕСТЫ ----------
   Откройте консоль браузера (F12 → Console) и введите: runTests()
   Тесты проверяют только чистые функции, поэтому страницу они не меняют. */

function runTests() {
  const results = [];
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ "Тест": name, "Ожидалось": expected, "Получено": actual, "Итог": pass ? "✅" : "❌" });
  };

  const base = { days: 5, nights: 4, travelers: 2, accommodation: 120, food: 40, transport: 300, activities: 150 };

  // 1. Обычная поездка (исходные значения формы)
  const r1 = calculateBudget(base);
  check("Проживание: 120 × 4 ночи", r1.amounts.accommodation, 480);
  check("Еда: 40 × 5 дней × 2 чел.", r1.amounts.food, 400);
  check("Итого", r1.total, 1330);
  check("В день: 1330 / 5", r1.perDay, 266);
  check("На человека: 1330 / 2", r1.perPerson, 665);

  // 2. Сумма процентов = 100
  const sum = Object.values(r1.percentages).reduce((a, b) => a + b, 0);
  check("Сумма процентов = 100", Math.round(sum), 100);

  // 3. Деление на ноль: 0 дней и 0 путешественников
  const r3 = calculateBudget({ ...base, days: 0, travelers: 0 });
  check("0 дней → «в день» не считается", r3.perDay, null);
  check("0 человек → «на человека» не считается", r3.perPerson, null);

  // 4. Все расходы 0 → итог 0, проценты 0 (не NaN)
  const r4 = calculateBudget({ ...base, accommodation: 0, food: 0, transport: 0, activities: 0 });
  check("Нулевые расходы: итог", r4.total, 0);
  check("Нулевые расходы: проценты без NaN", r4.percentages.food, 0);

  // 5. Дроби: 0.1 + 0.2 должно быть ровно 0.3
  const r5 = calculateBudget({ days: 1, nights: 1, travelers: 1, accommodation: 0.1, food: 0, transport: 0.2, activities: 0 });
  check("Дроби: 0.1 + 0.2 = 0.3", r5.total, 0.3);

  // 6. 0 ночей (поездка на один день) → проживание 0
  check("0 ночей → проживание 0", calculateBudget({ ...base, nights: 0 }).amounts.accommodation, 0);

  // 7. Проверка ввода
  check("Пустая сумма → 0 без ошибки", validateValue("", FIELD_RULES.food), { value: 0, error: null });
  check("Отрицательная сумма → ошибка", validateValue("-5", FIELD_RULES.food).error !== null, true);
  check("Пустые дни → ошибка", validateValue("", FIELD_RULES.days).error !== null, true);
  check("2.5 человека → ошибка", validateValue("2.5", FIELD_RULES.travelers).error !== null, true);
  check("Слишком большое число → ошибка", validateValue("1e12", FIELD_RULES.transport).error !== null, true);
  check("«12.50» → 12.5", validateValue("12.50", FIELD_RULES.food), { value: 12.5, error: null });

  // 8. Форматирование валют (  — неразрывный пробел, его ставит Intl)
  check("Формат EUR", formatMoney(1330, "EUR"), "1 330,00 €");
  check("Формат USD", formatMoney(1330, "USD"), "1 330,00 $");
  check("Формат PLN", formatMoney(1330.5, "PLN"), "1 330,50 zł");
  check("Нет значения → «—»", formatMoney(null, "EUR"), "—");

  // 9. Окончания
  check("1 день", plural(1, { one: "день", few: "дня", many: "дней" }), "1 день");
  check("3 дня", plural(3, { one: "день", few: "дня", many: "дней" }), "3 дня");
  check("11 дней", plural(11, { one: "день", few: "дня", many: "дней" }), "11 дней");

  // 9б. Пустая форма (состояние после сброса)
  check("Все поля пустые → форма пустая", isFormBlank(["", "", "  "]), true);
  check("Есть хоть одно значение → не пустая", isFormBlank(["", "5", ""]), false);
  check("Ноль — это значение, а не пустота", isFormBlank(["0", ""]), false);

  // 10. Случайный фон: никогда не повторяет прошлое фото и не выходит за пределы
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
  check("Фон: первый визит (нет прошлого) — любое фото", pickBackgroundIndex(12, null, () => 0), 0);
  check("Фон: одно фото — всегда 0", pickBackgroundIndex(1, 0), 0);

  // 11. Курсы валют NBP
  const sampleNbp = [{ table: "A", effectiveDate: "2026-11-06", rates: [
    { code: "USD", mid: 3.9321 }, { code: "EUR", mid: 4.3925 }, { code: "GBP", mid: 5.1 },
  ] }];
  check("NBP: дата и курсы из ответа", parseNbpTable(sampleNbp), { date: "2026-11-06", eur: 4.3925, usd: 3.9321 });
  let badAnswerRejected = false;
  try { parseNbpTable([{ effectiveDate: "2026-11-06", rates: [] }]); } catch { badAnswerRejected = true; }
  check("NBP: ответ без курсов отклоняется", badAnswerRejected, true);
  const rows = buildRateRows({ eur: 4, usd: 2 });
  check("1 EUR → PLN = 4", rows[0].value, 4);
  check("1 USD → PLN = 2", rows[1].value, 2);
  check("1 USD → EUR = 2 / 4 = 0.5", rows[2].value, 0.5);
  check("Порядок строк: EUR→PLN, USD→PLN, USD→EUR", rows.map((r) => `${r.from}-${r.to}`).join(" "), "EUR-PLN USD-PLN USD-EUR");
  check("Формат курса: 4 знака", formatRate(4.3925, "PLN"), "4,3925 zł");
  check("Курсы: полный набор данных годится", isValidRates({ date: "2026-11-06", eur: 4.39, usd: 3.93, fetchedAt: "2026-11-07T11:00:00Z" }), true);
  check("Курсы: без времени получения не годятся", isValidRates({ date: "2026-11-06", eur: 4.39, usd: 3.93 }), false);
  check("Формат даты курса", formatRateDate("2026-11-06"), "06.11.2026");

  console.table(results);
  const failed = results.filter((r) => r["Итог"] === "❌").length;
  const summary = `${results.length - failed} из ${results.length} тестов пройдено`;
  console.log(failed === 0 ? `✅ ${summary}` : `❌ ${summary}`);
  return { total: results.length, failed };
}
