/* =========================================================
   TripBudget — app.js
   Работа со страницей: форма, результаты, сохранённые поездки,
   уведомления, печать в PDF и фон. Расчёты — в core.js,
   курсы — в rates.js, хранилище поездок — в trips.js.
   ========================================================= */

const form = document.getElementById("budget-form");
const $ = (id) => document.getElementById(id);
const el = {
  destination: $("destination"),   // скрытое поле: выбранный город
  countryCode: $("countryCode"),   // скрытое поле: код выбранной страны
  destTrigger: $("dest-trigger"),  // само поле «Куда едете?»
  currency: $("currency"),
  message: $("form-message"),
  summary: $("trip-summary"),
  total: $("total"),
  converted: $("total-converted"),
  totalBox: $("total-box"),
  perDay: $("per-day"),
  perPerson: $("per-person"),
  breakdown: $("breakdown"),
  limit: $("limit-status"),
  limitTitle: $("limit-title"),
  limitNumbers: $("limit-numbers"),
  limitFill: $("limit-fill"),
  limitTips: $("limit-tips"),
  results: $("results"),
  srStatus: $("sr-status"),
  saveBtn: $("save-trip"),
  editBanner: $("edit-banner"),
  editName: $("edit-name"),
  tripsList: $("trips-list"),
  tripsEmpty: $("trips-empty"),
  tripsCount: $("trips-count"),
  toasts: $("toasts"),
  printReport: $("print-report"),
};
const numberInputs = Object.keys(FIELD_RULES).map((id) => $(id));

const state = {
  touched: new Set(), // поля, которые человек уже трогал
  editingId: null,    // id открытой сохранённой поездки
  trips: [],
  last: null,         // последний расчёт: { data, result }
};

/* =========================================================
   1. ФОРМА И РАСЧЁТ
   ========================================================= */

// Читаем поля, проверяем и подсвечиваем ошибки.
// showAllErrors = true — показать и ошибки нетронутых пустых полей.
function readForm(showAllErrors = false) {
  const values = {};
  const errors = [];

  for (const [id, rule] of Object.entries(FIELD_RULES)) {
    const input = $(id);
    // Недописанный ввод ("5-", "1e") браузер отдаёт как пустую строку —
    // отличить его можно только через validity.badInput
    let { value, error } = input.validity.badInput
      ? { value: 0, error: `«${rule.label}»: введите число.` }
      : validateValue(input.value, rule);

    const untouchedEmpty = input.value.trim() === "" && !input.validity.badInput
      && !state.touched.has(id) && !showAllErrors;
    if (untouchedEmpty) error = null;

    values[id] = value;
    input.classList.toggle("is-invalid", error !== null);
    input.setAttribute("aria-invalid", String(error !== null));
    if (error) errors.push(error);
  }

  if (values.nights > values.days && values.days > 0) {
    errors.push("Ночей больше, чем дней в поездке — проверьте значения.");
  }

  return {
    destination: destinationLabel(el.destination.value, el.countryCode.value),
    currency: el.currency.value,
    values,
    errors,
  };
}

function isBlank() {
  return isFormBlank([el.countryCode.value, el.destination.value, ...numberInputs.map((i) => i.value)])
    && !numberInputs.some((i) => i.validity.badInput);
}

// Прочитать → посчитать → показать. Возвращает список ошибок.
function update(showAllErrors = false) {
  if (isBlank() && !showAllErrors) {
    showEmptyState();
    return [];
  }

  const data = readForm(showAllErrors);
  const result = calculateBudget(data.values);
  state.last = { data, result };

  el.summary.textContent = tripSummary(data.destination, data.values);
  el.total.textContent = formatMoney(result.total, data.currency);
  el.perDay.textContent = formatMoney(result.perDay, data.currency);
  el.perPerson.textContent = formatMoney(result.perPerson, data.currency);
  renderConversion();
  renderLimit(data, result);
  renderBreakdown(result, data.currency);
  el.message.textContent = data.errors.join(" ");
  return data.errors;
}

function tripSummary(destination, values) {
  const parts = [destination || "Направление не указано"];
  if (values.days > 0) parts.push(plural(values.days, DAY_FORMS));
  if (values.nights > 0) parts.push(plural(values.nights, NIGHT_FORMS));
  if (values.travelers > 0) parts.push(plural(values.travelers, PERSON_FORMS));
  return parts.join(" · ");
}

