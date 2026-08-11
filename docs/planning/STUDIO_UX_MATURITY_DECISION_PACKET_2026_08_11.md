# STUDIO UX MATURITY — DECISION PACKET

> Дата: 2026-08-11
>
> Статус: **OWNER DECISION REQUIRED — implementation не разрешена**
>
> Research baseline: `2e28185b9d608b183d4ffa7e630496e62175f15b`, production `3.11.344`
> Evidence: [`docs/research/studio-ux-maturity/2026-08-11/`](../research/studio-ux-maturity/2026-08-11/README.md)

## 1. Executive summary

Студия уже имеет зрелый data/recovery foundation, но UI не даёт пользователю единую
правдивую картину lifecycle. Главный дефект — не «некрасиво», а literal contradiction:
YouTube captions passport показывается как `Источник: локальный ввод` (**P0**). Второй —
draft count `Материалы 1` ведёт в Import Center `Все · 0` (**P1**). Третий класс — mobile и
accessibility: главный ingest action ниже первого экрана, Add Material не traps/returns focus,
media picker недоступен с клавиатуры, HE dark navigation имеет contrast около `1.07:1`.

Рекомендация: **B — end-to-end UX maturity**, но выполнять пятью bounded slices. Первый
slice — presentation-only truth/focus/mobile accessibility, без schema/catalog/provider/Room
изменений. После его owner acceptance отдельным решением разрешать derived draft projection
в существующий Import Center. Так исправляется путь, не открывая вторую библиотеку и не
трогая P2/P3/P4 canon.

## 2. Что уже достаточно хорошо и должно сохраниться

1. **Canonical save и read-back.** Одноразовый материал построил таблицу, перешёл в
   `mode=saved`, отказался от лишнего повторного write и reopened из Library с таблицей.
2. **Media/caption authority.** Immutable raw original, corrected revision, exact line/source
   resolver, no interpolation и fail-closed ambiguity — сохраняются.
3. **Import Center.** Один browser-local catalog/recovery surface, explicit receipts,
   archive/snapshot distinction, exact-SHA relink и `study without media`. Не создавать
   конкурирующий список.
4. **External boundary.** Downr явно внешний; нет iframe/API proxy и ложного first-party
   ownership. YouTube preview независим.
5. **Provider honesty.** Local ASR default-off, Gemini default не меняется, implicit fallback
   запрещён, cloud consent/cost и retry/cancel states существуют.
6. **RTL base.** Геометрия зеркалится, tabs сохраняют логический порядок, на 380px нет
   horizontal overflow.
7. **Editor hierarchy.** Corrector уже имеет полезный sticky footer с одним primary
   `Продолжить в таблицу`; его не заменять wizard-ом.
8. **Room handoff contract.** Saved Library material остаётся единственной точкой передачи;
   Reading Room не редизайнить.

## 3. P0/P1 findings

| ID | Severity | Решаемая проблема | Возможность, которую можно повредить | Что неизменно | Как доказать отсутствие регрессии |
|---|---|---|---|---|---|
| UXM-001 | P0 | false source label для captions/media | exact resolver и stale-passport refusal | passport, revisions, timing canon | red matrix + cold reload + Room provenance parity |
| UXM-002 | P1 | draft `1` против catalog `0` | P4 catalog identity/promotion rules | один catalog, zero promotion on read | derived-union tests, no duplicates, stable keys |
| UXM-003 | P1 | modal focus уходит в background | file chooser/nested editor gestures | handlers и modal content | Tab/Shift+Tab/Escape/opener browser smoke |
| UXM-004 | P1 | media picker pointer-only | iOS direct user-gesture picker | accept/handler/provider defaults | keyboard + actual iPhone Files gate |
| UXM-005 | P1 | ingest CTA ниже mobile fold | доступ к Library/Room/expert tools | все destinations | 320–430 visual/box gates + desktop parity |
| UXM-006 | P1 | 4–5 равных next actions | expert shortcuts | все actions, no implicit processing | one-primary state matrix, shortcuts reachable |
| UXM-007 | P1 | HE dark unreadable | theme system/specificity | light theme and tokens | axe contrast + screenshot matrix |
| UXM-008 | P1 | Downr handoff забывается после reopen | provenance must not outlive source proof | no downloader/no media persistence | session intent expiry/replacement/reload tests |

