# Студия: импорт, медиа-артефакты и локальная обработка — roadmap

> **Дата:** 2026-07-30
> **Статус:** 🟡 L0 завершён; ограниченная default-off L1-A→L1-E реализация выполнена и
> имеет `PASS_WITH_OPEN_ACCEPTANCE_GATES`. Permanent integration/provider policy — NO-GO до
> отдельного решения владельца и закрытия human/browser/B+C gates.
> **Срез кода:** `4a17686d` (S12.7 SHIPPED v3.11.270).
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
| Local ASR | 🟡 default-off L1 code/evidence | pinned turbo CT2; permanent integration и provider defaults не разрешены |
| Media package/редактор субтитров | ❌ нет | субтитры пока вход, а не переносимый versioned-артефакт |
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
| P0 | Провенанс/schema B | ⬜ | backup parity + persist segment identity + развод имён |
| P0 | UX/data C | ⬜ | dedupe + `text_audio_asset_key` round-trip |
| P0 | **L1 local ivrit.ai ASR** | 🟡 LIMITED DONE | default-off engineering PASS; human/browser/B+C acceptance open; permanent NO-GO |
| P0/P1 | **L2 resumable jobs + batch** | ⬜ | L1 contract stable; restart/fault tests |
| P1 | **L3 Media Package/editor** | ⬜ | segment identity closed; round-trip artifact |
| P1 | **L4 local translation+nikud** | ⬜ | shared scheduler; independent quality gates |
| P1 | **L5 diarization/alignment** | ⬜ | L1 stable; speaker/timing gold |
| P2/R&D | **L6 TTS/OCR/local LLM** | ⬜ | model+license+quality measurement; no quality downgrade |
| P2 | S7 karaoke export | folded into L3 | VTT/SRT/LRC + media bundle |
| P2 | S6 audio translation | folded into L4 | local/cloud provider parity |
| P2 | S5b remote video without captions | parked | demand + lawful acquisition/companion decision |
| Triggered | S10 PWA share_target | parked | proven Android demand |
| Anti | server yt-dlp, real-time, song alignment | NO-GO | reopen only by explicit owner decision + evidence |

**Рекомендуемая последовательность:** принять bounded L1 engineering packet, затем отдельным
решением закрыть batch/browser/human acceptance и B+C до permanent integration. L2/L3 не
стартуют автоматически из факта наличия L1-кода. L4 может идти после стабилизации scheduler;
L5/L6 только после новых измерений и разрешений.

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
