# LinguistPro — session handoff (2026-06-26)

> Node PWA (иврит↔рус), прод **https://linguistpro.kolosei.com**. Две поверхности: Studio
> (`index.html`) + Читальный зал (`library.html`). Непрерывный деплой: push→main→GitHub
> webhook→Coolify (Docker). Прод-версии git-тегами НЕ метим после v3.6.0 (continuous deploy).

## СОСТОЯНИЕ
- **main HEAD `ced6567`**, прод **app v3.11.3 + SW v3.11.3** (R2 прод-верифицирован Node-fetch, 8/8 имён live).
- **Эпик «Качество ядра морфологии» (research-sequence R1→tail→R2→R3) ПОЛНОСТЬЮ ЗАКРЫТ:**
  - **R1 gold** (`522c965`): золотой eval-харнесс, owner-разметка 172/180 → «exact» **control 97.2% / tail 26.5%**, Nakdan↔gold 86.7%. Артефакт `docs/research/reader-morph-gold/2026-06-25/`.
  - **Tail-fixes L1–L5** (v3.11.1+v3.11.2, `323e1e3`): предлоги/числит./наречия-демоция/имена-seed/опред-причастия → **tail 26.5%→54.5%, honest-recall 45.2%→79.2%, control 97.2% удержан**. Gold-gated `--regold`. План `docs/planning/BRR_RESOLVER_TAIL_FIXES_2026_06_26.md`.
  - **R2 газеттир имён** (v3.11.3, `960b130`): **+293 курированных имени → NAME_PROPER** (assert propernoun). Wikidata he∩corpus(984)→homograph-split живым резолвером→hspell-veto+консерв. курация. **Развилки владельца: (1) curate conservatively; (2) DROP homograph-демоцию→Tier-3** (blanket-демоция гомограф-имён губит «точно» на частых словах יום/אור/מים). Gold: control 97.2% держится, honest-recall→81.8%, over-trigger 0/37. Продьюсер `scripts/premium/build-name-gazetteer.js`, артефакт `docs/research/name-gazetteer/2026-06-26/`, план `docs/planning/BRR_R2_NAME_GAZETTEER_2026_06_26.md`.
  - **R3 спайк tiny-DictaBERT-ONNX = ИЗМЕРЕННЫЙ NO-GO** (`ced6567`, docs-only): encoder экспортится чисто, латентность 0.7мс (пройдено), **НО int8=44.8МБ** (128K-vocab embedding floor; q4 пропускает embedding→163МБ) = овер 30МБ-гейта ~14× ядра; +JS multi-head порт +modern-register слабость +маргинальный payoff (consent-Nakdan Tier-3 уже работает). Артефакт `docs/research/tiny-dictabert-onnx/2026-06-26/`, план `docs/planning/BRR_R3_TINY_DICTABERT_ONNX_SPIKE_2026_06_26.md`.
- **Стек-победитель резолвера:** form-first(9279 Pealim-парадигм) + L1–L5 honesty + R2-имена + consent-gated Nakdan Tier-3. Дальше резолвер НЕ трогаем (у потолка).

## NEXT — Эпик 2 (Читальный зал UX): «уверенность читаема + в один тап от верного» · P1/M · R10
Канон-план: **`docs/planning/BRR_UX_AUDIT_2026_06_25.md`** (9 эпиков; ✅1 honesty, ✅7 desktop; ⏳2/3/4/5/6/8/9). Эпик 2 рекомендован следующим (Волна B). Зависимость Эпик-1 (honest-gate) ГОТОВА. 3 находки:
1. **`morph-provenance-legend`** (P3, делать ПЕРВЫМ — чистый i18n/CSS): легенда бейджей уверенности + **`room.morph.prov.*` ключей НЕТ в EN/HE → не-RU юзеры видят русские подписи** (живой баг). Локали `public/i18n/locales/*.js`. Бампить SW при правке локалей ([[feedback_sw_cache_version_bump]]).
2. **`morph-tier3-on-demand`** (P2): Tier-3 «точный режим» (Dicta Nakdan, `reader-dicta.js`) есть, но достижим лишь глобальным тумблером; нужен per-card **«уточнить в контексте»**. Консент R5: per-card outbound к Dicta = опт-ин, скрыт офлайн (privacy-инвариант).
3. **`machine-niqqud-provenance`** (P2): чип «машинный перевод» не сообщает, что огласовка тоже машинная (R9 derived-as-asserted) — niqqud-label Опция 1 (i18n).