Полный evidence register: [FINDINGS.md](../research/studio-ux-maturity/2026-08-11/FINDINGS.md).

## 4. Premium P2 improvements

- UXM-009: перевести provider/hash/job/chunk vocabulary из primary copy в disclosure.
- UXM-010: убрать RU/English fragments из HE и accessible names.
- UXM-011: не говорить «пересобрать» до существования table/audio.
- UXM-012: привести mobile targets к минимуму 44px, primary к 48px.
- UXM-013: после canonical save дать один result-oriented next action: учиться/Room.
- UXM-014: один `<main>` landmark и label-in-name для `MT`.

Это не включает декоративный rebrand, новые иллюстрации, component library или motion
program. Visual polish допустим только как следствие hierarchy, readability и state truth.

## 5. Варианты A/B/C

### A — минимальное исправление тупиков

Исправить source label, draft terminology, focus trap/return, keyboard media picker и dark
contrast. Добавить `Черновики` вместо `Материалы` до promotion. Не менять расположение shell,
post-save и Import Center catalog.

- Плюсы: малый diff/risk, закрывает P0 и hard accessibility P1.
- Минусы: mobile entry и competing actions остаются; draft recovery требует обхода через Add
  Material; продукт не достигает end-to-end maturity.
- Оценка: 1–2 slices.

### B — рекомендуемый end-to-end UX maturity

Сначала A как safety slice; затем единый phase/next-action reducer; далее derived draft
states внутри существующего Import Center; mobile hierarchy; privacy/cost/error copy и
post-save destination. Никаких новых canonical tables/storage/source of truth.

- Плюсы: решает весь journey, использует существующий canon, даёт premium clarity.
- Минусы: catalog projection требует отдельного high-risk slice и строгого P4/Room regression
  gate.
- Оценка: 5 bounded slices, каждый отдельно принимается.

### C — глубокая перестройка information architecture

Новый staged shell `Источник → Расшифровка → Таблица → Сохранено`, navigation переносится в
отдельную app rail, acquisition/editor/results становятся отдельными routes/surfaces.

- Плюсы: максимально ясная mental model, clean mobile composition.
- Минусы: затрагивает shared shell, deep links, Library/Room transitions, modal ecosystem и
  P2/P3/P4 wiring; велика вероятность второго orchestration/canon слоя. Потребует отдельного
  recon/architecture approval.
- Оценка: новая программа; **не разрешать сейчас**.

## 6. A/B/C через роли

| Роль | A | B | C |
|---|---|---|---|
| R4 premium/mobile/RTL | Закрывает blockers, не весь journey | **Лучший баланс:** одна action hierarchy, mobile/RTL/a11y | Сильный potential, высокий transition risk |
| R5 product value | Улучшает доступ, value loop всё ещё рвётся | **Save → learn outcome становится явным** | Может поглотить время без новой learner value |
| R11 do-no-harm | Низкий риск | Допустим только поэтапно с gates | Высокий риск верных legacy paths |
| R12 one source of truth | Честный relabel, canon untouched | **Derived projection одного canon** | Риск второго workflow/state store |
| R14 safe boundaries | Downr/provider truth сохраняется | Добавляет persistent intent без media/secret | Route split может размыть external boundary |
| R15 lifecycle/privacy | Частично исправляет terminology | **Полный draft→saved→repair→learn lifecycle** | Требует переопределять зрелые contracts |
| R16 cost clarity | Локальные copy fixes | Cost/privacy по decision point | Можно сделать хорошо, но scope несоразмерен |

## 7. Однозначная рекомендация

