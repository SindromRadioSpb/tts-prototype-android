# i18n Premium Completion — Execution Plan

**Date:** 2026-05-02 (initial), reconciled 2026-05-10 (post-Tier-0 audit).
**Status:** ✅ **COMPLETE** — Direction 3 phase 1 + phase 2 shipped в v3.1.0 (Сессия 5, 2026-05-09 — commit `b194be4`). PATCH-09 (mobile-header behaviour) absorbed в Direction 1/2 work без отдельного PATCH commit (alternative class names used; the specific `classic-lang-wrap-mobile` selector is не используется в final implementation).
**Scope (исторический):** PATCH-09 through PATCH-16

---

## Audit findings

All problems fall into two categories:

**A. Static HTML using hardcoded Russian** → fix with `data-i18n`  
**B. JS render functions writing hardcoded Russian** → fix with `t()` + `i18n:changed` listener to re-render

### Problem map

| Location | Type | Lines | Strings |
|---|---|---|---|
| Stats panel summary/labels | A (HTML) | 5799, 5811, 5815, 5845, 5849, 5875, 5882 | 7 strings |
| Stats dynamic (TTS cost/quota) | B (`updateTtsCostInfo()`) | 22841, 22854–22859 | 2 templates |
| Stats dynamic (Gemini reset) | B (`loadStats()`) | 12938–12943 | 3 variants |
| `formatDuration()` | B (helper) | 12953–12955 | 3 time formats |
| Build/Speak button labels | B (`classicSyncMainPanels()`) | 11872–11882 | 6 variants |
| Primary bar hints | B (`classicSyncMainPanels()`) | 11894–11902 | 4 variants |
| Source chip | B (`classicSyncMainPanels()`) | 11859–11866 | 3 variants |
| Result trust chips | B (`classicSyncMainPanels()`) | 11905–11926 | 10 variants |
| Result summary | B (`classicSyncMainPanels()`) | 11928–11940 | 5 variants |
| Download audio button | B (`renderAudioFromUrl/Base64`) | 13175, 13432 | 1 string |
| Text info header | B (`v3UiUpdateActiveHeader()`) | 15117–15163 | ~12 strings |
| Table column headers | B (`renderTable()` `colMeta`) | 20236–20242 | 4 strings |
| Library card body | B (card render ~16081) | 16086–16099 | 9 strings |
| Dashboard card body | B (`v3DashRenderItem()`) | 18041–18204 | 8 strings |
| Dashboard activity header | B (`v3DashRenderActivitySection`) | 17160 | 1 template |
| Diagnostics render | B (`v3DiagRenderData()`) | 17681–17801 | 15 strings |

---

## New locale keys

### `classic.*` additions

```
statusSummary            "Лимиты и квоты"
statTtsLabel             "TTS Символы"
statTtsSub               "Через это приложение"
statTtsCostInfo          "Standard voices • до 4M символов/мес бесплатно, далее ≈4 $ за 1M"
statTtsQuotaInfo         "Использовано: {used} / 4 000 000 символов ({percent}% бесплатного лимита)"
statAiLabel              "Запросы AI"
statAiSub                "Переводы таблиц (через это приложение)"
statConsoleLabel         "Для просмотра общего лимита:"
statConsoleBtn           "📊 Открыть Google Cloud Console"
statResetIn              "Сброс квоты через: {duration}"
statResetSoon            "Сброс квоты: скоро"
statResetUnknown         "Сброс квоты через: —"
rebuildTable             "Пересобрать таблицу"
updateTable              "Обновить таблицу"
reSpeak                  "🔊 Переозвучить"
speakAgain               "🔊 Озвучить снова"
primaryHintEmpty         "Введите исходный текст, затем запустите сборку таблицы или озвучку."
primaryHintStale         "Исходный текст изменён. Основное действие сейчас — пересобрать актуальную таблицу."
primaryHintNoTable       "Сначала соберите таблицу. После этого станут доступны работа по строкам и сохранение."
primaryHintReady         "Таблица готова. Можно сохранить результат, открыть экспорт и работать по строкам."
sourceLocal              "Источник: локальный ввод"
sourceLibrary            "Источник: Library"
sourceCache              "Источник: локальный кэш"
chipFreshnessNone        "Актуальность: нет результата"
chipFreshnessStale       "Актуальность: устарела"
chipFreshnessRestored    "Актуальность: восстановлена"
chipFreshnessCurrent     "Актуальность: текущая"
chipLibraryNone          "Library: ещё не создано"
chipLibrarySaved         "Library: сохранено"
chipLibraryNeedSave      "Library: нужно сохранить"
chipExportUnavailable    "Экспорт: недоступен"
chipExportAfterRebuild   "Экспорт: после пересборки"
chipExportReady          "Экспорт: готов"
chipExportAfterSave      "Экспорт: после сохранения"
resultSummaryNoTable     "Сначала соберите таблицу. После этого здесь появятся происхождение результата, экспорт и работа по строкам."
resultSummaryStale       "Результат есть, но он уже не соответствует текущему тексту. Главный следующий шаг — пересобрать таблицу."
resultSummaryExportReady "Результат актуален и сохранён. Можно переходить к экспорту, аудио и работе по строкам."
resultSummarySaved       "Результат актуален и связан с Library. Экспорт станет доступен в сохранённом рабочем контексте."
resultSummaryUnsaved     "Результат актуален, но для экспорта его нужно сохранить в Library."
downloadAudio            "⬇ Скачать audio"
statusDraft              "Черновик"
statusSaved              "Сохранён"
noTitle                  "(без названия)"
tableBuilt               "Таблица сформирована"
tableStaleSub            "Текст изменён — таблица устарела и не соответствует текущему тексту.\nНажмите «Собрать таблицу», чтобы пересобрать актуальную таблицу.\nСохранение таблицы рекомендуется после обновления."
providerLabel            "Провайдер:"
niqqudLabel              "Огласовки:"
openedFromDashboard      "Открыт из Dashboard"
openedFromLibrary        "Открыт из Library"
modeResume               "• режим: продолжить"
audioNiqqudToHebrew      "· Аудио: Огласовки → Иврит"
sourceLabel              "Источник:"
```