Альтернативы Волны B (если владелец предпочтёт): Эпик 3 quick-win `card-pronounce-word` (S — НЕТ озвучки искомого слова, владеем keyless WaveNet) · Эпик 8 S-фиксы (a11y/reduced-motion/dark-contrast).

## КЛЮЧЕВЫЕ ФАЙЛЫ / КОМАНДЫ
- Резолвер (Room-only): `public/js/reader-morph.js` (NAME_PROPER, functionGate, resolveCore, Tier-3 pickContextReading) + `public/js/notes-autogen.js` (lock-step, гейт `autogen-parity`). **`index.html`/билдер НЕ трогать** (гейт `smoke:reader-parity`).
- Зал UI: `public/library.html` + `public/js/library-ui.js`; карточка морфологии `public/js/reader-morph.js`; Tier-3 `public/js/reader-dicta.js`; локали `public/i18n/locales/*.js`.
- Гейты резолвера: `npm run gold:regold` (control 97.2% не падает) · `smoke:reader-morph` · `smoke:reader-context` · `smoke:autogen-parity` · `smoke:reader-parity`. Gold-харнесс: `scripts/premium/reader-morph-audit.js` (`--worksheet`/`--gold`/`--regold`).
- Версии при шипе: `package.json` + `public/sw.js` CACHE_VERSION + `public/library.html` футер + `public/index.html` футер (reader-morph.js в SW-precache).

## НОРМЫ / ЛОВУШКИ (применять всегда)
- **Роли R1–R10 авто** для любого дизайн/качество-решения (`docs/PROJECT_ROLES.md`). Развилка → варианты+рекомендация, **владелец решает**. Новая роль-линза → PROPOSE сначала.
- **commit+push по умолчанию** при зелёных гейтах (=Coolify деплой); прод-верифи **Node-fetch no-store, НЕ Windows-curl** (curl мангалит UTF-8 иврит — [[feedback_curl_utf8_egress_myth]]).
- **measure-before/after-code (R10):** менять резолвер/лейблинг → гейтить на gold/baked-работах, не спот-чеками.
- **Artifact storage rule:** user-facing артефакты → трекаемый `docs/research/<topic>/<date>/` + README, НЕ только .tmp. Планы → `docs/planning/` (committed).
- **Room-only норма:** Зал-работа не трогает `index.html` до Stage 2; post-render `.rm-w`; parity-гейты.
- **@380px RTL скрин** (светлая+тёмная) перед UI-коммитом; Эпик 7 добавил десктоп-брейкпоинты — проверять ОБА.
- **SW кеширует shell:** бампить CACHE_VERSION при любой правке index.html/library.html/локалей/shell, иначе stale precache.
- **Headless OPFS:** `resolveWordLight`/engine нужен БРАУЗЕР (ensureEngine падает в чистом Node «window undefined») → резолв-харнесс идёт через Playwright (`library.html`); importBundle падает headless → reader-фичи проверять logic-gate+parity+live на устройстве владельца ([[feedback_headless_opfs_playwright]]). Volume-зависимый UI тестировать на БОЛЬШОМ профиле владельца ([[feedback_test_with_nonempty_profile]]).

## ПАМЯТЬ (recall-anchors)
[[project_resolver_quality_research]] (R1+tail+R2+R3 — главный) · [[project_brr_ux_audit]] (9 эпиков) · [[feedback_artifact_storage_rule]] · [[feedback_curl_utf8_egress_myth]] · [[feedback_headless_opfs_playwright]] · [[feedback_sw_cache_version_bump]] · [[feedback_commit_push_deploy_default]] · [[feedback_plans_in_repo]] · [[feedback_test_with_nonempty_profile]] · [[project_srs_strategy]] (Эпик 4 — «знаю» не плодит Anki-карты).