function showEmptyState() {
  state.last = null;
  el.summary.textContent = "Заполните данные поездки";
  el.total.textContent = "—";
  el.converted.textContent = "—";
  el.perDay.textContent = "—";
  el.perPerson.textContent = "—";
  el.breakdown.replaceChildren();
  el.limit.hidden = true;
  el.message.textContent = "";
  for (const input of form.querySelectorAll(".is-invalid")) {
    input.classList.remove("is-invalid");
    input.setAttribute("aria-invalid", "false");
  }
}

// Итог в двух других валютах по курсу NBP
function renderConversion() {
  if (!state.last) {
    el.converted.textContent = "—";
    return;
  }
  const { currency } = state.last.data;
  const { total } = state.last.result;
  const rates = Rates.current;

  if (!rates) {
    el.converted.textContent = Rates.status === "loading" ? "Загружаем курсы…" : "Курсы NBP недоступны";
    el.converted.title = "";
    return;
  }
  el.converted.textContent = CURRENCIES
    .filter((c) => c !== currency)
    .map((c) => `≈ ${formatMoney(convertAmount(total, currency, c, rates), c)}`)
    .join("   ");
  el.converted.title = `По курсу NBP от ${formatIsoDate(rates.date)}`;
}

function renderLimit(data, result) {
  const status = limitStatus(result.total, data.values.limit);
  el.limit.hidden = status === null;
  if (!status) return;

  const money = (v) => formatMoney(v, data.currency);
  el.limit.dataset.state = status.over ? "over" : "ok";
  el.limitTitle.textContent = status.over ? "Бюджет превышен" : "В рамках бюджета";
  el.limitNumbers.textContent = `${money(result.total)} из ${money(status.limit)}`;
  el.limitFill.style.width = `${Math.min(status.usedPercent, 100)}%`;

  el.limitTips.replaceChildren();
  const addTip = (text, className) => {
    const li = document.createElement("li");
    li.textContent = text;
    if (className) li.className = className;
    el.limitTips.append(li);
  };

  if (status.over) {
    addTip(`Превышение на ${money(-status.remaining)}. Что поможет уложиться:`, "limit-lead");
    for (const tip of buildSuggestions(data.values, result, status.limit, data.currency)) addTip(tip);
  } else {
    const free = Math.max(0, 100 - Math.round(status.usedPercent));
    addTip(`Остаётся ${money(status.remaining)} — ${free}% лимита свободно.`, "limit-lead");
  }
}

function renderBreakdown(result, currency) {
  el.breakdown.replaceChildren();
  if (!(result.total > 0)) return; // пустой список — CSS покажет подсказку

  for (const category of CATEGORIES) {
    const item = document.createElement("li");
    item.className = "breakdown-item";

    const head = document.createElement("div");
    head.className = "breakdown-head";
    const name = document.createElement("span");
    name.className = "breakdown-name";
    name.textContent = `${category.icon} ${category.name}`;
    const amount = document.createElement("span");
    amount.className = "breakdown-amount";
    amount.textContent = `${formatMoney(result.amounts[category.key], currency)} `;
    const percent = document.createElement("small");
    percent.textContent = `${result.labels[category.key]}%`;
    amount.append(percent);
    head.append(name, amount);

    const bar = document.createElement("div");
    bar.className = "breakdown-bar";
    const fill = document.createElement("div");
    fill.className = `breakdown-fill breakdown-fill--${category.key}`;
    fill.style.width = `${result.percentages[category.key]}%`;
    bar.append(fill);

    item.append(head, bar);
    el.breakdown.append(item);
  }
}

// Очистить форму (кнопки «Сбросить» и «Новый расчёт»).
// Валюта остаётся выбранной: «пустой» валюты не бывает.
function clearForm() {
  for (const input of form.querySelectorAll("input")) input.value = "";
  state.touched.clear();
  setEditing(null);
  destinationPicker.refresh();
  update();
}

/* =========================================================
   2. СОХРАНЁННЫЕ ПОЕЗДКИ
   ========================================================= */

function setEditing(trip) {
  state.editingId = trip ? trip.id : null;
  el.editBanner.hidden = !trip;
  el.editName.textContent = trip ? tripName(trip.fields) : "";
  el.saveBtn.textContent = trip ? "Сохранить изменения" : "Сохранить поездку";
  for (const card of el.tripsList.children) {
    card.classList.toggle("is-active", card.dataset.id === state.editingId);
  }
}

