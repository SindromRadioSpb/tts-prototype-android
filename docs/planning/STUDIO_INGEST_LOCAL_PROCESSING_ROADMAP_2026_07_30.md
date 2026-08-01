# Студия: импорт, медиа-артефакты и локальная обработка — roadmap

> **Дата:** 2026-07-30
> **Статус:** 🟢 L0/L1 invite beta завершены; L2 demand-triggered и не начат; L3a
> Correctable Media Package shipped через `v3.11.282` (`5c523933`; core `097d212d`,
> continuity `821460c4`, media-review UX `44b216bc`). L3a.3 Material Revision Workspace
> foundation shipped в `v3.11.283`; Playback Review UX owner-approved для реализации,
> production rollout и live-test, затем L3b Artifact Continuity.
> **Срез кода:** production/origin `82a392e6` (`v3.11.283`), browser migrations `46`.
> **Место в каноне:** специализированный сквозной трек общего roadmap
> `STUDIO_INGEST_ROADMAP_2026_07_30.md`. Здесь определён local-processing L0–L6;
> общий capability ledger, форматы, Media Package, образовательные сценарии и единый порядок
> находятся в master-roadmap. Исходные решения/история — в
> `STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md`.

## 0. Директива и терминология

Владелец потребовал:

1. актуализировать и формализовать roadmap импорта;
2. сделать **локальную обработку первым классом архитектуры**, а не частным обходом для
   YouTube без субтитров;
3. использовать доступный GPU для больших/множественных файлов и рассмотреть локальные
   альтернативы не только облачному ASR, но также TTS, переводу, OCR, упрощению и другим
   дорогим или privacy-чувствительным операциям.

**Whisper и основные модели ivrit.ai — STT/ASR (речь → текст), не TTS.** Локальный TTS
(текст → речь) — отдельный трек. ivrit.ai также ведёт Hebrew TTS Arena, но это источник
сравнений/кандидатов, а не автоматически выбранный production-provider.

**Local** в этом roadmap означает: байты пользовательского источника и inference остаются
на его машине; приложение общается с явно установленным loopback-companion. Прод-сервер
не является прокси к локальной модели и не получает исходный файл.

## 1. Текущий capability ledger

| Возможность | Статус на 2026-07-30 | Следствие |
|---|---|---|
| URL статьи → текст | ✅ SHIPPED | S1 закрыт |
| PDF/DOCX, фото OCR | ✅ SHIPPED | PDF/изображения пока облачный Gemini; DOCX локально-детерминирован |
| Любой текст → иврит-таблица | ✅ SHIPPED | S3 закрыт |
| Аудио/загруженное видео → ASR → таблица | ✅ SHIPPED | Gemini BYOK; ≤3ч/≤300МБ |
| Длинный ASR и большие таблицы | ✅ SHIPPED | физическая MP3-нарезка, чанки 15 мин/120 строк, progressive render |
| VTT/SRT/YouTube transcript → караоке | ✅ SHIPPED | пользователь приносит дорожку; серверный caption-fetch NO-GO |
| «Упростить до моего уровня» | ✅ SHIPPED | Gemini BYOK; A1–B2; отдельный derived-текст |
| Local niqqud | 🟡 код есть | `ai-local`: DictaBERT-menaked на CPU; не часть нового импорта end-to-end |
| Local перевод | 🟡 код есть | `ai-local`: MADLAD-400 10B, CT2 int8_float16, ~6.5ГБ; provider существует |
| Local Hebrew TTS | 🟠 эксперимент | Phonikud/Piper интегрирован, но выключен: качество слишком роботизировано; license-mode ограничен |
| Browser local TTS | 🟠 каркас | provider/router/WASM есть; Hebrew-модель не staged, текущие local providers выключены политикой |
| Local ASR | 🟡 bounded engineering PASS | pinned turbo CT2; batch/browser/B+C закрыты, permanent integration не разрешена |
| Media package/редактор субтитров | ✅ SHIPPED L3a | local first-class versioned artifact; composite table/package portability и cross-device относятся к L3b |
| Resume после закрытия вкладки | ❌ нет полного job-ledger | критично для 1–3ч и batch |

Текущий `ai-local` на каноническом порту `127.0.0.1:8799` при аудите не запущен. Его
README всё ещё печатает старый порт `8765`, конфликтующий с AnkiConnect; до расширения
sidecar документацию и launcher надо свести к `docs/CONFIG.md` (`8799`).

## 2. Hardware truth и ресурсная модель

