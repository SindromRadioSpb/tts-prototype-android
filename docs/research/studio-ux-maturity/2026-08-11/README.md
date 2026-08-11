# STUDIO-UX-MATURITY-RECON

> Дата наблюдения: 2026-08-11
>
> Режим: research / UX audit / decision design only
>
> Source commit: `2e28185b9d608b183d4ffa7e630496e62175f15b` (`main`, byte-equal `origin/main`)
>
> Production: `https://linguistpro.kolosei.com/`, `APP_VERSION=3.11.344`, `CACHE_VERSION=v3.11.344`, schema `48` migrations
> Production revision: `2e28185b` — установлен по byte-equal SHA-256 обслуживаемых `index.html` и `sw.js` относительно HEAD, а не по версии из старого плана

## Scope

Исследован полный путь Студии: вход до добавления материала; статья, YouTube, файл с
устройства и VTT/SRT; preview, Downr handoff, ASR readiness/error surfaces, исправление
транскрипта, таблица, сохранение, повторное открытие, draft recovery и связь с
Импорт-центром. Читальный зал проверялся только как существующая конечная точка
сохранённого материала; его редизайн не входил в scope.

Не изменялись код приложения, локали, схемы, пользовательские данные владельца,
production-конфигурация, версии, service worker и master Roadmap. Единственная запись в
живом UI — одноразовый трёхсегментный материал `UX maturity test 2026-08-11` в
изолированном browser profile; он не разделяет OPFS/IndexedDB с профилем владельца.

## Baseline и границы

- `/healthz`: `ok=true`, DB и migrations ready; production disk `83%`, `disk_warn=true`.
  Cleanup не выполнялся: он не относится к UX-recon.
- P2/P3/P4 и W1–W6 honest import сохранены как закрытые контракты. Канонический save,
  immutable revisions, OPFS, exact-SHA relink, save/cache separation и Room continuity не
  предлагается менять.
- Текущий YouTube product path — встроенный preview + явный переход во внешний Downr +
  возврат к выбору файла. RMA worker остаётся disabled R&D surface.
- Pending, не выданный за PASS: actual-file owner-live Media Readiness на iPhone и Android;
  iPhone virtual keyboard/share sheet/file picker; owner-live Downr download; RMA M0 egress.
- До исследования рабочее дерево уже было грязным. Чужими и неприкосновенными считались
  `.remember/remember.md`, три Wave-2 planning packet, `public/js/morph-host.js`, `.agents/`,
  прежние Studio screenshot-папки и прочие уже существовавшие untracked Wave-2/research
  файлы. Этот пакет касается только путей из индекса ниже и одного planning packet.

## Методы

1. Полное чтение `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`, двух Studio ingest
   roadmaps, P4 implementation packet, двух acquisition decision packets, свежих Studio
   handoff/research-пакетов, committed memory export и live Claude project memory.
2. Сверка HEAD/origin, version/cache/schema, production health и byte hashes обслуживаемых
   shell-файлов.
3. Live production walkthrough в отдельном browser context: desktop RU; `380×844` RU;
   `380×844` HE/RTL; light/dark; валидный и невалидный YouTube URL; panel transcript;
   реальный VTT fixture; реальный MP3 fixture; неподдерживаемый файл; save/reopen.
4. DOM/CSS/code trace для provenance, modal lifecycle, picker semantics, provider gating,
   Downr handoff, error mapping, draft shelf и Import Center catalog.
5. Keyboard trace и Lighthouse accessibility snapshot. Для HE/RTL dark Lighthouse дал
   `0.94`; подтверждены contrast, accessible-name mismatch и отсутствие `<main>` landmark.
6. Regression probes: `smoke:i18n` `233/233`; `smoke:ingest` `22/22`;
   `smoke:captions-parse` PASS; `smoke:material-revision` `19/19`. Объединённый набор
   Studio/Media/P4 unit tests: `215/216`; единственный baseline failure — устаревший
   literal-assert `Source package` в `portableLearningPackageUi.test.js`, не runtime
   corruption и не следствие этого docs-only исследования.

## Ограничения доказательств

- Desktop Chrome и эмуляция mobile viewport доказывают DOM/layout/keyboard navigation, но
  не доказывают iOS Files, Share Sheet, реальную виртуальную клавиатуру, memory pressure или
  playback/seek на устройстве владельца.
- Downr handoff и возврат к выбору локального MP3 пройдены; реальная загрузка чужого видео
  и платный ASR не выполнялись. При выборе MP3 без ключа production честно остановился с
  инструкцией добавить Gemini key. Это error/recovery evidence, не ASR-quality PASS.
- Для VTT использован committed fixture `ted-hebrew-manual.vtt`; parser smoke отдельно
  подтвердил `411` cues и merge в `218` segments. В live UI preview и дальнейшие действия
  появились, но файл не сохранялся вторично.
- Screen reader оценён через accessibility tree, keyboard trace и Lighthouse/axe; ручная
  сессия VoiceOver/NVDA не проводилась.

## Индекс артефактов

- [CURRENT_FLOW.md](CURRENT_FLOW.md) — фактические состояния, переходы, recovery и счётчики.
- [FINDINGS.md](FINDINGS.md) — evidence-backed реестр P0/P1/P2/P3 с ролями и тестами.
- [SCREENSHOT_INDEX.md](SCREENSHOT_INDEX.md) — индекс необходимых изображений и hashes.
- [screenshots/](screenshots/) — девять production screenshots без данных владельца.
- [Decision packet](../../../planning/STUDIO_UX_MATURITY_DECISION_PACKET_2026_08_11.md) —
  A/B/C, рекомендация, bounded slices, allowlist, stop list и acceptance criteria.

## Главный вывод

Канонический конвейер заметно зрелее оболочки. Наиболее опасны не визуальные вкусы, а
расхождения представления состояния: корректный captions passport называется «локальным
вводом», а draft-счётчик «Материалы 1» приводит к каталогу «Все · 0». Рекомендуемый путь —
не перестройка P2/P3/P4, а единая UI-проекция существующего lifecycle, затем mobile/a11y
полировка поверх сохранённых контрактов.
