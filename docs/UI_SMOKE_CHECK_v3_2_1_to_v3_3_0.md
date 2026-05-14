# UI Smoke-Check — v3.2.1 + v3.3.0 deltas atop v3.2.0

> **Назначение.** Ручной протокол тестирования пользовательского функционала,
> добавленного **после** v3.2.0 (которая прошла smoke-check ранее).
> Spans only the v3.2.0 → main delta. Не дублирует v3.2.0 TC-T-*.
>
> **Запускать на:** production (Railway deploy of main HEAD) ИЛИ local
> `npm start` against `main`.
>
> **Версия документа:** v1.0 · 2026-05-14 · attached to commits
> `6722607` (v3.2.1) + `637ff52` (v3.3.0).

---

## 0. Pre-flight

Open browser DevTools console. Hard-refresh (Ctrl+Shift+R). Verify Service
Worker is the new version:

```js
navigator.serviceWorker.ready.then(r => r.active && console.log(r.active.scriptURL));
// Application tab → Service Workers → Update on reload checked
```

Expected: SW logged, no console errors during boot.

If you see "Обновить" toast, accept it — required to pick up the new
`v3.3.0-morph-tier-1` cache layout.

---

## TC-A — v3.2.1 transparency preview section

### TC-A-1 — Empty-state (no consent)

1. Fresh browser profile or `localStorage.clear()`.
2. Toolbar → 📊 → modal opens.
3. Verify: status = «Выключен», "Дать согласие" button visible.
4. Click ❌ Close.

**Expected:** Normal v3.2.0 behavior. No new copy compared to v3.2.0.

### TC-A-2 — Preview section appears after consent + cohort

1. 📊 → Дать согласие → tick all 5 checkboxes → Принимаю
2. Enter cohort code `TEST-PILOT-A` (existing local cohort) → Присоединиться
3. Use app for ~30 seconds: open a text, play 2-3 rows TTS, create 1 note
4. 📊 → 👁 Что собрано

**Expected:**
- Modal title: `👁 Что собрано`
- **Top section (NEW):** amber-bordered card titled `📋 Превью следующего upload-а`
  - Intro line: "Эти данные ещё не на сервере. Они отправятся автоматически, когда aggregator посчитает день как завершённый."
  - Period: today's date (e.g. `2026-05-14`)
  - "Будет отправлено: " tomorrow's date (e.g. `2026-05-15`)
  - Mini-table row: today's date · ⏳ preview (amber badge) · Минут / SRS / Заметок / ≈Bytes columns populated
- **Bottom section:** existing «Отправленные uploads» card (unchanged from v3.2.0)

Visual check: preview section MUST look distinct from any «✓ stored» row in the sent-uploads table.

### TC-A-3 — Preview shows zeros when no events today

1. Continue from TC-A-2 modal.
2. If today's events haven't been recorded yet (fresh consent + no
   activity): preview row should show:
   - Status: `⏳ preview` (still)
   - Numeric columns: italic «Сегодня ещё нет зарегистрированных событий.»

**Expected:** No JS errors. Preview gracefully handles zero state.

### TC-A-4 — Preview is read-only (no upload triggered)

1. From the modal, open DevTools → Network tab → clear log.
2. Open + close 👁 Что собрано modal **5 times** in a row.
3. Inspect Network: ZERO requests to `/api/research/v1/metrics`.

**Expected:** Preview computation is purely local — no network calls
when opening the modal repeatedly. (This is the privacy invariant.)

### TC-A-5 — Preview reason states

Disable research mode via `🗑 Отозвать согласие` and reopen 👁 Что собрано
(must re-consent first if you stay on the modal).

Variants to spot-check:
- **NOT_ENABLED**: «Research mode не активен — preview недоступен.»
- **NOT_JOINED**: re-consent without joining cohort → «Не задан cohort code — preview недоступен.»

**Expected:** Each negative branch shows distinct reason copy; no JS errors.

---

## TC-B — v3.3.0 morphology Settings UI

### TC-B-1 — Toolbar button visible

1. After page load, scan the top toolbar.

**Expected:** A new 🔤 button is visible immediately to the right of the
📊 Research button (and left of the 🌗 Theme toggle).

Hover over it: tooltip = `Морфология: словарь`.

### TC-B-2 — Modal layout + default state

1. Click 🔤 → modal opens.

**Expected:**
- Title: `🔤 Морфология: словарь`
- Intro paragraph mentions "Local pre-computed словарь Hebrew-морфологии (hspell)".
- Status block (blue-tinted card) shows:
  - **Состояние:** "Словарь ещё не загружен (lazy fetch на первый word-study)." OR if you've used Word Study already today: "Загружен tier `basic` · NNN записей · 7.0 MB" or similar.
  - **Выбранный tier:** `basic`
- Two radio cards:
  - `[●] Базовый словарь (по умолчанию)` — preselected, green-tinted border.
    Subtext: "~34K записей · 7 MB · 655 KB gzip · ships с приложением..."
  - `[ ] 📚 Расширенный словарь (бета)` — NOT selected.
    Subtext: "~493K записей · 4.2 MB gzip · 72 MB после декомпрессии..."
- Advanced row: `🗑 Очистить SW cache + перезагрузить` button.
- Privacy note at bottom: "Все данные хранятся локально..."
- Actions: `[Применить]` `[Отмена]`

### TC-B-3 — Switching to full tier triggers actual download

