/* =========================================================
   TripBudget — destination.js
   Поле «Куда едете?»: окно выбора направления в два шага.
     Шаг 1 — страна: поиск, популярные направления, затем все страны.
     Шаг 2 — город: свой поиск, популярные города, кнопка «← Страны».
     Выбрать можно только реальный город из списка (places.js) — свой текст не принимается.
   Результат показывается в поле как «Италия, Рим» и хранится
   в скрытых полях countryCode и destination (город).

   Клавиатура: в строке поиска ↑/↓ — выбор, Enter — подтвердить,
   Escape — закрыть. Клик вне окна тоже закрывает его.
   Данные стран и городов — в places.js.
   ========================================================= */

/* ---------- Список с поиском (используется на обоих шагах) ---------- */

let listIdCounter = 0;

function createSearchList({ input, list, getGroups, onPick }) {
  const prefix = `${list.id || "list"}-${++listIdCounter}`;
  let items = [];
  let active = -1;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", list.id);

  function render() {
    const { groups, empty, selected } = getGroups(input.value);
    list.replaceChildren();
    items = [];

    for (const group of groups) {
      if (!group.items.length) continue;
      if (group.label) {
        const header = document.createElement("li");
        header.className = "dest-group";
        header.setAttribute("role", "presentation");
        header.textContent = group.label;
        list.append(header);
      }
      for (const item of group.items) {
        const index = items.length;
        const li = document.createElement("li");
        li.id = `${prefix}-opt-${index}`;
        li.className = "dest-option";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        if (item.value === selected) li.classList.add("is-current");

        const label = document.createElement("span");
        label.className = "dest-option-label";
        label.textContent = item.label;
        li.append(label);
        if (item.hint) {
          const hint = document.createElement("span");
          hint.className = "dest-option-hint";
          hint.textContent = item.hint;
          li.append(hint);
        }
        if (item.value === selected) {
          const mark = document.createElement("span");
          mark.className = "dest-check";
          mark.setAttribute("aria-hidden", "true");
          mark.textContent = "✓";
          li.append(mark);
        }

        // mousedown + preventDefault: фокус остаётся в строке поиска
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", () => onPick(item));
        li.addEventListener("mousemove", () => setActive(index, false));
        list.append(li);
        items.push(item);
      }
    }

    if (!items.length) {
      // Сообщение — "неактивный вариант": программы чтения экрана его прочитают
      const li = document.createElement("li");
      li.className = "dest-empty";
      li.setAttribute("role", "option");
      li.setAttribute("aria-disabled", "true");
      li.setAttribute("aria-selected", "false");
      li.textContent = empty;
      list.append(li);
    }

    // Подсветка: при поиске — первый вариант, без поиска — уже выбранный
    const selectedIndex = items.findIndex((it) => it.value === selected);
    if (input.value.trim()) setActive(items.length ? 0 : -1);
    else setActive(selectedIndex, true, "center");
  }

  function setActive(index, scroll = true, block = "nearest") {
    const options = list.querySelectorAll(".dest-option");
    options.forEach((li, i) => {
      li.classList.toggle("is-active", i === index);
      li.setAttribute("aria-selected", String(i === index));
    });
    active = index;
    if (index >= 0 && options[index]) {
      input.setAttribute("aria-activedescendant", options[index].id);
      if (scroll) options[index].scrollIntoView({ block });
    } else {
      input.removeAttribute("aria-activedescendant");
      if (scroll) list.scrollTop = 0;
    }
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : items.length - 1) : (active + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter в поиске никогда не отправляет форму
      if (active >= 0 && items[active]) onPick(items[active]);
    }
  });

  return {
    render,
    reset() {
      input.value = "";
      render();
    },
  };
}

/* ---------- Окно выбора направления ---------- */

