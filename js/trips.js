/* =========================================================
   TripBudget — trips.js
   Сохранённые поездки. Хранятся в localStorage — только в этом
   браузере, без сервера и регистрации. Чистые функции работают
   со списком, а чтение/запись в хранилище вынесены отдельно.
   ========================================================= */

const TRIPS_STORAGE_KEY = "tripbudget.trips.v1";
// destination — город, countryCode — код страны (ISO), остальные — числа формы
const TRIP_FIELDS = ["destination", "countryCode", ...Object.keys(FIELD_RULES)];

/* ---------- Чистые функции ---------- */

// Поездка годится, только если у неё правильная форма
function isValidTrip(trip) {
  return Boolean(trip && typeof trip.id === "string"
    && CURRENCIES.includes(trip.currency)
    && trip.fields && typeof trip.fields === "object"
    && !Number.isNaN(Date.parse(trip.updatedAt)));
}

// Новая поездка или обновлённая (если id уже есть в списке)
function upsertTrip(list, trip) {
  const index = list.findIndex((t) => t.id === trip.id);
  if (index === -1) return [trip, ...list];
  const copy = list.slice();
  copy[index] = trip;
  return copy;
}

function removeTrip(list, id) {
  return list.filter((t) => t.id !== id);
}

// Свежие изменения — сверху
function sortTrips(list) {
  return list.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

// Числа поездки из сохранённых строк (неверные значения → 0)
function tripNumbers(trip) {
  const values = {};
  for (const [id, rule] of Object.entries(FIELD_RULES)) {
    values[id] = validateValue(trip.fields[id] ?? "", rule).value;
  }
  return values;
}

// Название поездки: "Рим, Италия". Старые поездки (без страны) — просто город.
function tripName(fields) {
  return destinationLabel(fields.destination, fields.countryCode) || "Без названия";
}

function makeTripId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- Хранилище ---------- */

const TripStore = {
  // Доступно ли хранилище (в приватном режиме некоторых браузеров — нет)
  available() {
    try {
      const key = "__tripbudget_test__";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  load() {
    try {
      const data = JSON.parse(localStorage.getItem(TRIPS_STORAGE_KEY));
      return Array.isArray(data) ? sortTrips(data.filter(isValidTrip)) : [];
    } catch {
      return [];
    }
  },

  // true — сохранено, false — не удалось (нет места или хранилище недоступно)
  save(list) {
    try {
      localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  },
};