function persistTrips(list) {
  if (!TripStore.save(list)) {
    showToast("Не удалось сохранить: хранилище браузера недоступно или заполнено.", { type: "error" });
    return false;
  }
  state.trips = sortTrips(list);
  renderTrips();
  return true;
}

function saveCurrentTrip() {
  const errors = update(true);
  if (isBlank() || !state.last || !(state.last.result.total > 0)) {
    showToast("Заполните данные поездки, чтобы её сохранить.", { type: "error" });
    return;
  }
  if (errors.length > 0) {
    showToast("Исправьте ошибки в форме перед сохранением.", { type: "error" });
    form.querySelector(".is-invalid")?.focus();
    return;
  }

  const now = new Date().toISOString();
  const existing = state.trips.find((t) => t.id === state.editingId);
  const fields = {};
  for (const id of TRIP_FIELDS) fields[id] = $(id).value.trim();

  const trip = {
    id: existing ? existing.id : makeTripId(),
    currency: el.currency.value,
    fields,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  if (persistTrips(upsertTrip(state.trips, trip))) {
    setEditing(trip);
    const name = tripName(fields);
    showToast(existing ? `Изменения в «${name}» сохранены.` : `Поездка «${name}» сохранена.`, { type: "success" });
  }
}

function openTrip(id) {
  const trip = state.trips.find((t) => t.id === id);
  if (!trip) return;
  for (const fieldId of TRIP_FIELDS) $(fieldId).value = trip.fields[fieldId] ?? "";
  el.currency.value = trip.currency;
  destinationPicker.refresh();
  state.touched.clear();
  setEditing(trip);
  update();
  $("calculator").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  el.destTrigger.focus({ preventScroll: true });
}

function deleteTrip(id) {
  const trip = state.trips.find((t) => t.id === id);
  if (!trip) return;
  const previous = state.trips;
  if (!persistTrips(removeTrip(state.trips, id))) return;
  if (state.editingId === id) setEditing(null);

  const name = tripName(trip.fields);
  showToast(`Поездка «${name}» удалена.`, {
    action: {
      label: "Отменить",
      onClick: () => {
        if (persistTrips(previous)) showToast(`Поездка «${name}» восстановлена.`, { type: "success" });
      },
    },
  });
}

function renderTrips() {
  const list = state.trips;
  el.tripsList.replaceChildren();
  el.tripsCount.hidden = list.length === 0;
  el.tripsCount.textContent = String(list.length);

  if (!TripStore.available()) {
    el.tripsEmpty.hidden = false;
    el.tripsEmpty.querySelector("p strong").textContent = "Сохранение недоступно в этом браузере.";
    el.tripsEmpty.querySelectorAll("p")[1].textContent =
      "Например, в приватном режиме. Калькулятор при этом работает полностью.";
    el.saveBtn.disabled = true;
    return;
  }
  el.tripsEmpty.hidden = list.length > 0;

  for (const trip of list) {
    const values = tripNumbers(trip);
    const result = calculateBudget(values);
    const status = limitStatus(result.total, values.limit);
    const name = tripName(trip.fields);

    const card = document.createElement("li");
    card.className = "trip-card";
    card.dataset.id = trip.id;
    card.classList.toggle("is-active", trip.id === state.editingId);

    const title = document.createElement("h3");
    title.className = "trip-name";
    title.textContent = name;

    const meta = document.createElement("p");
    meta.className = "trip-meta";
    meta.textContent = [
      values.days > 0 ? plural(values.days, DAY_FORMS) : null,
      values.nights > 0 ? plural(values.nights, NIGHT_FORMS) : null,
      values.travelers > 0 ? `${values.travelers} чел.` : null,
    ].filter(Boolean).join(" · ");

    const total = document.createElement("p");
    total.className = "trip-total";
    total.textContent = formatMoney(result.total, trip.currency);

    const footer = document.createElement("div");
    footer.className = "trip-footer";
    const updated = document.createElement("span");
    updated.className = "trip-updated";
    updated.textContent = `Изменено ${formatDateTime(trip.updatedAt)}`;
    footer.append(updated);
    if (status) {
      const badge = document.createElement("span");
      badge.className = `trip-badge trip-badge--${status.over ? "over" : "ok"}`;
      badge.textContent = status.over ? "Сверх лимита" : "В лимите";
      footer.append(badge);
    }

    const actions = document.createElement("div");
    actions.className = "trip-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn btn-small btn-secondary";
    openBtn.dataset.action = "open";
    openBtn.textContent = "Открыть";
    openBtn.setAttribute("aria-label", `Открыть поездку «${name}»`);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-small btn-danger-ghost";
    deleteBtn.dataset.action = "delete";
    deleteBtn.textContent = "Удалить";
    deleteBtn.setAttribute("aria-label", `Удалить поездку «${name}»`);
    actions.append(openBtn, deleteBtn);

    card.append(title, meta, total, footer, actions);
    el.tripsList.append(card);
  }
}

/* =========================================================
   3. УВЕДОМЛЕНИЯ
   ========================================================= */

function showToast(message, { type = "info", action = null, timeout = 6000 } = {}) {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);

  const close = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  };

  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.onClick();
      close();
    });
    toast.append(button);
  }

  el.toasts.append(toast);
  while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
  setTimeout(close, timeout);
}

