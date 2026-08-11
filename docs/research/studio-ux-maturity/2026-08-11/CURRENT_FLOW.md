# CURRENT FLOW — фактическая карта Студии

## Система состояний, которую реально видит пользователь

```text
Старт Студии
  ├─ ручной текст / статья ───────────────┐
  ├─ YouTube preview ── captions paste ──┤
  ├─ YouTube ── Downr ── local media ────┤
  ├─ local media ── Gemini / beta Local ─┤
  └─ VTT/SRT ────────────────────────────┘
                         ↓
            extracted preview (modal остаётся)
              ├─ исправить транскрипт
              ├─ продолжить с черновиком
              ├─ упростить
              └─ закрыть
                         ↓
        canonical media package + corrected revision
                         ↓
         composer text → table → save metadata
                         ↓
        learning material / Library → Reading Room
```

В коде источник и revision восстанавливаются content-addressed resolver по точному
построчному совпадению. Это сильный R11/R12 контракт. Проблема находится выше: shell status
вычисляет источник только из `saved/cache/default`, поэтому любое ещё не сохранённое
captions/media состояние падает в label «локальный ввод».

## Состояния и recovery-точки

| Фаза | Каноническое/рабочее состояние | Что показывает UI | Recovery сейчас |
|---|---|---|---|
| Пустой composer | browser-local draft | «Текст: готов» для стартового sample; source `локальный ввод` | localStorage восстанавливает текст |
| YouTube URL | transient modal state | player + Downr + captions instructions | URL и active tab сбрасываются при reopen; после ухода/refresh пользователь должен помнить путь |
| Captions preview | parsed captions, ещё не landed | preview + четыре competing actions | модал можно закрыть; неочевидно, что сохранено |
| Landed transcript | canonical Media Package revision + `v3LastImportMeta` | transcript shelf; source ошибочно `локальный ввод` | cold text survives; resolver способен вернуть revision context |
| Draft after reload | workspace revision существует | `✎ Материалы 1`; transcript banner может исчезнуть | Add Material → Device → «Продолжить работу» |
| Import Center from draft | P4 catalog learning-material projection | `Все · 0` | draft туда не попадает; пользователь возвращается назад без объяснения |
| Table draft | translated rows + provenance | result/table surface + save CTA | local cache; stale state отделён от current state |
| Saved | learning material + immutable histories | source `Library`, saved state | Library card → reopen; этот путь прошёл live |
| Media missing | transcript/table остаются usable | exact SHA relink / study without media | Import Center предлагает fail-closed repair |

## Сценарии и измерения

Счётчик действий ниже считает осмысленные user interactions (нажатие, выбор, paste), но не
каждый символ ввода. Смена режима — modal/tab/external surface/editor/library transition.
`Primary-like peak` — одновременно видимые визуально равноправные CTA, а не DOM-класс.

| Сценарий | Фактический маршрут | Действия / смены режима | Primary-like peak | Результат и ограничение |
|---|---|---:|---:|---|
| A — YouTube + subtitles | Add → Video → URL → preview → YouTube transcript → paste → use → correct/draft → table → save → Library reopen | 14–16 / 6 | 4 в transcript preview; 5 на исходном composer | Live выполнены preview, paste, table, isolated save и Library reopen. Table сохранился и открылся; до save source label был ложным. |
| B — YouTube без transcript | Add → Video → Downr → return → Device → MP3 → ASR | 8 до ASR / 4 + external | 3–4 | Handoff, visible return CTA, file chooser и actual MP3 selection выполнены. Без BYOK остановка ясная. Реальный Downr download и ASR не объявлены PASS. |
| C — local audio/video | Add → Device → media picker → readiness/provider → progress → preview → correction | 6–10 / 3 | 2–4 в зависимости от readiness | Actual MP3 без key даёт actionable error. Media Readiness states/cancel/retry подтверждены code/tests; actual-file owner device PASS pending. |
| D — VTT/SRT | Add → Device → captions picker → preview → correction/draft → table → save | 9–11 / 4 | 4 | Actual committed VTT дал preview. Parser gate: 411 cues, 218 merged segments. Save отдельно доказан сценарием A. |
| E — возврат | close/reload → draft shelf или Library → reopen | saved: 3 / 2; unsaved draft: 5+ / 3 | 1–2 | Saved lifecycle понятен и работает. Draft lifecycle противоречив: `Материалы 1` → `Все · 0`. |
| F — error/recovery | invalid URL, unsupported file, missing key/Companion, missing media, mid-modal close | 1–4 на ветку | 1–3 | Inline errors есть; exact-SHA repair честный. Modal close теряет focus и transient URL/tab state; provider vocabulary требует архитектурного знания. |