### `table.*` additions

```
colTranslitLat    "Транслит (Латиница)"
colTranslitRu     "Транслит (рус.)"
colTranslitSbl    "Транслит (SBL)"
```

### `library.*` additions

```
level      "Уровень"
progressRow "Прогресс: строка №"
source     "Источник"
lastOpened "Последнее открытие"
created    "Создан"
open       "Открыть"
resume     "Продолжить"
edit       "Изменить"
archive    "В архив"
delete     "Удалить"
```

### `dashboard.*` additions

```
pin              "Закрепить"
unpin            "Открепить"
badgeSeen        "прослушано"
badgeLast        "последний раз"
badgeArchived    "Архив: включён"
levelChip        "Уровень"
shownOf          "Показано: {shown} (из {total}) · Источник: {scope}"
allTextsScope    "Все тексты"
loadingRows      "Загрузка…"
noActivity       "Активности пока нет. Проиграйте строку текста, загруженного из Библиотеки (Row-TTS)."
source           "Источник"
continue         "Продолжить"
open             "Открыть"
edit             "Изменить"
```

### `diag.*` (new namespace)

```
online           "онлайн"
unavailable      "недоступен"
ready            "готов"
unloadedIdle     "выгружен (idle)"
configured       "настроен"
notConfigured    "не настроен"
lastRequest      "Последний запрос"
quotaChars       "Квота (символы)"
used             "Использовано"
quota            "Квота"
nearLimit        "Почти исчерпана"
periodFrom       "Период с"
textsActive      "Текстов (активных)"
sentences        "Предложений"
cacheCard        "Кэш (pipeline)"
libCard          "Библиотека"
versionsCard     "Версии компонентов"
updated          "Обновлено"
```

### `time.*` (new namespace)

```
hourMin   "{h} ч {m} мин"
minSec    "{m} мин {s} сек"
sec       "{s} сек"
min       "мин"
```

---

## Re-render strategy on `i18n:changed`

The following functions must be re-called when locale changes. They will be hooked into the `i18n:changed` event listener block in `index.html`:

| Function | Why |
|---|---|
| `classicSyncMainPanels()` | Chips, button labels, hints, source chip |
| `v3UiUpdateActiveHeader()` | Status pill, sub-line with provenance/provider |
| `renderTable(currentTableData)` (guarded) | Column header titles |
| `updateTtsCostInfo()` | TTS cost/quota text |
| `v3LibRenderAll()` / `v3LibRender()` | Library card labels |
| `v3DashboardRender()` | Dashboard item labels, pin/unpin buttons |
| Diag panel: re-call render if panel is open | Diagnostic status values |

Guard pattern for renderTable:
```javascript
if (Array.isArray(currentTableData) && currentTableData.length > 0) {
    try { renderTable(currentTableData); } catch (_) {}
}
```

---

## PATCH-09: Mobile header UX

**Problem:** On narrow viewports (≤480px), Classic Mode utility bar overflows. Language selector hidden below 480px (`classic-lang-wrap`). IDE Mode button full-width on mobile.