/* =========================================================
   4. ОТЧЁТ ДЛЯ ПЕЧАТИ / PDF
   В браузере «Печать» → «Сохранить как PDF». Отчёт собирается
   отдельным чистым блоком, а остальная страница при печати скрыта.
   ========================================================= */

function buildPrintReport() {
  const report = el.printReport;
  report.replaceChildren();
  if (!state.last) return;

  const { data, result } = state.last;
  const money = (v) => formatMoney(v, data.currency);
  const v = data.values;
  const add = (parent, tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };

  const header = add(report, "header", undefined, "pr-header");
  add(header, "p", "TripBudget · бюджет поездки", "pr-brand");
  add(header, "h1", data.destination || "Поездка");
  add(header, "p", tripSummary(data.destination, v).split(" · ").slice(1).join(" · "), "pr-sub");

  const table = add(report, "table", undefined, "pr-table");
  const head = add(add(table, "thead"), "tr");
  for (const title of ["Категория", "Расчёт", "Сумма", "Доля"]) add(head, "th", title);
  const body = add(table, "tbody");
  const details = {
    accommodation: `${money(v.accommodation)} × ${plural(v.nights, NIGHT_FORMS)}`,
    food: `${money(v.food)} × ${plural(v.days, DAY_FORMS)} × ${v.travelers} чел.`,
    transport: "общая сумма",
    activities: "общая сумма",
  };
  for (const category of CATEGORIES) {
    const row = add(body, "tr");
    add(row, "td", `${category.icon} ${category.name}`);
    add(row, "td", details[category.key]);
    add(row, "td", money(result.amounts[category.key]));
    add(row, "td", `${result.labels[category.key]}%`);
  }
  const foot = add(add(table, "tfoot"), "tr");
  add(foot, "td", "Итого");
  add(foot, "td", "");
  add(foot, "td", money(result.total));
  add(foot, "td", "100%");

  const facts = add(report, "dl", undefined, "pr-facts");
  const fact = (term, value) => {
    add(facts, "dt", term);
    add(facts, "dd", value);
  };
  fact("В день", money(result.perDay));
  fact("На человека", money(result.perPerson));
  if (Rates.current) {
    fact("В других валютах", CURRENCIES.filter((c) => c !== data.currency)
      .map((c) => formatMoney(convertAmount(result.total, data.currency, c, Rates.current), c)).join(" · "));
  }

  const status = limitStatus(result.total, v.limit);
  if (status) {
    fact("Лимит", `${money(status.limit)} — ${status.over
      ? `превышение на ${money(-status.remaining)}` : `остаётся ${money(status.remaining)}`}`);
    const tips = buildSuggestions(v, result, status.limit, data.currency);
    if (tips.length) {
      add(report, "h2", "Где можно сэкономить");
      const ul = add(report, "ul", undefined, "pr-tips");
      for (const tip of tips) add(ul, "li", tip);
    }
  }

  const rateNote = Rates.current
    ? `Курсы: NBP, таблица A от ${formatIsoDate(Rates.current.date)}. `
    : "";
  add(report, "p", `${rateNote}Отчёт создан ${formatDateTime(new Date().toISOString())} · ditrix8.github.io/travel-budget-calculator`, "pr-note");
}