Владелец указал RTX 3080. Машина, на которой сделан этот аудит, через `nvidia-smi`
сообщает **NVIDIA GeForce RTX 3070, 8192 MiB**. Возможно, RTX 3080 находится на другой
машине; никакой capacity-план не может подменять это предположением.

L0 обязан сохранять hardware fingerprint в каждом замере:

```json
{
  "gpu": "...",
  "vram_mb": 8192,
  "driver": "...",
  "cuda": "...",
  "model": "...",
  "compute_type": "...",
  "batch_size": 1
}
```

Одна 8–10ГБ карта не должна одновременно держать MADLAD, Whisper и локальную LLM.
Используем уже заложенный lifecycle `load → warm → run → idle-unload`, но над ним нужен
**один GPU scheduler**: очередь, VRAM preflight, один тяжёлый residency-slot, cancel,
progress и честный `waiting_for_gpu`. Batch означает очередь файлов/окон, а не бесконтрольный
параллелизм.

## 3. Provider-neutral контракт

Cloud и local должны возвращать один канонический результат, чтобы таблица, караоке,
экспорт и тесты не знали о runtime:

```text
source bytes / OPFS reference
  → provider job (local | cloud)
  → raw provider output (immutable)
  → normalized transcript-v1 [{id,start,end?,text,speaker?}]
  → validation report (coverage/duplicates/timing/warnings)
  → table chunks
  → persisted media/caption/row mapping
```

Каждый результат несёт `selected_provider`, `actual_provider`, model id+revision, runtime,
hardware fingerprint, параметры decode, duration, RTF, warnings, checksum входа и codeVersion.
Fallback никогда не должен менять local → cloud молча: загрузка исходника наружу требует
отдельного явного согласия.

## 4. Новый локальный трек L0–L6

### L0 — foundation + benchmark packet (P0, первый слайс)

**Цель:** доказать реальную способность машины до продуктовой интеграции.

- исправить port/launcher drift `8765`→`8799`;
- inventory GPU/CUDA/cuDNN/VRAM/disk и модели с лицензиями/checksums;
- frozen gold: короткая чистая речь, разговор/подкаст, шум, несколько говорящих,
  117-мин дефектный файл S12, 3-часовой synthetic boundary, 20–50 малых файлов;
- общий runner cloud Gemini vs local candidates;
- метрики: CER/WER, полнота, дубли, median/p95 timing error, RTF, peak VRAM/RAM,
  warm/cold time, bytes uploaded, стоимость;
- артефакты в `docs/research/studio-local-processing/2026-07-30/`, без моделей/ключей.

**Exit:** hardware truth зафиксирован; один воспроизводимый runner; ни один кандидат не
объявлен победителем без независимого текста-эталона и timestamp-оракула.

### L1 — local Hebrew ASR (P0, рекомендуемый первый продуктовый local-slice)

Стартовая пара кандидатов:

1. `ivrit-ai/whisper-large-v3-turbo-ct2` + `faster-whisper`, `language="he"` — основной
   speed/quality-кандидат, Apache-2.0, CTranslate2-формат;
2. `ivrit-ai/whisper-large-v3-ct2` — quality challenger, не default до замера VRAM/RTF.

Почему это сильнее текущего cloud-пути для больших файлов: модель физически получает
локальные аудиочанки, не платит за повтор, не зависит от дневной квоты, допускает batch и
не отправляет личную речь наружу. Но timestamp Whisper тоже не является истиной: сохраняем
действующие независимые coverage/replay/clock gates и сравниваем с S12.5–S12.7 gold.

**Продукт:** выбор `Авто / Локально / Gemini`; capability probe; оценка времени вместо $;
progress/cancel/resume; тот же `transcript-v1`; явная ошибка без скрытого cloud fallback.

**Exit:** local не хуже принятого порога качества, 117-мин файл без нулевых корзин/реплеев,
стабильный 3ч run, restart/resume, замер batch throughput и owner-listen/read acceptance.

### L2 — durable jobs + batch (P0/P1)

- `import-job-v1`: очередь файлов, состояние каждого окна, retry/error/cancel, timestamps;
- content-addressed raw/normalized outputs и бесплатный resume после reload/restart;
- выбор папки/нескольких файлов, bounded concurrency=1 по GPU и параллельный CPU I/O;
- итоговый отчёт `N succeeded / M failed` с причиной по каждому файлу;
- duplicate policy: открыть существующий / обновить / создать версию.

Без L2 «поддержка 3 часов» остаётся хрупкой: закрытие вкладки может уничтожить дорогой
прогон, а «много файлов» превращается в ручное повторение одного flow.