## Доказанные удачные ветки

- Invalid non-YouTube URL остаётся в модале и получает inline «Это не похоже на ссылку
  YouTube».
- Unsupported `package.json`, поданный в document picker, получает «Неподдерживаемый или
  повреждённый файл» без записи.
- MP3 без Gemini key получает инструкцию `настройки → Gemini API Key`; provider selector в
  fresh production скрыт до explicit experimental enablement, то есть Local/Gemini/Companion
  не показываются преждевременно.
- Downr обозначен внешним сервисом, открывается в новой вкладке и после handoff показывает
  `Я скачал — выбрать файл`; выбор переводит в `С устройства`.
- Import Center имеет focus trap/return, локальную privacy/storage disclosure, continuity
  states и fail-closed exact-SHA relink. Его не нужно заменять второй библиотекой.
- Material correction editor имеет один явный primary в sticky footer: `Продолжить в
  таблицу`; immutable original и user-corrected revision разделены.
- Saved material из изолированного профиля найден в Library и reopened с сохранённой
  таблицей и `Источник: Library`.

## Доказанные разрывы понимания

1. На `380×844` первая action по добавлению материала начинается на `y=1171`, вне первого
   viewport; до неё пользователь проходит quota/header и крупную сетку пяти продуктовых
   направлений. Document height в наблюдаемом состоянии — `2263px`, horizontal overflow —
   `0px`.
2. Пять равноправных composer actions имеют размеры `203×42`, `261×42`, `310×56`,
   `138×48`, `138×48`; только последние две действительно описывают ближайший основной
   переход.
3. При открытии Add Material focus остаётся на background CTA. Следующие четыре `Tab`
   попадают в background `Упростить`, `Импорт/перенос`, `Материалы 1`, `Собрать таблицу`.
   Background не inert. После close focus остаётся на скрытой кнопке модала.
4. Основной media picker — `<label>` без role/tabindex/for вокруг hidden input. В AX/keyboard
   пути он не является кнопкой.
5. В HE/RTL геометрия зеркалится и horizontal overflow отсутствует, но сохраняются RU
   строки (`61 символ`, `Язык интерфейса`, части settings). В dark nav labels имеют contrast
   `1.07:1`, MT `1.11:1` при требуемых `4.5:1`.

## Что отправляется наружу

| Действие | Граница | Текущая ясность |
|---|---|---|
| Paste/VTT parsing, revision edit, OPFS/catalog | browser-local | Import Center говорит об этом хорошо; composer — фрагментарно |
| YouTube player | YouTube iframe/network | понятен как preview, но captions/download/ASR смешаны в одном длинном слое |
| Downr | внешний сайт | disclosure явный и правильный; continuity только transient |
| Gemini ASR / document extraction | cloud, BYOK/server path в зависимости от операции | стоимость ASR появляется после file readiness; без key error понятен; общий privacy/cost synopsis отсутствует |
| Local Companion | `127.0.0.1`, experimental, explicit pairing | честно default-off; термины `pairing token`, `local job`, `chunks` слишком технические для primary UX |

## Передача в Читальный зал

Существующий контракт не требует редизайна Зала: после canonical save Library является
авторитетным lifecycle, а Room открывает сохранённый материал. Первый UX slice должен лишь
делать эту конечную точку явным success action и прогнать cold-open/media/karaoke parity;
он не должен менять Room catalog, binding или timing.
