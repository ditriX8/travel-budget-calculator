/* =========================================================
   TripBudget — core.js
   Чистые функции: расчёты, проверка ввода, форматирование.
   Они получают данные и возвращают результат, ничего не меняя
   на странице, поэтому их легко тестировать (см. js/tests.js).
   ========================================================= */

/* ---------- Настройки ---------- */

// Категории расходов: ключ, значок и название
const CATEGORIES = [
  { key: "accommodation", icon: "🏨", name: "Проживание" },
  { key: "food",          icon: "🍽️", name: "Еда" },
  { key: "transport",     icon: "🚆", name: "Транспорт" },
  { key: "activities",    icon: "🎟️", name: "Развлечения" },
];

const CURRENCIES = ["EUR", "USD", "PLN"];

// Разумный верхний предел, чтобы огромные числа не ломали вывод
const MAX_AMOUNT = 1_000_000_000;
const MAX_COUNT = 1000;

// Правила проверки для каждого числового поля формы
const FIELD_RULES = {
  days:          { label: "Дней в поездке",   min: 1, max: MAX_COUNT,  integer: true },
  nights:        { label: "Ночей проживания", min: 0, max: MAX_COUNT,  integer: true },
  travelers:     { label: "Путешественников", min: 1, max: MAX_COUNT,  integer: true },
  accommodation: { label: "Проживание",       min: 0, max: MAX_AMOUNT, integer: false },
  food:          { label: "Еда",              min: 0, max: MAX_AMOUNT, integer: false },
  transport:     { label: "Транспорт",        min: 0, max: MAX_AMOUNT, integer: false },
  activities:    { label: "Развлечения",      min: 0, max: MAX_AMOUNT, integer: false },
  limit:         { label: "Лимит бюджета",    min: 0, max: MAX_AMOUNT, integer: false },
};

/* ---------- Математика ---------- */

// Округление до центов. Компьютер хранит дроби неточно: 0.1 + 0.2 = 0.30000000000000004
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// Округление вверх до центов — для советов "сэкономьте не меньше X"
function ceilMoney(value) {
  return Math.ceil(Math.round(value * 1e6) / 1e4) / 100;
}

// Безопасное деление: делить не на что — null (а не Infinity или NaN)
function safeDivide(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) {
    return null;
  }
  return a / b;
}

// Проверяет одно значение из поля (приходит строкой) по правилу.
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
function isFormBlank(rawValues) {
  return rawValues.every((raw) => String(raw).trim() === "");
}

