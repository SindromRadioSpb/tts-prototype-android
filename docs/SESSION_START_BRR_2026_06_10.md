# BRR / Corpus OS — session-start prompt (2026-06-10, post-outage recovery)

> Скопируй блок ниже целиком в новую сессию Claude Code. Он самодостаточен: роли, инварианты,
> сверенное состояние, отменённый аудит, порядок работ с гейтами, стоп-лист. Durable-состояние
> также в `.remember/remember.md` (incident note).

---

```
КОНТЕКСТ. Это LinguistPro (Node.js PWA, билингвальная иврит↔русский библиотека Ben-Yehuda Reading
Room / BRR). Применяй роль-линзы R1–R8 автоматически (canon в docs/PROJECT_ROLES.md). Инвариант
владельца ДОСЛОВНО: «бескомпромиссное качество, без заглушек». R1-инвариант: MT НЕ выдавать за
human-proofread, TTS НЕ называть native — честный provenance/metadata всегда (review_status='machine').

СТОП-УСЛОВИЯ ВЛАДЕЛЬЦА (соблюдать без исключений):
- КОММИТ/ПУШ/ДЕПЛОЙ — ТОЛЬКО ПО МОЕЙ ЯВНОЙ ПРОСЬБЕ.
- index.html НЕ трогать до Stage 2.
- ПРОД-ВЕРИФИКАЦИЯ ОБЯЗАТЕЛЬНА (проверять на linguistpro.kolosei.com, не только локально).
- Никаких длинных задач без моей команды.

🔑 ЖДЁТ МЕНЯ (security, моё действие): ротация Gemini-ключа (светился в чате прошлой сессии) и
старого GCP TTS-ключа. Напоминай, пока не подтвержу.

СВЕРЕННОЕ СОСТОЯНИЕ (reconcile сделан 2026-06-10 после аварии-выключения; НЕ перепроверять с нуля,
НЕ «продолжать» старый аудит):
- Git: origin/main = f336a04. Локально впереди 5 коммитов d96cbfc→12ca24a (BRR-P0-006 foundation+docs),
  НЕ запушены. Modified (uncommitted, 4): scripts/premium/run-corpus-prebake.js — HARDENING (FLUSH_WORKS,
  WORK_TIMEOUT, withTimeout, nextShardSeq @ строки 71–289); + 3 актуализированных дока 2026-06-10
  (docs/BEN_YEHUDA_CURRENT_STATE_2026_06_09.md §7.5/§8, docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md §4b,
  docs/planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md P0-006). Untracked (5):
  apply-canon-corrections.js, verify-bake-shards.js, conj-prefix-browser-check.js,
  docs/UX_AUDIT_2026_05_29.md, docs/SESSION_START_BRR_2026_06_10.md.
- Бейк --limit 100 ЗАВЕРШЁН ЧИСТО до аварии. Ledger: done 100 · pending 24541 · failed 0 ·
  deferred-giant 0 of 24641 · 7 shards. gemini today 0/1500. last_error = смоук watchdog
  (work 21 exceeded 1ms) — НЕ настоящий сбой. Резюм вперёд = просто --bake (ledger-based).
- Замер масштаба: 26,455 works ≈ 141K Gemini-запросов ≈ ~95 дней free-tier ($0). Аудио ХВОСТА
  предбейкать НЕЛЬЗЯ (~288 GB, ~98 WaveNet-free-месяцев) → on-demand computed-key + LRU (решение C
  / BRR-P0-011). Curated canon (79) остаётся pre-baked keyless WaveNet.

АУДИТ 79-ТЕКСТОВ (workflow w5q3tbm8m) = ОТМЕНЁН / DEFERRED. НЕ перезапускать.
- .tmp/benyehuda/_audit/b-000..259.json = только ВХОДНЫЕ батчи (6495 строк), НЕ вердикты.
- Доверенного confirmed[] НЕ произведено (прогон деградировал на session-limit → confirmed:0 по
  ~138/260; затем авария). На диске нет corrections/verdict-файлов.
- Замена: дешёвый точечный R7-сэмплинг по era/register/прозе (где слабее Dicta) + правки по жалобам
  пользователей. Gemini-MT-as-default принят. apply-canon-corrections.js — durable-инструмент,
  НЕ запускать без доверенного confirmed[] и моего sign-off. Niqqud-правки отложены (меняют иврит →
  ре-кей аудио). Известная 1 живая ошибка в прод canon-v3: by-38/r74 «השיר הראשון» «וּבְיוֹם הַחֹדֶשׁ»
  → «И в новый день» (надо: новомесячье / Rosh Chodesh) — фиксить только в общем доверенном проходе.

ПОРЯДОК РАБОТ (длинное — только по моей отдельной команде; гейты — обязательны):

  [1] Я ротирую ключи (моё действие — напомни).

  [2] КОММИТ hardening + incident/recovery docs (БЕЗ push, БЕЗ _audit-мусора, БЕЗ применения
      corrections). Двумя шагами:
      (2a) runner hardening + verify-bake-shards.js + 3 актуализированных дока 2026-06-10
           (CURRENT_STATE §7.5/§8, RUNNER_PLAN §4b, BACKLOG P0-006) + docs/SESSION_START_BRR_2026_06_10.md
           (+ .remember incident).
      (2b) apply-canon-corrections.js как durable-INACTIVE инструмент (есть --dry-run, проверка
           старого значения перед патчем, honest edit_meta, review_status остаётся machine; в шапке
           документировано: inactive until trusted confirmed[]).
      Перед коммитом прогнать гейты:
        node --test tests/premium/corpusLedger.test.js
        npm run smoke:benyehuda-ingest
        npm run smoke:corpus
        node scripts/premium/verify-bake-shards.js
        node scripts/premium/run-corpus-prebake.js --status
      _audit/b-NNN.json НЕ вводить в tracked state (оставить в .tmp или удалить).

  [3] GIANT-PASS (Проход-2) — следующий кодовый инкремент. deferred-giant → chapterized parts:
      part_index / total_parts / work_byehuda_id / work_title; никаких монолитных гигантов.
      Тесты на 2–3 реальных длинных works на ИЗОЛИРОВАННОМ/temp ledger (НЕ портить реальный
      .tmp/benyehuda/prebake-ledger.json). Отдельный smoke: гигант не попадает в один огромный text.

  [4] Параллельно (doc-only, БЕЗ runtime-кода) — финализировать delivery D1–D5 в
      docs/BEN_YEHUDA_DELIVERY_26K_PLAN.md по решениям:
      D1 catalog: catalog-vN.json (маленький index) + shard-manifests по tier/era/author-prefix;
                  per-work JSON/ZIP отдельно, served-on-open.
      D2 OPFS cap: soft cap text/cache 150–250 MB; audio отдельно 250–500 MB (configurable); LRU обяз.
      D3 tier-publishing: known-era+short → rest-tier → giants отдельно.
      D4 offline packs: НЕ по умолчанию; только explicit «download shelf/era pack».
      D5 SW precache: только shell + минимальный catalog index; works/shards/audio НЕ precache-ить.

  [5] RESUME bake вперёд (work 101+): known-era, контролируемо — сначала --limit 250/500, затем
      daily по quota. rest-tier/unknown prose — ТОЛЬКО после niqqud-probe на 20–50 rest works
      (Dicta-cloud уже показал throttle; ~4.63M unvocalized-вызовов в плане). По итогу probe решить:
      Dicta-cloud multipass+backoff vs local niqqud sidecar.

  [6] BRR-P0-011 computed-key audio ДО масштабной доставки: row text + profile → computed assetKey →
      HEAD /api/audio/:key; хвост on-demand + LRU (не хранить audio_asset_key на каждой строке —
      тысячи audio-link rows уже утяжелили first-import canon-v3).

  [7] BRR-P1-013: hardening /api/audio/prefetch/start (второй BYOK-funded write-path в audio-cache)
      ДО публичного включения on-demand audio. owner-token gate туда нельзя (сломает legit
      in-browser self-prefetch) → per-IP cap / per-session quota / MB-day / binding к BYOK-session.
      НЕ блокирует text/translation/niqqud runner.

НЕ ДЕЛАТЬ:
- НЕ перезапускать full jury audit (w5q3tbm8m).
- НЕ запускать apply-canon-corrections.js без доверенного confirmed[] + моего sign-off.
- НЕ делать niqqud-corrections сейчас (меняют иврит → ломают audio-key semantics).
- НЕ пушить в main до чистых гейтов и моего отдельного go.
- НЕ начинать P1-feature-polish (scaffold console / i+1 / karaoke / word-status) — стратегический
  фокус = corpus operating system (delivery/tiering/scaffolding-order), а не feature push.
  Главные риски по decision brief: Зал не должен стать «index.html lite»; неградуированный корпус
  нельзя сваливать на пользователя.

ПЕРВОЕ ДЕЙСТВИЕ В СЕССИИ: прочитать .remember/remember.md (incident note) + этот файл, затем коротко
подтвердить сверенное состояние (git status + --status), и ЖДАТЬ моей команды на конкретный шаг
([2]/[3]/[4]). Без длинных задач до моей отмашки.
```

---

## Durable-указатели (для человека)
- Incident/recovery: `.remember/remember.md`.
- Runner: `scripts/premium/run-corpus-prebake.js` (hardened) · статус: `--status` → `.tmp/benyehuda/run-status.json`.
- Верификатор: `scripts/premium/verify-bake-shards.js`. Корректор (inactive): `scripts/premium/apply-canon-corrections.js`.
- Сборка canon: `scripts/premium/build-canon-v3.js` + `.tmp/benyehuda-audio/stamp-manifest.json`.
- Планы: `docs/BEN_YEHUDA_CURRENT_STATE_2026_06_09.md`, `docs/BEN_YEHUDA_DELIVERY_26K_PLAN.md` (D1–D5 draft).
- Гейты: `tests/premium/corpusLedger.test.js`, `npm run smoke:benyehuda-ingest|smoke:corpus|smoke:room|smoke:reader-parity|smoke:audio-prebake`.