function createDestinationPicker({ root, onChange }) {
  const q = (sel) => root.querySelector(sel);
  const trigger = q("#dest-trigger");
  const display = q("#dest-display");
  const panel = q("#dest-panel");
  const codeInput = q("#countryCode");
  const cityInput = q("#destination");
  const steps = {
    country: q('[data-step="country"]'),
    city: q('[data-step="city"]'),
  };
  const countrySearch = q("#country-search");
  const citySearch = q("#city-search");
  const cityTitle = q("#dest-city-title");
  const backBtn = q("#dest-back");
  const skipBtn = q("#dest-skip-city");

  let isOpen = false;
  let step = "country";

  const countries = createSearchList({
    input: countrySearch,
    list: q("#country-list"),
    getGroups(query) {
      const result = searchCountries(query);
      const toItem = (c) => ({ value: c.code, label: c.name });
      if (result.popular) {
        return {
          selected: codeInput.value,
          empty: "",
          groups: [
            { label: "Популярные направления", items: result.popular.map(toItem) },
            { label: "Все страны", items: result.others.map(toItem) },
          ],
        };
      }
      return {
        selected: codeInput.value,
        empty: `Страна «${query.trim()}» не найдена. Проверьте название — можно по-русски или по-английски.`,
        groups: [{
          label: null,
          items: result.matches.map((m) => ({
            ...toItem(m.country),
            city: m.via, // нашли по названию города: «рим» → Италия
            hint: m.via ? `город ${m.via}` : "",
          })),
        }],
      };
    },
    onPick(item) {
      const changed = item.value !== codeInput.value;
      codeInput.value = item.value;
      if (changed) cityInput.value = ""; // новая страна — прежний город сбрасывается
      if (item.city) {
        // Выбрали страну через город — направление готово
        cityInput.value = item.city;
        commit();
        close(true);
        return;
      }
      commit();
      showStep("city");
    },
  });

  const cities = createSearchList({
    input: citySearch,
    list: q("#city-list"),
    getGroups(query) {
      // Выбрать можно только реальный город из списка — свой текст не принимается
      const code = codeInput.value;
      const all = CITIES[code] || [];
      const text = query.trim();
      const matches = text ? searchCities(code, text) : all;
      let empty;
      if (!all.length) {
        empty = "Для этой страны пока нет списка городов. Нажмите «Без города — только страна» ниже.";
      } else {
        empty = `Город «${text}» не найден в списке. Проверьте название или выберите город из списка.`;
      }
      return {
        selected: cityInput.value,
        empty,
        groups: [{
          label: all.length && !text ? "Популярные города" : null,
          items: matches.map((c) => ({ value: c, label: c })),
        }],
      };
    },
    onPick(item) {
      cityInput.value = item.value;
      commit();
      close(true);
    },
  });

  function showStep(name) {
    step = name;
    steps.country.hidden = name !== "country";
    steps.city.hidden = name !== "city";
    if (name === "country") {
      countries.reset();
      countrySearch.focus({ preventScroll: true });
    } else {
      cityTitle.textContent = countryName(codeInput.value);
      cities.reset();
      citySearch.focus({ preventScroll: true });
    }
  }

  // Высота окна — сколько помещается на экране (на телефоне учитываем клавиатуру)
  function position() {
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const below = viewport - rect.bottom - 12;
    const above = rect.top - 12 - 64; // 64 — высота шапки сайта
    const openUp = below < 300 && above > below;
    root.classList.toggle("is-above", openUp);
    panel.style.maxHeight = `${Math.max(260, Math.min(480, openUp ? above : below))}px`;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    // Есть страна — сразу к городам (страну можно сменить кнопкой «← Страны»)
    showStep(codeInput.value ? "city" : "country");

    // Под полем мало места (телефон или поле внизу экрана) — поднимаем поле
    // вместе с подписью к верху экрана, под шапку сайта, чтобы окну хватило места.
    // Считаем точно: высота шапки + небольшой отступ.
    const viewport = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const spaceBelow = viewport - trigger.getBoundingClientRect().bottom;
    if (window.matchMedia("(max-width: 600px)").matches || spaceBelow < 420) {
      const header = document.querySelector(".site-header");
      const offset = (header ? header.offsetHeight : 0) + 8;
      const top = root.closest(".field").getBoundingClientRect().top + window.scrollY - offset;
      root.classList.remove("is-above");
      panel.style.maxHeight = "480px";
      window.scrollTo({ top, behavior: "smooth" });
      setTimeout(() => isOpen && position(), 450); // размер — когда прокрутка закончится
    } else {
      position();
    }
  }

  function close(focusTrigger = false) {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    if (focusTrigger) trigger.focus({ preventScroll: true });
  }

  // Показать выбранное направление в поле: «Италия, Рим»
  function updateDisplay() {
    const label = destinationLabel(cityInput.value, codeInput.value);
    display.textContent = label || "Выберите страну и город";
    trigger.classList.toggle("is-placeholder", !label);
  }

  function commit() {
    updateDisplay();
    onChange();
  }

  trigger.addEventListener("click", () => (isOpen ? close() : open()));
  backBtn.addEventListener("click", () => showStep("country"));
  skipBtn.addEventListener("click", () => {
    cityInput.value = "";
    commit();
    close(true);
  });

  // Escape закрывает окно и возвращает фокус на поле
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  });

  // Клик вне окна и вне поля — закрыть
  document.addEventListener("pointerdown", (e) => {
    if (isOpen && !root.contains(e.target)) close();
  });

  // Фокус ушёл из окна (например, Tab) — закрыть
  root.addEventListener("focusout", (e) => {
    if (isOpen && e.relatedTarget && !root.contains(e.relatedTarget)) close();
  });

  window.addEventListener("resize", () => isOpen && position());
  if (window.visualViewport) window.visualViewport.addEventListener("resize", () => isOpen && position());

  return {
    // Вызывать после того, как значения поменяли снаружи (сброс, открытие поездки)
    refresh() {
      close();
      updateDisplay();
    },
    open,
    close,
    isOpen: () => isOpen,
    step: () => step,
  };
}