// Проценты, которые в сумме дают ровно 100.
// Обычное округление может дать 99% или 101% (33,3 + 33,3 + 33,3).
// Метод наибольшего остатка: округляем вниз, а недостающие проценты
// отдаём категориям с самыми большими дробными частями.
function splitPercentages(amounts, total) {
  const keys = Object.keys(amounts);
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  if (!(total > 0)) return result;

  const parts = keys.map((key) => {
    const exact = (amounts[key] / total) * 100;
    return { key, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let missing = 100 - parts.reduce((sum, p) => sum + p.floor, 0);
  parts
    .slice()
    .sort((a, b) => b.rest - a.rest)
    .forEach((p) => {
      if (missing > 0 && p.rest > 0) {
        p.floor += 1;
        missing -= 1;
      }
    });
  for (const p of parts) result[p.key] = p.floor;
  return result;
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

  // Точные доли — для длины полосок, целые проценты — для подписей
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
    labels: splitPercentages(amounts, total),
  };
}

/* ---------- Лимит бюджета и советы ---------- */

// Состояние лимита: null — лимит не задан
function limitStatus(total, limit) {
  if (!(limit > 0)) return null;
  return {
    limit,
    usedPercent: (total / limit) * 100,
    remaining: roundMoney(limit - total),
    over: total > limit,
  };
}

// Советы, где сэкономить, если бюджет превышен.
// Каждый совет — конкретное действие, которое одно покрывает превышение.
function buildSuggestions(values, result, limit, currency) {
  const over = roundMoney(result.total - limit);
  if (!(limit > 0) || !(over > 0)) return [];

  const money = (v) => formatMoney(v, currency);
  const tips = [];
  const byAmount = CATEGORIES
    .map((c) => ({ ...c, amount: result.amounts[c.key] }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  for (const category of byAmount) {
    if (category.key === "accommodation" && values.nights > 0) {
      const cutPerNight = ceilMoney(over / values.nights);
      if (cutPerNight < values.accommodation) {
        tips.push(`${category.icon} Жильё дешевле на ${money(cutPerNight)} за ночь: ` +
          `${money(roundMoney(values.accommodation - cutPerNight))} вместо ${money(values.accommodation)}.`);
      } else {
        const fewerNights = Math.ceil(over / values.accommodation);
        if (fewerNights < values.nights) {
          tips.push(`${category.icon} На ${plural(fewerNights, NIGHT_FORMS)} меньше в отеле — ` +
            `экономия ${money(roundMoney(fewerNights * values.accommodation))}.`);
        }
      }
    }
    if (category.key === "food" && values.days > 0 && values.travelers > 0) {
      const cutPerDay = ceilMoney(over / (values.days * values.travelers));
      if (cutPerDay < values.food) {
        tips.push(`${category.icon} Расходы на еду меньше на ${money(cutPerDay)} в день на человека: ` +
          `${money(roundMoney(values.food - cutPerDay))} вместо ${money(values.food)}.`);
      }
    }
    if (category.key === "transport" && category.amount >= over) {
      tips.push(`${category.icon} Билеты дешевле на ${money(over)}: попробуйте другие даты или пересадки.`);
    }
    if (category.key === "activities" && category.amount >= over) {
      tips.push(`${category.icon} Развлечения на ${money(over)} меньше: выберите самые важные или бесплатные.`);
    }
  }

  // Не больше двух советов по категориям — самые крупные статьи расходов
  const chosen = tips.slice(0, 2);

  // Поездка на день короче: меньше еды и (если есть) одна ночь в отеле
  if (values.days > 1) {
    const dayCost = values.food * values.travelers + (values.nights > 0 ? values.accommodation : 0);
    if (dayCost > 0) {
      chosen.push(`🗓️ Поездка на 1 день короче — экономия ${money(roundMoney(dayCost))}.`);
    }
  }

  chosen.push(`🎯 Или увеличьте лимит до ${money(result.total)}.`);
  return chosen;
}

/* ---------- Валюты ---------- */

// Перевод суммы из одной валюты в другую через злотый.
// rates — курсы NBP: сколько злотых стоит 1 EUR и 1 USD.
function convertAmount(amount, from, to, rates) {
  if (!rates || !(rates.eur > 0) || !(rates.usd > 0)) return null;
  const plnPerUnit = { PLN: 1, EUR: rates.eur, USD: rates.usd };
  if (!plnPerUnit[from] || !plnPerUnit[to]) return null;
  return roundMoney((amount * plnPerUnit[from]) / plnPerUnit[to]);
}

/* ---------- Форматирование ---------- */

// Деньги: "1 330,00 €". narrowSymbol — короткий символ: "zł" вместо "PLN".
function formatMoney(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(value);
}

// Русские окончания: 1 день, 2 дня, 5 дней
const pluralRules = new Intl.PluralRules("ru-RU");
const DAY_FORMS = { one: "день", few: "дня", many: "дней" };
const NIGHT_FORMS = { one: "ночь", few: "ночи", many: "ночей" };
const PERSON_FORMS = { one: "путешественник", few: "путешественника", many: "путешественников" };

function plural(count, forms) {
  return `${count} ${forms[pluralRules.select(count)] || forms.many}`;
}

// Дата и время в часовом поясе посетителя: "08.11.2026, 12:30"
function formatDateTime(isoTimestamp) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(isoTimestamp));
}

// Только дата: "2026-11-06" → "06.11.2026". timeZone UTC — чтобы дата не "съехала"
function formatIsoDate(isoDate) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(isoDate));
}