**Strategy:** The current scroll-rail (`overflow-x: auto; flex-wrap: nowrap`) works for the nav buttons. The lang selector is already handled by `classic-lang-wrap-mobile`. No fundamental layout change needed — just verify the mobile lang select actually appears and doesn't conflict with IDE toggle.

**Specific fixes:**
- Verify `classic-lang-wrap-mobile` is placed after the utility-bar in DOM and is shown correctly
- Ensure the IDE Mode button doesn't push nav buttons off-screen in landscape

---

## PATCH-10: Stats panel

1. Add `data-i18n` to 7 static strings in `classicStatusStrip` block (lines 5799–5884)
2. In `updateTtsCostInfo()` (lines 22840, 22854): replace hardcoded strings with `t()` calls
3. In `loadStats()` quota section (lines 12938–12943): replace 3 variants with `t()` calls  
4. Refactor `formatDuration(sec)` to use `t("time.hourMin", {h,m})`, etc.

---

## PATCH-11: Result chips, buttons, download, text header

1. In `classicSyncMainPanels()` (lines 11859–11940): replace all hardcoded strings with `t()`
   - Source chip (3 variants)
   - Build/Speak button text (6 variants) — note: `data-i18n` on these elements is dead (overridden by JS), so rely solely on `t()` in JS; remove `data-i18n` from HTML
   - Primary hint (4 variants)
   - Trust chips (10 variants)
   - Result summary (5 variants)
2. In `renderAudioFromUrl/Base64()` (lines 13175, 13432): replace `"⬇ Скачать audio"` with `t("classic.downloadAudio")`
3. In `v3UiUpdateActiveHeader()` (lines 15117–15163): replace all Russian strings with `t()`

---

## PATCH-12: Library cards

In the card render function (lines 16081–16102):
- Replace meta label strings ("Уровень:", "Прогресс: строка №", "Источник:", "Последнее открытие:", "Создан:") with `t()` calls
- Replace action button labels ("Открыть", "Продолжить", "Изменить", "В архив", "Удалить") with `t()` calls
- Add `i18n:changed` listener to re-call `v3LibRenderAll()` or equivalent

---

## PATCH-13: Text metadata modal

The `v3TextMetaModal` (line ~6596) already has `data-i18n` from PATCH-04 via `saveMeta.*` namespace. Verify all labels/buttons are covered.

---

## PATCH-14: Dashboard dynamic content

In `v3DashRenderItem()` (lines 18041–18207) and `v3DashBadges()` (lines 18040–18046):
- "прослушано:", "последний раз:", "Архив: включён", "Уровень:", "Источник:" → `t()`
- "Продолжить", "Открыть", "Изменить", "Закрепить"/"Открепить" → `t()`
- In `v3DashRenderActivitySection()` (line 17160): `"Показано: ..."` → `t("dashboard.shownOf", {...})`
- Empty state strings: "Загрузка…", "Активности пока нет…" → `t()`
- Add `i18n:changed` listener to re-call `v3DashboardRender()`

---

## PATCH-15: Diagnostics and settings badges

In `v3DiagRenderData()` (lines 17681–17801):
- Replace 15 Russian status/label strings with `t("diag.*")` calls
- Card title "Кэш (pipeline)" → `t("diag.cacheCard")`
- Card title "Библиотека" → `t("diag.libCard")`  
- Card title "Версии компонентов" → `t("diag.versionsCard")`
- "Обновлено" → `t("diag.updated")`
- `мин` in idle_timeout_sec display → `t("time.min")`
- Note: "Sidecar (AI local)", "GCP Translate", "Doc cache", "Segment cache", "Overrides", "Segmenter", "Nakdan", "MADLAD-400" stay in English (technical identifiers)

---

## PATCH-16: Tests and DoD

- Add Suite 7 to `tests/i18n.smoke.js`: grep guards verifying no bare Russian in target functions
- Verify new key counts per locale (should remain symmetric)
- Update `docs/I18N_MULTILINGUAL_UI_DOD.md` with PATCH-09–16 evidence

---

## Non-goals

- `geminiModelInfo` content (server-side string, not translated)
- `geminiTodayInfo` numeric format
- `geminiResetInfo` date/time strings beyond formatDuration
- Provider names, voice IDs, localStorage keys
- English/technical identifiers in diagnostics: "Doc cache", "Segment cache", "Segmenter", "Nakdan", "MADLAD-400", "Sidecar (AI local)", "GCP Translate", "AnkiConnect"
- Console/server error messages
