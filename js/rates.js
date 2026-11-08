/* =========================================================
   TripBudget — rates.js
   Курсы валют Национального банка Польши (NBP), таблица A.
   NBP публикует таблицу раз в рабочий день, около полудня.
   Сайт загружает её при открытии страницы и потом каждый час.
   Выдуманных значений нет: если NBP недоступен, показываем последние
   полученные курсы (с временем их получения) или честное «нет данных».
   ========================================================= */

const NBP_URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const RATES_REFRESH_MS = 60 * 60 * 1000; // 1 час
const RATES_STORAGE_KEY = "nbpRates";

/* ---------- Чистые функции ---------- */

// Из ответа NBP достаёт дату таблицы и курсы EUR и USD (в злотых).
// Если ответ не похож на ожидаемый — ошибка, а не мусор на экране.
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

// Три соотношения для блока курсов, рассчитанные из таблицы NBP
function buildRateRows({ eur, usd }) {
  return [
    { from: "EUR", to: "PLN", value: eur },
    { from: "USD", to: "PLN", value: usd },
    { from: "USD", to: "EUR", value: usd / eur },
  ];
}

// Курс с 4 знаками после запятой — с такой точностью публикует NBP
function formatRate(value, currency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

// Курсы годятся, только если в них есть всё нужное
function isValidRates(rates) {
  return Boolean(rates && rates.eur > 0 && rates.usd > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(rates.date)
    && !Number.isNaN(Date.parse(rates.fetchedAt)));
}

/* ---------- Состояние и загрузка ---------- */

const Rates = {
  current: null,          // { date, eur, usd, fetchedAt } или null
  status: "loading",      // "loading" | "live" | "offline"
  listeners: [],

  // Подписка: калькулятор пересчитывает конвертацию, когда приходят курсы
  onChange(callback) {
    this.listeners.push(callback);
  },

  set(rates, status) {
    this.current = rates;
    this.status = status;
    renderRates(rates, status);
    for (const callback of this.listeners) callback(rates, status);
  },
};

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

// Загрузка с ограничением по времени: нет ответа за 10 секунд — ошибка
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

async function loadRates() {
  try {
    const rates = { ...parseNbpTable(await fetchJson(NBP_URL)), fetchedAt: new Date().toISOString() };
    saveRates(rates);
    Rates.set(rates, "live");
  } catch {
    Rates.set(readSavedRates(), "offline");
  }
}

/* ---------- Вывод на страницу ---------- */

function renderRates(rates, status) {
  const block = document.getElementById("rates");
  const list = document.getElementById("rates-list");
  const dateLabel = document.getElementById("rates-date");
  const updatedLabel = document.getElementById("rates-updated");
  if (!block) return;

  block.dataset.status = status;
  block.setAttribute("aria-busy", String(status === "loading"));
  list.replaceChildren();

  if (!rates) {
    if (status === "loading") {
      // Скелетон: серые "заглушки" на месте курсов, пока идёт загрузка
      for (let i = 0; i < 3; i++) {
        const item = document.createElement("li");
        item.className = "rate rate--skeleton";
        item.setAttribute("aria-hidden", "true");
        list.append(item);
      }
      dateLabel.textContent = "Загружаем курсы NBP…";
      updatedLabel.textContent = "";
    } else {
      const item = document.createElement("li");
      item.className = "rate rate--error";
      item.textContent = "Нет данных: NBP недоступен";
      list.append(item);
      dateLabel.textContent = "Повторим попытку через час";
      updatedLabel.textContent = "";
    }
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

  dateLabel.textContent = `Курс NBP от ${formatIsoDate(rates.date)}`;
  const suffix = { live: "", loading: " · обновление…", offline: " · NBP недоступен" }[status];
  updatedLabel.textContent = `Обновлено: ${formatDateTime(rates.fetchedAt)}${suffix}`;
  updatedLabel.title = status === "offline"
    ? "Показаны последние полученные курсы. Новая попытка — через час."
    : "Время последней успешной загрузки курсов";
}

function startRates() {
  // Пока идёт загрузка — показываем сохранённую копию (если она есть)
  Rates.set(readSavedRates(), "loading");
  loadRates();
  setInterval(loadRates, RATES_REFRESH_MS);
}