1. Continue from TC-B-2.
2. DevTools → Network tab → clear log.
3. Click the `📚 Расширенный словарь (бета)` radio (now amber-tinted).
4. Click `Применить`.

**Expected:**
- Toast: "✓ Расширенный словарь активирован. Скачается при первом lookup (~25-30 MB)."
- localStorage: `morphDictTier_v1 = "full"`
- Network: a request fires to `/morph/heb_morphology_full.meta.json` (200) then `/morph/heb_morphology_full.bin.gz` (200, **Content-Length ≈ 4.24 MB**).
- Re-open 🔤 → Status block now shows "Загружен tier `full` · 493 398 records · 72 MB" (or similar).

### TC-B-4 — More words analyze under full tier

1. Open a Hebrew text. Use Word Study on a less-common word that
   previously had NO analysis under basic tier. Examples: `שופט` (judge),
   `נתוני` (data), `מצליחה` (succeeding).
2. Verify: morphology auto-fill suggests root / lemma / binyan.

**Expected:** Words that previously hit Tier 2 fallback or gave no
analysis under basic now resolve under full.

### TC-B-5 — Switching back to basic

1. 🔤 → click `Базовый словарь` radio → `Применить`.
2. **Expected:** Toast "✓ Базовый словарь активирован."
3. localStorage: `morphDictTier_v1 = "basic"`.
4. Re-open 🔤 → Status: "Загружен tier basic · 34 755 records · ~7 MB".

### TC-B-6 — Clear SW cache + reload action

1. Switch to full tier (if not already there).
2. Click `🗑 Очистить SW cache + перезагрузить`.

**Expected:** Toast "✓ Cache очищен, словарь будет переcкачан." On next
Word Study lookup, network fetch is observable again (no SW cache hit).

### TC-B-7 — Persistence across page reloads

1. Set tier to `full`.
2. Hard-refresh page.
3. Open 🔤 → `📚 Расширенный словарь` radio is preselected.

**Expected:** Choice survives reload via localStorage.

### TC-B-8 — Mobile / narrow viewport

Open the app on a phone (or DevTools mobile emulation, e.g. iPhone 14
Pro 393×852).

1. Verify the 🔤 button stays visible in the toolbar (may need
   horizontal scroll).
2. Open the modal → fields stack vertically, all radios + actions
   reachable without overflow.
3. Apply tier switch → toast appears + dismissible.

---

## TC-C — Cross-feature interactions

### TC-C-1 — Research preview reflects full-tier load

After enabling full tier (TC-B-3) AND consenting to research (TC-A-2):
1. Use app for a few minutes (open 2 texts, do 3 SRS reviews, save a
   note).
2. Open 👁 Что собрано.
3. **Expected:** Preview section's numeric columns are populated and
   sensible (`Минут` matches your activity, `SRS` matches your reviews,
   `Заметок` matches your note creation).

### TC-C-2 — Withdrawing research does NOT change morph tier

1. With research enabled and tier=full:
2. 📊 → 🗑 Отозвать согласие → confirm.
3. Open 🔤 → tier is **still** `full`.

**Expected:** Research withdrawal only touches `research*_v1`
localStorage keys; `morphDictTier_v1` is independent.

### TC-C-3 — Toolbar button visibility across themes

For each theme (cycle via 🌗 button):
1. Verify both 📊 and 🔤 remain visible and distinguishable.

---

## TC-D — Teacher dashboard regression (unchanged surface)

Teacher dashboard (`/teacher.html`) has had **no user-visible changes**
since v3.2.0. Quick smoke to confirm no regression:

1. Open `/teacher.html`
2. Login with existing cohort code + token (or use `SEED-K5` if
   `npm run smoke:prep` was run).
3. Verify 6 sections render: summary tiles · engagement timeline · audio
   playback chart · SRS+notes chart · per-student table · correlations.
4. Click `⬇ Aggregates CSV` → file downloads.

**Expected:** Behavior identical to v3.2.0. Any difference is a
regression — file a bug.

---

## Exit criteria

- All TC-A-* pass → v3.2.1 preview section validated.
- All TC-B-* pass → v3.3.0 morphology Settings validated.
- TC-C-* pass → cross-feature integrity holds.
- TC-D-* pass → no teacher dashboard regression.

If any test fails:
1. Capture browser DevTools console (full log) + Network HAR (filtered
   to relevant requests).
2. Capture screenshot of the failing UI state.
3. File a bug as `Smoke-check/UI_SMOKE_v3.3.0_BUG_NN.md` with TC ID +
   reproduction steps + artifacts.
4. Triage: privacy/data-loss bug → hotfix branch from v3.2.0; UX bug →
   v3.3.1 backlog item.

---

## Companion automated smokes (run alongside manual)

```bash
npm run smoke:research       # 79 cases + 9 PNG visual regression
npm run smoke:morph          # 28 cases (tier + Settings UI + live integration)
```

Both should be green BEFORE running the manual protocol — if either
breaks, the manual protocol is moot.

---

## Estimated time

End-to-end manual run, single tester: **~30-40 minutes**.

The full-tier download in TC-B-3 takes the longest (4.24 MB over your
local network, plus the ~72 MB decompression in-browser). On a typical
broadband + dev machine: ~2-3 s. On slow 3G emulation: ~15-30 s.

---

🤖 Protocol assembled with [Claude Code](https://claude.com/claude-code)
