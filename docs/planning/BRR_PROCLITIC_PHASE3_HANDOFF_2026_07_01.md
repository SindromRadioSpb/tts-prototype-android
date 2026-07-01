# BRR Proclitic Phase-3 — SESSION HANDOFF (READ FIRST) · 2026-07-01

> Self-contained continuation point. The epic is **SHIPPED + LIVE on prod**; the only open item is
> **coverage expansion** (re-baking the rest of the corpus), which is **blocked by a Dicta-side
> outage** and is fully **resumable**. Deep design/measurement context: `BRR_PROCLITIC_PHASE2_RECON_2026_07_01.md`
> (esp. **§10**). Lessons: memory `feedback_bulk_dicta_bake_ratelimit` + `feedback_coolify_deploy_ops`.

## §0. TL;DR
Тап слова с проклитикой (ה ו ב ל כ מ ש) в Зале → вторичный ряд **«Приставки»** (роль + ссылка в 3b «Употребление»), НЕ ломая корневую букву (בַּיִת·מֹשֶׁה·בְּיִחוּד). **Движок + продюсер + гейт + рендер + rollout-плюминг — ЗАВЕРШЕНЫ и в ПРОДЕ (v3.11.67).** `main` = `149d355` (in-sync с origin). Прод sw=v3.11.67, proclitic-segment.js 200, **164 работы с оверлеями live**. Осталось ТОЛЬКО добейкать остальные ~632 работы — **заблокировано аутэйджем Dicta** (не критично, do-no-harm-safe, resumable).