**Утвердить B, но разрешить сейчас только B1.** B — единственный вариант, закрывающий не
только дефекты отдельных controls, но потерю состояния между acquisition, correction,
material и learning. Его безопасность обеспечивается не общим redesign commit, а stop/go
между slices. C отклонить; A использовать как содержимое B1, а не как конечную программу.

## 8. Bounded sequence

### B1 — Truth + focus + reachable action (первый slice)

- source/status reducer читает existing resolved media context;
- `Материалы N` для unpromoted workspace становится `Черновики N`;
- один recommended CTA по существующему phase, без удаления expert actions;
- Add Material focus isolation/return;
- настоящий keyboard media picker;
- HE dark contrast, mixed composed strings и main landmark;
- никаких Import Center catalog/schema/provider/Room changes.

**Gate:** все UXM-001/003/004/007 red tests green; 380 RU/HE screenshots; current P2/P3/P4
gates; byte-level proof only allowlist changed.

### B2 — Downr continuity

Session-local bounded handoff intent с expiry/replacement/discard. Только `videoId`, time и
next action; ни media bytes, ни claim о download success. Popup-blocked/refresh/iPhone-return
owner flow.

### B3 — One lifecycle projection in Import Center

Derived union существующих media workspaces и learning materials. Draft не promoted by
read; stable keys; no duplicate entity; filters `Черновики / Готовы / Требуют внимания`.
Отдельный implementation packet и owner approval обязательны.

### B4 — Mobile hierarchy and progressive disclosure

Compact mobile phase header + next CTA above fold; secondary navigation collapsible; provider
details after media/readiness; all old expert actions reachable.

### B5 — Completion, copy and owner-live hardening

Save success → learn/Room; ordinary-language local/cloud/cost; full locale/a11y pass; PC and
iPhone actual-file checklist; no GA claim before owner-live.

## 9. Точная allowlist B1

Разрешать B1 только в следующих файлах:

```text
package.json
public/index.html
public/sw.js
public/js/studio-import.js
public/js/studio-media-package.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
tests/i18n.locale-version.lock.json
tests/i18n.smoke.js
tests/studioUxMaturity.test.js                         # new
scripts/premium/studio-ux-maturity-browser-smoke.js   # new
docs/planning/STUDIO_UX_MATURITY_B1_IMPLEMENTATION_PACKET_2026_08_11.md # only after owner approval
```

`public/sw.js`, locale lock и `package.json` разрешены только для required cache/version/test
wiring. APP/CACHE version bump — implementation concern после approval, не сделан этим recon.

## 10. Shared-file stop list

Любое требование изменить файл ниже останавливает B1 и возвращается владельцу:

```text
public/js/import-center-core.js
public/js/studio-portable-learning-package.js
public/js/media-host.js
public/js/media-readiness.js
public/js/local-asr-client.js
public/js/local-asr-normalizer.js
public/js/local-asr-onboarding.js
public/library.html
public/db/**
db/**
ingest/**
media-acquisition/**
server.js
migrations/**
docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md
docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
```

Также stop: новая store/table, automatic ASR/translation/promotion, provider default/fallback,
timing interpolation/mass rebind, new downloader, shared component extraction без отдельного
proof, Room UI redesign.

## 11. Regression matrix Studio + Room

| Gate | Draft | Captions | Media | Saved | Missing media | Room |
|---|---:|---:|---:|---:|---:|---:|
| source/status truth | local | captions URL/file | audio/video/provider | Library | Library + missing | matching saved passport |
| exact resolver ambiguity | n/a | refuse false match | refuse false match | stable | stable | no invented timing |
| one primary CTA | add/build | correct/build | readiness/transcribe | learn/open | repair/study | unchanged |
| cold reload | text | revision restored | revision + availability | card/table restored | study remains | playback/rows unchanged |
| focus/a11y | main | import modal | picker/progress | save modal | Import Center | navigation return |
| no implicit work | no call | no auto translate | no provider fallback | no duplicate save | no auto relink | no auto mutation |
| i18n/theme | RU/HE/EN | RU/HE/EN | RU/HE/EN | RU/HE/EN | RU/HE/EN | smoke only |
| canon write count | 0 | explicit landing only | explicit completion only | 1 canonical save | explicit repair only | 0 on open |

