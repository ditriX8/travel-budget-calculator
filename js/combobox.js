/* =========================================================
   TripBudget — combobox.js
   Поле с выпадающим списком и поиском ("комбобокс").
   Сделано по образцу W3C ARIA Combobox: программы чтения экрана
   понимают, что это список, и объявляют выбранный вариант.

   Управление: ввод фильтрует список, ↑/↓ — выбор, Enter — подтвердить,
   Escape — закрыть, клик вне — закрыть.
   ========================================================= */

let comboboxCount = 0;

/*
  createCombobox({
    input,            // <input> — само поле
    getGroups(query), // → { groups: [{ label, items: [{ value, label, hint }] }], empty: "текст" }
    onSelect(item),   // вызывается при выборе варианта
  })
*/
function createCombobox({ input, getGroups, onSelect }) {
  const id = `combo-${++comboboxCount}`;
  const wrapper = input.closest(".combo");
  const list = document.createElement("ul");
  list.id = `${id}-list`;
  list.className = "combo-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", input.labels && input.labels[0] ? input.labels[0].textContent.trim() : "Варианты");
  wrapper.append(list);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("autocomplete", "off");

  let items = [];      // варианты в текущем списке (без заголовков групп)
  let active = -1;     // индекс подсвеченного варианта
  let isOpen = false;

  function render() {
    const { groups, empty } = getGroups(input.value);
    list.replaceChildren();
    items = [];

    for (const group of groups) {
      if (!group.items.length) continue;
      if (group.label) {
        const header = document.createElement("li");
        header.className = "combo-group";
        header.setAttribute("role", "presentation");
        header.textContent = group.label;
        list.append(header);
      }
      for (const item of group.items) {
        const index = items.length;
        const li = document.createElement("li");
        li.id = `${id}-opt-${index}`;
        li.className = "combo-option";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        if (item.custom) li.classList.add("combo-option--custom");

        const label = document.createElement("span");
        label.className = "combo-label";
        label.textContent = item.label;
        li.append(label);
        if (item.hint) {
          const hint = document.createElement("span");
          hint.className = "combo-hint";
          hint.textContent = item.hint;
          li.append(hint);
        }

        // mousedown + preventDefault: поле не теряет фокус при клике по варианту
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", () => choose(index));
        li.addEventListener("mousemove", () => setActive(index, false));
        list.append(li);
        items.push(item);
      }
    }

    // Ничего не найдено: сообщение — "неактивный вариант", чтобы программы
    // чтения экрана его прочитали, но выбрать его было нельзя
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "combo-empty";
      li.setAttribute("role", "option");
      li.setAttribute("aria-disabled", "true");
      li.setAttribute("aria-selected", "false");
      li.textContent = empty;
      li.addEventListener("mousedown", (e) => e.preventDefault());
      list.append(li);
    }

    // Подсвечиваем вариант, совпадающий с текущим значением, или первый
    const current = items.findIndex((it) => normalizeSearch(it.label) === normalizeSearch(input.value));
    setActive(current >= 0 ? current : (input.value.trim() ? 0 : -1), current >= 0);
  }

  function setActive(index, scroll = true) {
    const options = list.querySelectorAll(".combo-option");
    options.forEach((li, i) => {
      li.classList.toggle("is-active", i === index);
      li.setAttribute("aria-selected", String(i === index));
    });
    active = index;
    if (index >= 0 && options[index]) {
      input.setAttribute("aria-activedescendant", options[index].id);
      if (scroll) options[index].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  // Высота списка — сколько помещается на экране (важно на телефоне с клавиатурой)
  function position() {
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const below = viewportHeight - rect.bottom - 12;
    const above = rect.top - 12 - 64; // 64 — высота шапки сайта
    const openUp = below < 200 && above > below;
    wrapper.classList.toggle("is-above", openUp);
    list.style.maxHeight = `${Math.max(150, Math.min(340, openUp ? above : below))}px`;
  }

  function open() {
    if (input.disabled) return;
    render();
    position();
    isOpen = true;
    wrapper.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    wrapper.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function choose(index) {
    const item = items[index];
    if (!item) return;
    close();
    onSelect(item);
  }

  input.addEventListener("focus", () => {
    // На телефоне прокручиваем поле вверх, чтобы списку хватило места над клавиатурой
    if (window.matchMedia("(max-width: 600px)").matches) {
      setTimeout(() => {
        // Прокручиваем всё поле вместе с подписью, чтобы её не закрыла шапка
        (input.closest(".field") || input).scrollIntoView({ block: "start", behavior: "smooth" });
        setTimeout(() => isOpen && position(), 350);
      }, 50);
    }
    open();
  });
  input.addEventListener("click", () => { if (!isOpen) open(); });
  input.addEventListener("input", () => (isOpen ? (render(), position()) : open()));

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) return open();
      if (!items.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : items.length - 1) : (active + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      if (isOpen && active >= 0) {
        e.preventDefault(); // не отправлять форму
        choose(active);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  });

  input.addEventListener("blur", () => close());

  // Клик или касание вне поля и списка — закрыть
  document.addEventListener("pointerdown", (e) => {
    if (isOpen && !wrapper.contains(e.target)) close();
  });

  window.addEventListener("resize", () => isOpen && position());
  if (window.visualViewport) window.visualViewport.addEventListener("resize", () => isOpen && position());

  return { open, close, refresh: () => isOpen && render(), isOpen: () => isOpen };
}