## §1. ЧТО ЗАШИПЛЕНО (8 коммитов `1b74064`…`149d355`, все на origin/main)
- **Движок** `public/js/proclitic-segment.js` — pure dual-export, lock-step. Tier-1 офлайн FSA (enumerate-parses → longest known-residual, abstain) + Tier-2 bake-Dicta overlay (`pre` из pipe-сегментации → SUPPRESS whole-word/proper-noun + CONFIRM known-stem→confident; НЕ ассертит unknown-stem). Слитный артикль из огласовки ТОЛЬКО перед номиналом. **Замер vs frozen R1-gold (332): confident existence-precision 100% (52/0), core-seg 100%, все per-category полы.**
- **Продюсер** `scripts/premium/build-proclitic-overlay.js` — Node-fetch Dicta напрямую (reader-dicta.js `prefixes`). Режимы: `--gold-fixture` (frozen `overlay-fixture.json` для гейта) · `--bake` (per-work оверлеи на том) · `--attested` (vocab-boost) · `--status`. **Резилиентность (после аутэйджа): circuit-breaker (пауза+проба+retry, НЕ degrade), `--redo-degraded`, default `--concurrency=2`, cache+ledger+resume.**
- **Гейт** `smoke:reader-proclitic` (`scripts/premium/proclitic-segment-smoke.js`, **47 ассертов**, HERMETIC — frozen gold + frozen Dicta-fixture + shipped attested-артефакт, без live Dicta): hard-neg zero-tol · confident≥99 · per-cat полы · core-seg≥95 · over-peel zero-tol · morpheme-label tripwire · fossil-collision · oracle-independence · additive-purity.
- **Рендер** `public/js/reader-morph.js` (+ `library.html` CSS/скрипт-тег + `library-ui.js` overlay-load) — АДДИТИВНЫЙ chip-ряд «Приставки» под разбором основы (byte-parity основы, reader-parity зелён), тап-чип→3b usage, **surface ТОЛЬКО confident** (офлайн hedge'ит ~22% слов=шумно → скрыт; `card.procliticsRaw` для будущего opt-in). Overlay грузится per-work best-effort.
- **Rollout-плюминг** — `push-proclitic-overlay.js` (npm `push:corpus-proclitic`) + server `POST /api/benyehuda/proclitic/upload` + static-mount `/data/benyehuda/proclitic` (`server.js`, клон works/-паттерна, X-Audio-Upload-Token, path-traversal guard, atomic write) + `.gitignore` `public/data/benyehuda/proclitic/`.
- **Lever-2 attested-boost** ЗАШИПЛЕН+live: `public/data/inflection/corpus-attested-words-v1.json.gz` (Dicta-whole-words, POS-routed) → `buildLexicon({attested})` → confident recall 20.7→27.9% (+35%), precision 100%. **⚠ артефакт сейчас ЧАСТИЧНЫЙ** (из неполного кэша); пересобрать `--attested` из ПОЛНОГО кэша после добейка.
- **Артефакты-фикстуры** (committed): `docs/research/epic-proclitic-phase2/2026-07-01/{gold-frozen.json, overlay-fixture.json}`.

**Гейты зелёные:** smoke:reader-proclitic 47/47 · reader-morph · reader-parity · function-usage 679 · api-smoke. index.html не тронут; Зал parity-safe.

## §2. БЛОКЕР — Dicta-side backend outage (НЕ критично)
Агрессивный `--concurrency=5`-бейк перегрузил Dicta → nakdan `/api` отдаёт **503 всему** (~5ч+ на момент фиксации). Диагностика: LB отвечает (404 root), `dicta.org.il` + `nakdan.dicta.org.il` = 200 → это **аутэйдж их backend'а морфологии** (нет здоровых upstream), НЕ IP-бан на нас; 60-мин чистый cooldown не помог. Наш concurrency=5 мог его «уронить», но сейчас это глобально их сторона. **Ежечасные пинги ОСТАНОВЛЕНЫ (parked).**
- **Прод БЕЗОПАСЕН:** нет оверлея / sparse оверлей → офлайн-фолбэк → скрыто в confident-only → **никаких ложных разборов**, только недо-покрытие.
- **Состояние бейка:** ledger `.tmp/benyehuda/proclitic-overlay-ledger.json` = **530/796 done, 161 clean, 369 degraded** (пустые/sparse из-за 503). Кэш `.tmp/benyehuda/proclitic-overlay-dicta-cache.json` (чистые строки кэшированы, деградированные — нет → перевызовутся).

## §3. ВОЗОБНОВЛЕНИЕ (когда Dicta ответит) — точные шаги по порядку
```bash
# 0) проба (одна, мягко): ожила ли Dicta?
node -e 'require("./public/js/reader-dicta.js").analyzeSentence("בבית ישב שדה").then(r=>console.log(r&&r.ok&&!r.degraded?"OK":"503 "+(r&&r.reason)))'

# 1) мягкий self-healing добейк (369 degraded + 266 не-бейканных = 635 работ; circuit-breaker переживёт остаточные лимиты)
node scripts/premium/build-proclitic-overlay.js --bake --redo-degraded --concurrency=2 --sleep=300
#   ⚠ ПОСЛЕ добейка проверь деградацию: node -e 'const w=JSON.parse(require("fs").readFileSync(".tmp/benyehuda/proclitic-overlay-ledger.json")).works;let deg=0;for(const k in w)if((w[k].degradedRows||0)>0)deg++;console.log("degraded works:",deg)'  → должно быть ~0

# 2) полный ре-пуш оверлеев на прод-том (БЕЗ --skip-existing → перезаписать sparse)
AUDIO_UPLOAD_TOKEN=<token> node scripts/premium/push-proclitic-overlay.js
#   (см. .claude/PROD_OPS_PRIVATE.md для токена; он же X-Audio-Upload-Token сервера)

# 3) пересобрать ПОЛНЫЙ attested-vocab из полного кэша → больше recall
node scripts/premium/build-proclitic-overlay.js --attested

# 4) гейт + коммит + пуш (attested-артефакт вырос) + деплой
npm run smoke:reader-proclitic          # 47/47
git add public/data/inflection/corpus-attested-words-v1.json.gz
git commit -m "feat(proclitic phase-3): full corpus attested vocab + all overlays baked"
git push origin main

# 5) прод-верификация
node -e '(async()=>{const B="https://linguistpro.kolosei.com";for(const [l,u] of [["sw","/sw.js"],["seg","/js/proclitic-segment.js"],["ov105","/data/benyehuda/proclitic/105.json"],["attested","/data/inflection/corpus-attested-words-v1.json.gz"]]){const r=await fetch(B+u,{cache:"no-store"}).catch(()=>null);console.log(l,r?r.status:"ERR")}})()'
```
**⚠ Coolify-деплой:** если пуш не «приезжает» на прод за ~5 мин — открой Coolify (`http://<PROD_IP>:8000/...deployment`), проверь не завис ли деплой In-Progress на старом коммите (было: завис на 3ч, блокировал очередь) → отмени его (кнопка Cancel, можно через Kapture). Rolling-update окно → transient 404 на volume-push → подожди consecutive-200s + повтори push. См. `feedback_coolify_deploy_ops`.

## §4. КООРДИНАТЫ / ФАЙЛЫ
- **Токен пуша:** `AUDIO_UPLOAD_TOKEN` (в `.claude/PROD_OPS_PRIVATE.md`, gitignored; = серверный env). Прод: `https://linguistpro.kolosei.com`.
- **Ключевые файлы:** движок `public/js/proclitic-segment.js` · продюсер `scripts/premium/build-proclitic-overlay.js` · гейт `scripts/premium/proclitic-segment-smoke.js` · пуш `scripts/premium/push-proclitic-overlay.js` · рендер `public/js/reader-morph.js` (procliticHtml @~1140, resolveWordLight attach @~760, ensureEngine attested-load @~600) · overlay-load `public/js/library-ui.js` (loadProcliticOverlay) · server `server.js` (route @~3500, mount @~435).
- **Оверлеи на томе (gitignored):** `public/data/benyehuda/proclitic/<id>.json`. **Не в git** (как works/, fts/).

## §5. DEFERRED / ОПЦИИ (владелец)
- **Lever-1 rich-offline-hedge — ОТКЛОНЁН** (замер 95%/89.5% core-seg, только un-baked). `card.procliticsRaw` оставлен, если передумаем.
- **i18n-хвост** «Приставок»: chip-ряд на inline-RU фолбэках; добавить `room.morph.proc.*` + часть `room.morph.usage.*` в `public/i18n/locales/{ru,en,he}.js` (трогает ТОЛЬКО локали, 0 конфликта). Dicta-free — годится для параллельной сессии.
- **Опц.** wire оверлея+attested в `publish-corpus-batch.js` (сейчас decoupled, как FTS-push, достаточно).
- **Соседние эпики BRR** (из аудита, независимы от Dicta): `byline · W1-b · Wave-2`.

## §6. ИНВАРИАНТЫ (не нарушать)
Детектор АДДИТИВНЫЙ (byte-parity основы, `smoke:reader-parity`) · метрика vs НЕЗАВИСИМЫЙ frozen human-gold (не Dicta-vs-Dicta) · index.html НЕ трогать (Зал = library.html + library-ui.js) · **НЕ бейкать Dicta на высокой concurrency** (уронили сервис; default=2 + circuit-breaker) · commit+push+prod-verify по умолчанию · роли R1–R11 авто (R10 сегментация, R11 do-no-harm tripwire).
