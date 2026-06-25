# Reading Room UX program + Library-export closure — handoff 2026-06-25

**★ READ FIRST for Зал/UX work:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` (9-epic plan) ·
`docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (NEXT) · `docs/planning/BRR_EPIC7_DESKTOP_LAYOUT_2026_06_25.md` (SHIPPED) ·
`docs/PROJECT_ROLES.md` (R1–R10 auto). Memory: [[project_brr_ux_audit]] · [[project_ben_yehuda_reading_room]] · [[feedback_studio_live_source_inline]] · [[feedback_browser_verify_fresh_code]] · [[feedback_headless_opfs_playwright]] · [[feedback_test_with_nonempty_profile]].
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Studio `/index.html`, Зал `/library.html`).

## STATE — main HEAD `c74e715`, prod SW `v3.10.84-room-desktop` (all prod-verified)

### Эта сессия закрыла:
1. **Library-export эпик ЗАВЕРШЁН** (`dd21944`): T3 закрыт + P2 отклонён — оба по замерам (фризы=1×167мс блик, Blob off-heap; узкое место = полоса ~0.4 MB/s клиент↔origin, не round-trips). [[project_library_export_progress]].
2. **Читальный зал UX-аудит + план по 9 эпикам** (`eee0e6c`): ролевой workflow (11 линз R1–R10+UX) + live Kapture → 37 верифиц. находок → 9 эпиков. Флагман P0 = резолвер тратит «точно» на неразрешённые чтения (живой баг הֵלֶךְ). [[project_brr_ux_audit]].
3. **Эпик 7 (десктоп-раскладка) SHIPPED+PROD+ПОЛНОСТЬЮ ВЕРИФИЦИРОВАН** (`c74e715`, SW v3.10.84): центр-контейнер 1120px + 880 book-reader (`#proTable` не тронут, parity зелёный) + period-grid auto-fill + полки carousel+scrollbar. **Урок:** v3.10.83 wrap-grid разворачивал длинную полку в 25kpx-страницу → откат на carousel (v3.10.84). **Device-check ЗАКРЫТ 0 фиксов:** мобайл light+dark (owner, 11 скринов `Picture UI/25.06.26/` — mobile-каскад не тронут, badge=«прочитано») + десктоп light+dark (Kapture@1920: roomContent 1120 центр, reader 880, jump-row амбер читаем на dark). recon-доки эпиков 1+7 = `bea487a`. **Эпик 7 ЗАКРЫТ.**

## NEXT — Эпик 1: Честность резолвера (P0) — владелец одобрил («Эпик 7 сейчас, потом Эпик 1»)
Recon-дизайн готов: `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md`. Дефолты развилок одобрены: D1 Dicta-cloud+кэш+graceful-skip · D2 floor по baseline-замеру · D3 «вероятно»+alts · D4 имена P1.3 · D5 ядро P1.0–P1.2 первым.
**Корень бага (в коде):** `notes-autogen.js formFirstResolve` (стр. 133–147) на `ids.length>1` (гомограф огласов. ячейки) угадывает `arr.find(pos)||arr[0]` как решающий (conf 0.92 → «exact») — единственный путь без guard'а кратности (сёстры `resolveTrueRoot`:190 / `offlineMeaningLookup`:167 возвращают null). `reader-morph.js provenanceLabel`:277 даёт «exact» на ЛЮБОМ form-first. resolveCore:312 хардкодит `kind:null` → guard'ы имён не срабатывают.
**Фазы:** P1.0 харнесс `smoke:reader-morph:audit` (выборка baked-работ → resolveCore офлайн vs Dicta-silver, precision-floor) + baseline-замер — **СТРОИТСЯ ПЕРВЫМ** (measure-before-code, R10) → P1.1 F1+F2+F3 мультиплик. демоция (ambiguous+alts, conf 0.65, label!exact) → P1.2 F4+F5 alts-UI + гейт обогащения (Pealim→search/таблица«возможная»/семья скрыта при не-exact). Затем (добивка): P1.3 стоп-лист имён · P1.4 borrowed-vs-unknown · P1.5 никуд-бейдж.
**lock-step:** обновить build-notes генератор симметрично F1/F2 (иначе разойдётся parity заметок). Volume-тест на большом профиле владельца.

## Остальные 7 эпиков (после 1+7) — в плане-доке, по приоритету
2 уверенность-читаема+Tier3 P1·R10 · 3 премиум-карточка P1·R2 · 4 петля удержания LingQ P1·R2/R5 · 5 graded-импульс P1·R8 · 6 курир.библиотека P1·R6 · 8 a11y/honest/first-run P2·R4 · 9 read-aloud/караоке UX P2·R4.

## Инварианты/нормы (Зал)
ВСЁ Room-only: `index.html` + parity-locked `reader-core.js` билдер НЕ трогать (`smoke:reader-parity`); десктоп max-width на Room-локальных селекторах НЕ в общий `reader-core.css`. Offline-first/OPFS. honest-gate (Эпик 1) — зависимость 2/3/4/5. @380px RTL скрин + dark перед коммитом. SW CACHE_VERSION bump на shell-изменение → тост «Обновить» (.ru-upd) → reload для свежести [[feedback_browser_verify_fresh_code]]. Прод-верифи Node-fetch (не Windows-curl). commit+push=деплой по умолчанию [[feedback_commit_push_deploy_default]]. Kapture: клики нужен активный Kapture-панель+фокус; eval-MCP опт-ин и может отвалиться; не ресайзит → мобайл @380px = owner narrow-window.

## Standing backlog
🔑 Ротация AUDIO_UPLOAD_TOKEN+Gemini+GCP (засвечены в чате). FTS→26K blocked на ротации. 47097 Yiddish.