function printBudget() {
  const errors = update(true);
  if (isBlank() || !state.last || !(state.last.result.total > 0)) {
    showToast("Заполните данные поездки, чтобы получить PDF.", { type: "error" });
    return;
  }
  if (errors.length > 0) {
    showToast("Исправьте ошибки в форме перед созданием PDF.", { type: "error" });
    return;
  }
  window.print();
}

/* =========================================================
   5. СЛУЧАЙНЫЙ ФОН
   ========================================================= */

const BACKGROUNDS = [
  "mountains-clouds", "beach-sunset", "golden-valley", "forest-path",
  "mountain-lake", "ocean-waves", "green-hills", "lake-boat",
  "starry-mountains", "canyon-road", "lake-pier", "alpine-valley",
];

// Случайный номер от 0 до count-1, но не равный прошлому
function pickBackgroundIndex(count, lastIndex, random = Math.random) {
  if (count <= 1) return 0;
  const hasLast = Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < count;
  if (!hasLast) return Math.floor(random() * count);
  const index = Math.floor(random() * (count - 1));
  return index >= lastIndex ? index + 1 : index;
}

function setupBackground() {
  let last = null;
  try {
    const saved = localStorage.getItem("lastBackground");
    last = saved === null ? null : Number(saved);
  } catch { /* хранилище недоступно — не страшно */ }

  const index = pickBackgroundIndex(BACKGROUNDS.length, last);
  try { localStorage.setItem("lastBackground", String(index)); } catch { /* не страшно */ }

  // Телефону — лёгкая версия фото, компьютеру — крупная
  const width = window.matchMedia("(max-width: 900px)").matches ? 960 : 1600;
  const url = `assets/img/bg/${BACKGROUNDS[index]}-${width}.webp`;
  const photo = $("bg-photo");
  const loader = new Image();
  loader.onload = () => {
    photo.style.backgroundImage = `url("${url}")`;
    photo.classList.add("is-loaded");
  };
  // Если фото не загрузилось — остаётся запасной градиент из CSS
  loader.src = url;
}

/* =========================================================
   5б. «КУДА ЕДЕТЕ?» — ВЫБОР СТРАНЫ И ГОРОДА
   Окно в два шага — в destination.js, данные — в places.js.
   ========================================================= */

const destinationPicker = createDestinationPicker({
  root: $("dest"),
  onChange() {
    state.touched.add("destination");
    update();
  },
});

/* =========================================================
   6. СОБЫТИЯ И ЗАПУСК
   ========================================================= */

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

form.addEventListener("input", (event) => {
  // Строки поиска стран и городов на расчёт не влияют
  if (event.target.closest("#dest")) return;
  if (event.target.id) state.touched.add(event.target.id);
  update();
});

// Сброс: отменяем стандартный возврат к примеру из HTML и очищаем поля
form.addEventListener("reset", (event) => {
  event.preventDefault();
  clearForm();
});

// «Рассчитать бюджет» и Enter: считаем вместо перезагрузки страницы
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const errors = update(true);

  if (errors.length > 0) {
    form.querySelector(".is-invalid")?.focus();
    return;
  }
  if (state.last) {
    el.srStatus.textContent = `Итого ${el.total.textContent}, в день ${el.perDay.textContent}, на человека ${el.perPerson.textContent}.`;
  }
  if (window.matchMedia("(max-width: 900px)").matches) {
    el.results.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
  // Повторный запуск анимации: убрать класс, дать браузеру это заметить, добавить снова
  el.totalBox.classList.remove("is-updated");
  void el.totalBox.offsetWidth;
  el.totalBox.classList.add("is-updated");
});

$("new-calc").addEventListener("click", () => {
  clearForm();
  el.destTrigger.focus();
});
el.saveBtn.addEventListener("click", saveCurrentTrip);
$("print-btn").addEventListener("click", printBudget);
window.addEventListener("beforeprint", buildPrintReport);

// Кнопки в карточках поездок (один обработчик на весь список)
el.tripsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest(".trip-card").dataset.id;
  if (button.dataset.action === "open") openTrip(id);
  if (button.dataset.action === "delete") deleteTrip(id);
});

// Когда приходят курсы — обновляем конвертацию итога
Rates.onChange(() => renderConversion());

state.trips = TripStore.load();
renderTrips();
destinationPicker.refresh();
update();
setupBackground();
startRates();