**Owner order update, 2026-07-31 — `DEFERRED / DEMAND-TRIGGERED`.** Для текущего owner-only
dogfood последовательный one-file flow достаточен, поэтому L2 не является оперативным beta-
блокером и не стартует автоматически. Решение сохраняет два независимо возвращаемых слайса:

- **L2a — single-job recovery/reattach:** browser сохраняет/discovers job ID и возвращается к
  sidecar job после reload/закрытия вкладки/рестарта. Старт-триггер: реальная потеря видимого job,
  stranded completed job или обычные прогоны, для которых повтор уже неприемлем;
- **L2b — batch/queue:** несколько файлов, bounded GPU concurrency=1, отчёт и duplicate policy.
  Старт-триггер: фактическая потребность владельца/доверенных пользователей регулярно обрабатывать
  примерно 3–5+ файлов как один набор.

Это не `DONE` и не отмена: архитектурный контракт выше остаётся каноном, а sidecar уже сохраняет
jobs/checkpoints и имеет resume/retry API. До триггера не строим очередь и новый durable browser
ledger «на будущее».

### L3 — Media Package + subtitle editor (P1)

- сильная связь `media_sha256 ↔ caption_track_id`;
- raw VTT/SRT отдельно от normalized/merged segments;
- дорожки `original`, `user_corrected`, `translated`, `simplified`;
- локальный `<video>` player + внешний VTT/SRT;
- split/merge, edit text, offset/drift, speaker, replay-range;
- персистентные `source_segment_id`, `source_line_index`, отдельный `sentence_index`;
- экспорт VTT/SRT/LRC и полный/лёгкий ZIP с relink по SHA-256.

Это превращает импорт из одноразовой конвертации в учебный объект для shadowing,
диктанта, повтора фрагмента, заметок по таймкоду и сравнения original↔simplified.

### L4 — productize уже существующие local NLP providers (P1)

- MADLAD local перевод: включить в тот же provider-neutral chunk path, проверить Hebrew↔Russian,
  mapping fidelity и качество против текущих providers;
- DictaBERT-menaked: использовать как локального кандидата для nikud, но не смешивать
  morphology truth с модельным выводом;
- GPU scheduler не держит MADLAD одновременно с ASR;
- одинаковый provenance и независимые R1/R11 gates для local/cloud.

### L5 — diarization/VAD/alignment (P1 после L1)

- VAD перед ASR для длинной тишины и более честной оценки времени;
- speaker diarization для интервью/уроков/подкастов;
- speaker label становится metadata, не частью учебного Hebrew-текста;
- word timestamps разрешаются только после gold-замера; segment-level остаётся default;
- локальное выравнивание готовой корректной расшифровки с медиа — отдельный режим, не
  подмена ASR.

### L6 — local TTS, OCR и LLM (R&D, не обещание)

**TTS.** Существующий Phonikud/Piper доказывает plumbing, но не продуктовую планку: код
выключен из-за роботизированного Hebrew и лицензионных ограничений. Следующий шаг — frozen
listen-set и слепое сравнение кандидатов из Hebrew TTS Arena/открытых model cards с online
baseline: разборчивость, никуд/ударение, имена, числа, mixed Hebrew/Russian, prosody, latency,
лицензия. Только прошедшая модель получает provider-status; «бесплатно» не компенсирует плохое
произношение.

**OCR.** Локальный Hebrew OCR полезен для приватных/пакетных PDF и HEIC, но model choice только
после gold по RTL-порядку, никуду, таблицам и сканам. До этого остаётся Gemini OCR + явное
согласие.

**Local LLM.** RTX-класс позволяет исследовать quantized small/medium models для чернового
упрощения, metadata, chaptering и подсказок, но не утверждать Hebrew quality заранее.
Таблица/никуд/морфология сохраняют строгие валидаторы; local LLM не становится authority.
Запускается после L1/L2, потому что ASR даёт более доказуемую ценность и меньше риск.

## 5. Сведённый roadmap и порядок