Required existing gates include captions parser, material revision, media package/repository,
Import Center core/repository/security/UI, save progress, Room media/karaoke and i18n
cache/version lock. Baseline stale literal assertion in `portableLearningPackageUi.test.js`
must be triaged before using the combined suite as a green release gate; it must not be
silently waived.

## 12. Acceptance criteria

### Desktop RU

- source chip matches canonical/resolved provenance for manual/article/captions/media/Library;
- exactly one primary-like next action per phase; all current actions remain reachable;
- Add Material traps focus, Escape/backdrop/close return exact opener;
- 1280px no layout regression; long title/error wraps without covering CTA;
- no extra canonical writes/provider calls from render/state reducer.

### 380px RU

- current phase and next CTA visible in first viewport under safe-area constraints;
- no horizontal overflow at 320/360/380/430;
- all interactive targets at least `44×44`, primary at least `48px` high;
- file picker works via touch, Enter and Space;
- focused field remains visible under actual iPhone keyboard — owner-live required;
- Downr return/reload exposes honest next action, never asserts download success.

### 380px HE/RTL

- correct `lang=he`, `dir=rtl`, logical tab order and mirrored layout;
- no RU composed strings or Russian accessible names;
- light/dark text contrast WCAG AA for normal text; `MT` label-in-name passes;
- no horizontal overflow with long errors/provider/cost copy;
- focus order follows logical reading order, not visual accident.

## 13. Owner-live scenarios

### ПК владельца

1. A: real owned/allowed YouTube URL with captions → correct → table → canonical save → close
   tab → cold reopen from Library → Room.
2. B: Downr download of content owner may lawfully download → return → actual downloaded file
   → chosen provider → progress/cancel/retry → save.
3. C: actual long local audio/video through Gemini and, if explicitly enabled, Companion;
   verify cost estimate, no implicit fallback and job deletion semantics.
4. D/E/F: VTT/SRT, unsaved draft recovery, missing media exact-SHA relink, invalid key/network,
   close mid-process.

### iPhone владельца — не заменяется automation

1. Safari installed/PWA and normal tab: Add Material first viewport, safe areas, 380-class width.
2. Focus URL/title and show keyboard: active field/primary CTA stays visible; close returns focus.
3. YouTube → Downr/new tab → Files download → return after Safari tab eviction → continuation
   CTA → Files picker.
4. Actual M4A/MP4/VTT/SRT: picker source, filename, duration/readiness, progress/cancel.
5. HE/RTL light/dark with VoiceOver: modal name, tabs, file picker, errors, focus return.
6. Save → kill/reopen PWA → Library → Room; then simulate missing media and exact relink;
   no declaration PASS until playback/seek and cold reopen observed.

## 14. Вопросы владельцу

1. Утвердить ли **B** как программу и **только B1** как первый implementation slice?
2. В B1 принять ли временную честную терминологию `Черновики N` до B3, вместо попытки сразу
   включить drafts в P4 catalog?
3. Для saved success primary предпочесть `Продолжить учиться` (resume-aware) или явно
   `Открыть в Читальном зале`? Рекомендация: первое с destination subtitle `Читальный зал`.
4. Разрешить ли B2 сохранять session-local Downr intent на 24 часа? Рекомендация: да, с
   explicit discard и replacement новым URL.
5. Кто и на каких iPhone/OS выполнит owner-live gate; какие owned/allowed media fixtures
   разрешены для Downr/Gemini проверки?

## Decision record

До ответа владельца: master Roadmap не менять, implementation packet не создавать, код/UI/
версии/production не изменять. Этот документ фиксирует recommendation, но не authorization.
