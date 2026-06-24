# Library-export epic — CLOSED 2026-06-25

**★ READ FIRST:** `docs/planning/LIBRARY_EXPORT_T3_2026_06_25.md` (T3 closure + measurement data) ·
`docs/planning/LIBRARY_EXPORT_PROGRESS_T2_2026_06_23.md` (T2) · `docs/planning/LIBRARY_EXPORT_PERF_P_2026_06_24.md` (P) · `docs/PROJECT_ROLES.md` (R1–R10 auto) · CLAUDE.md.
Memory: [[project_library_export_progress]] · [[feedback_commit_push_deploy_default]] · [[feedback_studio_live_source_inline]] · [[feedback_headless_opfs_playwright]] · [[feedback_curl_utf8_egress_myth]].
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Studio `/index.html`, Зал `/library.html`).
Owner-инвариант: бескомпромиссное качество, без заглушек; R1–R10 авто; развилка → варианты + рекомендация, владелец решает.

## STATE — main = эпик-closure + P2-diagnostic doc-коммиты поверх `c778434`, SW `v3.10.82-export-perf-p` (кода/SW НЕ трогали — только docs/память)

**Эпик «Экспорт ZIP (с аудио)» ЗАВЕРШЁН.** 3 релиза отгружены+прод-верифицированы; T3 закрыт по данным замеров (кода не добавлено).
- **v3.10.80** (`d9e7c0e`): live-прогресс + STORE для аудио + 8с таймаут (починка «висит»).
- **v3.10.81 T2** (`171a24e`): премиум-UX — пре-флайт / «только метаданные» / карточка / Отмена / чип. Движок `v3ExportRunLocal()` + `v3Export*` INLINE в `public/index.html`.
- **v3.10.82 P** (`c778434`): сервер `X-Bulk` DB-free путь /api/audio + параллелизм 6→12. Аудио-байты ТОЛЬКО на сервере (нет OPFS/SW-cache).

## T3 — ❌ ЗАКРЫТ (гейт §0 измерен: фризы/память НЕ проблема; владелец решил закрыть 2026-06-25)

**Гейт-вопрос:** после P+STORE фризы UI / память при сборке 360-МБ blob всё ещё реальная проблема? → **НЕТ** (два независимых замера).
- **Шаг 0 (Node-изоляция, `scratchpad/pack-bench.js`, JSZip 3.10.1):** `generateAsync` кооперативно чанкуется (44.5K уступок), худший стол event-loop'а **71–76мс**; пик памяти nodebuffer ~720МБ / uint8array worst-case ~1.44ГБ; завершается штатно.
- **Шаг 2 (боевой Chrome desktop, eval-реплика прод-логики, профиль владельца 8906/345МБ, 16.1 мин):**
  - **Джанк:** фаза audio — НОЛЬ просадок (0 кадров >50мс на ~57K кадрах/15мин, 60fps); фаза pack — **один блик 167мс** (1 longtask 123мс).
  - **Память:** пик JS-heap **828МБ**, но `measureUserAgentSpecificMemory` всего **418МБ** ⇒ Chrome держит Blob ВНЕ JS-памяти агента (disk-backed) ⇒ FSA-стриминг убрал бы то, что и так off-heap → выигрыш маргинальный. Десктоп-безопасно (20% от лимита 4192МБ). baseline 27МБ; after-fetch 395МБ.
  - **Настоящее узкое место — ФЕТЧ ~16 мин** (темп деградировал 13→5/с, 48 таймаутов = 0.54%). T3 (Worker+FSA) фетч НЕ ускоряет.
- **Вывод:** Worker чинит блик 167мс (не оправдан); FSA маргинален. **Закрыли эпик.** Вердикт-док `docs/planning/LIBRARY_EXPORT_T3_2026_06_25.md`.

**Инструмент-урок (Kapture):** клики (CDP input) требуют активной Kapture-панели в DevTools + фокус вкладки (иначе timeout); read-ops (dom/elements/scroll) работают всегда; **`mcp__kapture__evaluate`** доступен ТОЛЬКО после «Allow JavaScript Execution» владельцем — им и гнали реплику (eval-инжект, не клики). Прод оказался `crossOriginIsolated:true` → `measureUserAgentSpecificMemory()` доступен. Замер-реплика на `window.__expRun` (fire-and-forget т.к. eval-таймаут 60с < прогон), опрос между фоновыми паузами.

## P2 (скорость фетча) — ❌ ИССЛЕДОВАН + ОТКЛОНЁН 2026-06-25 (диагностика, данные в LIBRARY_EXPORT_PERF_P §«P2 … ОТКЛОНЁН»)
Гейт «round-trips доминируют?» — НЕТ. Kapture eval, холодная сеть `no-store`, разные срезы ключей:
- Одиночный round-trip **95 мс** (p90 112), healthz RTT 86 мс → НЕ round-trip-bound.
- Агрегат НЕ растёт с параллелизмом: conc 1→0.14 / 6→0.35 / 12→0.39 / 24→0.45 MB/s (плато ~0.4), латентность раздувается до 10с.
- Одиночный непрерывный стрим 3.3 МБ: ~0.34 MB/s — тот же потолок.
- **Вывод: полоса ~0.4 MB/s (~3 Мбит/с) клиент↔origin** = общий потолок (не запрос-накладные, не сервер: бокс здоров). 360 МБ ÷ 0.4 = ~15 мин при 1 запросе == при 8906 → **batch физику не обходит, НЕ строим.**

## Опц. будущее (НЕ эпик)
- **Реальные рычаги по скорости** (раз дело в полосе): «только метаданные» (УЖЕ в T2, аудио лениво на приёмнике) · сторона канала/VPN (Hetzner egress гигабитный → потолок у владельца; на быстром канале текущий код уже быстрый) · опц. микро-твик **conc 12→6** (полоса насыщается на 6; на 12 только латентность+таймауты; одна строка + SW-бамп).
- **Лёгкий retry** для ~0.5% клипов, что уходят в `missing_audio.json` на длинных прогонах (один проход, 8с таймаут, без повтора).
- Экспорт-поверхность в Зале (`library.html`); более богатые docs по мобайл-импорту.

## Standing backlog (вне эпика)
- 🔑 **Ротация AUDIO_UPLOAD_TOKEN + Gemini + GCP** — засвечены в чате, висит (security/ops). Поднять перед публикацией/наполнением корпуса.
- 47097 Yiddish; B2-retention в дашборде (privacy, Direction 11 — сначала PROPOSE).

## Norms (били раньше)
- **Commit+push to `main` = deploy (Coolify) по умолчанию** для verified-фиксов с зелёными гейтами [[feedback_commit_push_deploy_default]] / [[feedback_autonomous_commit_push]].
- Studio live source = `index.html` INLINE (`public/check_script.js` = мёртвая копия) [[feedback_studio_live_source_inline]].
- Бамп `sw.js CACHE_VERSION` на ЛЮБОЕ изменение index.html/locale/shell. Прод-верифи Node-fetch (не Windows curl).
- Гейты (если тронут код): `smoke:i18n`, `smoke:reader-parity`, `test:api-smoke` (если server.js), `node --check`. @380px+RTL для UI.
- `git commit -F - <<'EOF'` (email `<…>` в `-m` ломает шелл). Прод-деплой ~60–105с. Свежесть в браузере = тост «Обновить»→reload→проба нового символа перед тестом.