| Приоритет | Слайс | Статус | Условие старта/выхода |
|---|---|---|---|
| P0 | S12.7 clock-drift | ✅ SHIPPED v3.11.270 | гейт+переспрос+blind-деградация, `4a17686d` |
| P0 | **L0 local benchmark** | ✅ DONE | pinned turbo CT2 GO; full large-v3 NO-GO как default |
| P0 | Провенанс/schema B | ✅ BOUNDED DONE | backup parity + portable segment identity; schema migration не потребовалась |
| P0 | UX/data C | ✅ BOUNDED DONE | explicit SHA dedupe + `text_audio_asset_key` round-trip |
| P0 | **L1 local ivrit.ai ASR** | 🟡 ENGINEERING PASS | batch/browser/B+C PASS; quality studies recommended; permanent NO-GO pending separate owner decision |
| P0 | **L1 Windows invite beta enablement** | 🟢 CHROME INVITE BETA LIVE | Companion beta.2 plus pairing help deployed as `v3.11.277`; install/decode/uninstall and served RU/HE mobile UI PASS; unsigned owner/trusted distribution approved; output is first-draft quality; quality studies recommended; Edge excluded |
| P0/P1 | **L2a recovery / L2b batch** | ⏸ DEFERRED / DEMAND-TRIGGERED | L2a: реальная reload/job-loss боль; L2b: регулярные 3–5+ файлов |
| P1 | **L3a Correctable Media Package/editor** | ✅ SHIPPED v3.11.282 | v45 + immutable raw/corrected revisions + editor/reopen + source-player sync + VTT/SRT/slim round-trip; residual owner-live ceremonies tracked in packet |
| P1 | **L3a.3 Material Revision Workspace** | 🟢 FOUNDATION SHIPPED v3.11.283; PLAYBACK REVIEW IMPLEMENTATION APPROVED | two-layer editor, table revisions, authority and deterministic affected-only update shipped; exact cue↔row follow, contextual anchor and field-review modes are the active bounded UX slice |
| P1 | **L3b Artifact Continuity** | 🟢 OWNER-APPROVED PLANNING | Artifact Graph + Portable Learning Package v2 + real iPhone manual continuity + Import Center over Workspace contract; automatic sync/Hermes separately gated |
| P1 | **L4 local translation+nikud** | ⬜ | shared scheduler; independent quality gates |
| P1 | **L5 diarization/alignment** | ⬜ | L1 stable; speaker/timing gold |
| P2/R&D | **L6 TTS/OCR/local LLM** | ⬜ | model+license+quality measurement; no quality downgrade |
| P2 | S7 karaoke export | folded into L3 | VTT/SRT/LRC + media bundle |
| P2 | S6 audio translation | folded into L4 | local/cloud provider parity |
| P2 | S5b remote video without captions | parked | demand + lawful acquisition/companion decision |
| Triggered | S10 PWA share_target | parked | proven Android demand |
| Anti | server yt-dlp, real-time, song alignment | NO-GO | reopen only by explicit owner decision + evidence |

Adversarial L3a design одобрен; implementation shipped и получил два owner-evidence fixes:
`STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md`.
Следующий канон исследования/порядка:
`docs/research/studio-ingest-artifact-continuity/2026-08-01/REPORT.md` и
`STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md`. Утверждённый Workspace contract:
`STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`.
Утверждение planning/product direction не
разрешает implementation, automatic cloud/media sync, Hermes mutations или production scope.

**Рекомендуемая последовательность:** принять bounded L1 engineering/evidence closure, затем
отдельным решением определить достаточный owner/human acceptance и только отдельно разрешать
paired Gemini cloud spend до permanent integration. L2/L3 не
стартуют автоматически из факта наличия L1-кода. L4 может идти после стабилизации scheduler;
L5/L6 только после новых измерений и разрешений.

Windows beta enablement on 2026-07-31 adds a default-off per-user Companion and product onboarding,
but does not change that sequence. The current self-contained unsigned internal installer is
1,766,465,078 bytes. The owner approved its out-of-band use by the owner and personally trusted
users, accepted the noncommercial redistribution/license decision for that cohort, and moved the
human-gold check to post-deploy beta observation without marking it PASS. Public hosting/general
distribution and permanent integration remain separate decisions. Chrome/Edge passed on the local
product origin; the owner authorized a production-origin browser ceremony without server mutation.
Chrome pairing and exact-model readiness passed on served production `v3.11.272`; a real-audio
30:05.82 owner-selected Local job also completed with all integrity gates PASS (`RTF 0.03685`),
using the loopback API plus production Origin header after the Chrome-extension file chooser failed.
The owner then completed native Chrome file transfer, Local processing, Library save, and export in
the product UI. The exact export comparison shows `22.98%` token disagreement against Gemini—not
human-gold WER—and material entity/meaning errors; Local is accepted only as a draft requiring
human correction. Edge is excluded from the first production beta by owner decision. The new
onboarding is live and verified as `v3.11.276` (`d445c7e8`) for the normal non-DevTools Chrome beta
flow. Runtime exposure is on, enrollment remains explicit and browser-local, Gemini remains
default, and there is no implicit fallback. Production disk is now 90% used with 3.7 GB free; no
cleanup was performed, and another build/deploy requires a separate disk decision.
Firefox remains outside the first beta support matrix.

