# ✈️ TripBudget — Travel Budget Calculator

A responsive web app that estimates the cost of a trip. Enter the destination,
trip length and your costs, and the total, the per-day and per-person amounts,
and a breakdown by category update instantly as you type.

The interface is in Russian. It is built with plain **HTML, CSS and JavaScript**:
no frameworks, no build tools, nothing to install.

---

## Features

- Destination, days, nights and number of travelers
- Currency selector: **EUR, USD, PLN** (changes the symbol only, no conversion)
- Four cost categories: accommodation, food, transport, activities
- Automatic calculation on every change, plus a **"Рассчитать бюджет"** (Calculate Budget) button
  that recalculates, highlights the total and scrolls to the results on phones
- Total, cost per day, cost per person
- Breakdown with amounts, percentages and progress bars
- Input checks: red border plus a message for empty, negative,
  fractional or too-large values
- Safe against division by zero: shows "—" instead of crashing
- **Reset** button clears every field (the selected currency stays) and shows an empty state with no error messages
- Full-screen travel photo background that **changes on every page refresh**
  (12 landscapes, never the same photo twice in a row)
- Frosted-glass cards with colored layers; each category has its own color
- **Live exchange rates** from the National Bank of Poland (NBP) at the bottom of the page:
  1 EUR → PLN, 1 USD → PLN and 1 USD → EUR (calculated), with the rate date and the time of the last update.
  Updated automatically on every page load and every hour while the page is open
- Works on desktop, tablet and phone
- 39 built-in tests for the math, formatting, empty-form detection, background picker and exchange rates

---

## How to run it

### Option 1: open the file (simplest)

1. Download the whole project folder, including the `images/` folder.
2. Double-click `index.html`.
3. It opens in your browser. That's it.

### Option 2: run a small local web server

This is how developers usually preview sites. It requires Python
(pre-installed on macOS and Linux).

Open a terminal in the project folder and run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.
Stop the server with `Ctrl + C`.

> After editing a file, just refresh the browser page to see the change.

---

## Project structure

```
travel-budget-calculator/
├── index.html   ← structure: what is on the page
├── style.css    ← design: how it looks
├── script.js    ← logic: calculations and behavior
├── images/      ← 12 landscape photos for the background
└── README.md    ← this file
```

Each file has one job ("separation of concerns"). To change a color, edit only
`style.css`. To fix a calculation, edit only `script.js`.

### `index.html`: the structure

- The form with all input fields. The `value="..."` attributes are the
  **example values** shown when the page opens. Reset clears them; the grey
  `placeholder` hints ("0", "Куда едете?") are only hints, not values.
- The empty results area (`#total`, `#per-day`, `#per-person`, `#breakdown`).
  JavaScript fills it in.
- Each element JavaScript needs has an `id`, its "address" on the page.

### `style.css`: the design

Organized in 9 numbered sections:

1. **Design tokens**: all colors, surfaces, category colors, spacing and corner sizes
   as CSS variables (`--color-primary`, `--cat-food`, …). Change the look of the whole site here.
2. Base styles (font, page color)
3. **Background**: fixed full-screen photo, fade-in, dark overlay for readability
4. Top bar, heading, footer
5. Layout (CSS Grid) and cards: light frosted glass for the form, colored inner panels
6. Form fields, category chips, error styles, buttons
7. Results: dark glass card, total box (with a short pulse animation), stats, colored bars
8. Fallbacks and accessibility: denser cards if blur is unsupported, no animations
   if the user turned them off in system settings
9. **Responsive rules**: one column below 860px, phone layout below 480px

### `script.js`: the logic

Organized in 6 numbered sections:

| Section | What it does |
|---|---|
| 1. Settings | Categories and validation rules for every field |
| 2. Pure functions | `calculateBudget()`, `safeDivide()`, `roundMoney()`, `validateValue()`. Only math, never touches the page |
| 3. Formatting | `formatMoney()` (currency formatting), `plural()` (Russian word endings) |
| 4. Page work | `readForm()` reads and checks the fields, `update()` displays the results |
| 5. Events | Recalculate on every input; Reset empties all fields (errors for empty fields appear only after you touch them or press Calculate); the Calculate button (and Enter) recalculates, focuses the first error or scrolls to results |
| 5б. Random background | `pickBackgroundIndex()` picks a photo different from last time (remembered in `localStorage`) |
| 5в. Exchange rates | Loads NBP table A (`api.nbp.pl`), shows 1 EUR → PLN, 1 USD → PLN and 1 USD → EUR, keeps the last good answer and its time in `localStorage` for offline use. No built-in rate values |
| 6. Tests | `runTests()`: 39 automatic checks |

**Formulas used:**

```
Accommodation = price per night × nights
Food          = price per day per person × days × travelers
Transport     = total amount
Activities    = total amount

Total      = sum of the four
Per day    = Total ÷ days        (shows "—" if days is 0)
Per person = Total ÷ travelers   (shows "—" if travelers is 0)
```

---

## How to test

### Automatic tests

1. Open the app in Chrome, Edge or Firefox.
2. Press **F12** (Mac: `Cmd + Option + J`) and open the **Console** tab.
3. Type `runTests()` and press Enter.

You'll see a table with every test and ✅ or ❌, ending with
`✅ 39 из 39 тестов пройдено` ("39 of 39 tests passed").
The tests check only the math functions, so they don't change what's on the page.

What they cover: the default trip totals, percentages adding up to 100,
division by zero, all-zero costs, decimal precision (0.1 + 0.2 = 0.3),
zero nights, input validation, currency formats, Russian word endings and the
random background (never repeats, always a valid photo) and exchange rates
(reading the NBP answer, rejecting a broken answer, cross rates, formatting).

### Manual check with the default values

On page load you should see (in EUR):

| | Calculation | Result |
|---|---|---|
| Accommodation | 120 × 4 nights | 480,00 € |
| Food | 40 × 5 days × 2 people | 400,00 € |
| Transport | | 300,00 € |
| Activities | | 150,00 € |
| **Total** | | **1 330,00 €** |
| Per day | 1330 ÷ 5 | 266,00 € |
| Per person | 1330 ÷ 2 | 665,00 € |

---

## Known limitations

- Percentages are rounded to whole numbers, so they can occasionally add up to 99% or 101%.
- If a field has an error, the total is still calculated, counting that field as 0.
  The red message shows what to fix.
- No currency conversion: switching currency only changes the symbol.
- Exchange rates: NBP publishes them once per business day (around noon), so on weekends
  and holidays the rate date is the last business day. If NBP can't be reached, the block shows the
  last received rates with their update time and «NBP недоступен»; with no saved data it shows «Нет данных».
- On the claude.ai published page, outside requests are blocked, so the rates block there
  shows «Нет данных». Run the site locally or on normal hosting for live rates.
- Inputs are not saved: refreshing the page shows the example values again.

## Data and photo sources

Exchange rates: [NBP Web API](https://api.nbp.pl), average rates (table A), free and public.

Background photos are from [Unsplash](https://unsplash.com) and used under the
[Unsplash License](https://unsplash.com/license) (free to use, no attribution required on the site).
To add your own photo: put a `.jpg` in `images/` and add a line to the `BACKGROUNDS`
list in `script.js`.

## Ideas for next steps

- Save inputs between visits with `localStorage`
- A budget limit with a warning when you go over
- An "Other" expense category
- Real currency conversion using an exchange-rate API