The pairing-discoverability follow-up produced unsigned Companion beta.2 (1,766,474,350 bytes,
SHA-256 `32ac13e03417c358dfcc04f10a50132fd9c7ad7f308076b6f75d82661f68c7ba`) with a dedicated
copy-token path and bundled RU/EN/HE guide. The owner machine passed an in-place beta.1 → beta.2
update without losing its exact model or two completed jobs. Web onboarding/help `v3.11.277` is
deployed from `381233e0`. Bounded cleanup preserved the active image plus two rollbacks and moved
production disk from 90%/3.7 GB free to 78%/8.0 GB free after the build. Served RU/LTR and HE/RTL
help passed at 380x844. Extension control timed out on the browser confirm, and the owner later
completed that exact native Chrome ceremony successfully.

Owner decision on 2026-07-31 reclassifies the ten Mia listen/read checkpoints, the 12–15 minute/
four-speaker beta human-gold study, and the former 60-minute/12-speaker permanent study as
recommended rather than mandatory. Permanent integration remains `NO-GO` only pending a separate
owner authorization and release-policy decision, not pending those studies.

The owner subsequently completed the final native Chrome `v3.11.277` ceremony successfully.
Owner-only dogfood remains in progress and is non-blocking. Deployed `v3.11.279` makes
successful connection visible as **Connected/Подключено/מחובר** in both onboarding and
Import → File and keeps the Import pairing/model result immediately below its `127.0.0.1` privacy
hint. Production image `88977240066cddba8161bd2af10fed298bd8fb56` passed served-version,
health/DB/migrations and fresh RU/LTR plus HE/RTL 380×844 browser verification. The approved order
parks L2 as demand-triggered:
single-job recovery returns on real reload/job-loss friction, while multi-file batch returns only
on demonstrated 3–5+ file demand.

## 6. Обязательные артефакты каждого local-slice

1. `hardware.json` — GPU/VRAM/driver/CUDA/runtime.
2. `model-manifest.json` — model id, exact revision, checksum, license, size.
3. `run-manifest.json` — input hash, параметры, времена, peak memory, provider/model/code.
4. `raw-output.*` — неизменённый ответ модели.
5. `normalized-transcript-v1.json` / соответствующий канонический output.
6. `quality-report.json` + читаемый `README.md` — gold comparison и known failures.
7. `acceptance.md` — команды, commit, устройство, что проверено владельцем.

Модели, пользовательские медиа и ключи не коммитятся. В репозитории остаются manifests,
малые законные fixtures и воспроизводимые runners.

## 7. Безопасность, privacy и лицензии

- loopback companion bind только `127.0.0.1`, не LAN;
- случайный pairing token, Origin allowlist, CSRF-защита, request/body caps;
- браузер→loopback и Private Network Access проверяются отдельно на Chrome/Edge/Firefox;
- явный consent перед cloud fallback или загрузкой источника;
- raw media TTL/удаление и «удалить job+артефакты» в UI;
- лицензия фиксируется на уровне модели, не только репозитория/runtime;
- research-only/noncommercial модель не становится production default;
- derived≠asserted: model output всегда несёт provider/model/revision и quality warnings.

## 8. Источники решения

- ivrit.ai organization/models: <https://huggingface.co/ivrit-ai>
- Hebrew turbo CT2 model: <https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ct2>
- Hebrew full large-v3 CT2 model: <https://huggingface.co/ivrit-ai/whisper-large-v3-ct2>
- faster-whisper runtime: <https://github.com/SYSTRAN/faster-whisper>
- ivrit.ai Hebrew transcription leaderboard:
  <https://huggingface.co/spaces/ivrit-ai/hebrew-transcription-leaderboard>
- ivrit.ai Hebrew TTS Arena: <https://huggingface.co/spaces/ivrit-ai/TTS-Arena-Hebrew>
- текущие repo-аудиты: `docs/LOCAL_NEURAL_TTS_PIPER.md`,
  `docs/TTS_HEBREW_FEASIBILITY_AUDIT.md`, `docs/TTS_HEBREW_WEB_WASM_FEASIBILITY.md`,
  `ai-local/README.md`, `docs/CONFIG.md`.
