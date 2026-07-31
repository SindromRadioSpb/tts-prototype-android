# Studio Ingest L1 — local Hebrew ASR design / decision packet

> **Дата:** 2026-07-30
>
> **Статус:** 🟡 GROUNDED DESIGN, ждёт отдельного утверждения владельца.
>
> **Срез кода:** `3e5a9a3a` (`research: benchmark local Hebrew ASR for Studio Ingest L0`).
>
> **Разрешённое действие этой сессии:** только дизайн и документация.
>
> **Не разрешено этим документом:** реализация, permanent integration, изменение продукта,
> схемы, production, provider defaults, автоматическая установка модели или cloud fallback.

## 0. Решение, которое предлагается владельцу

**Рекомендация: GO к ограниченной реализации L1-A→L1-E только после отдельного утверждения
этого packet.** Реализация должна строиться вокруг единственного локального default-кандидата:

```text
model        ivrit-ai/whisper-large-v3-turbo-ct2
revision     72ad623a37947395efcc3933132353790e5a12f5
model.bin    db2a2265aa012c16c7db9edda3d699c99f984efdd3f2e22a72a8ce7e9720f3a2
runtime      faster-whisper 1.1.1 / CTranslate2 4.5.0
device       cuda
compute      float16
language     he
beam_size    5
condition_on_previous_text false
vad_filter   false
word_timestamps false
```

`ivrit-ai/whisper-large-v3-ct2` **не входит** ни в default, ни в fallback-chain L1. Он остаётся
только offline comparison candidate. Переход на int8/int8_float16, другую revision, VAD,
word timestamps, другую beam policy или другую модель — новый измеряемый кандидат, а не
«безопасная оптимизация» внутри L1.

L1 не имеет права объявлять локальный ASR permanent/product-ready, пока отдельно не закрыты:

1. расширенный human-gold Hebrew gate;
2. fault/cancel/restart/thermal/storage gates этого документа;
3. известные B+C долги общего roadmap (provenance/schema + UX/data integrity);
4. owner live-acceptance;
5. отдельное разрешение на permanent integration/provider policy.

## 1. Grounded inventory: что уже существует и чего реально нет

### 1.1 Доказано L0

| Факт | Доказательство | Следствие для L1 |
|---|---|---|
| Реальная машина — RTX 3070 8 GB | `hardware.json` | capacity policy строится для 8 GB, не для заявленной ранее RTX 3080 |
| Turbo FP16 прошёл весь workload | `quality-report.json` | это sole local default candidate |
| Peak GPU total 4,498 MiB; delta 2,330 MiB | bounded smoke | модель помещается, но это не разрешение на совместную residency с MADLAD |
| S12 RTF 0.0248; 3h boundary 0.0289 | local run manifest | целевой runtime overhead можно ограничить без догадок |
| S12/3h: zero-text=0, clock-distorted=0 | independent chunk report | S12.5–S12.7 остаются gates, а не удаляются как «cloud-only» |
| Batch-20 WER 2.60%, CER 0.93% | маленький human-gold | feasibility доказана, population-quality — нет |
| Podcast silver WER 20.66%, p95 timestamp 4.24s | independent `iw-orig`, не human gold | полезно для same-input сравнения, не для общего quality claim |
| Первый cold load 7.18s, cached-process load 2.03s | L0 report | короткий idle-unload безопаснее, чем вечная GPU residency |

### 1.2 Живой код на `3e5a9a3a`

- `public/js/asr-transcript.js` уже задаёт canonical 15-minute windows, 30-second overlap,
  text seam, completeness/density, anti-replay, clock-compression и честные `blind` ranges.
- `public/js/studio-import.js::runWindowedAsr` умеет in-memory resume между окнами и сохраняет
  `windowsMeta`, но не имеет cancel signal и не является durable job-ledger.
- `public/js/mp3-slice.js` физически режет только MP3. Видео, не-MP3 и single-window cloud path
  по-прежнему могут идти через `ranged-file`; для local L1 такого fallback быть не должно.
- `ai-local` уже имеет `ModelSlot`, lazy load, warmup, idle/manual unload и pressure monitor.
- Текущий `use_model()` намеренно допускает несколько параллельных inference requests; тест
  `test_concurrent_first_load_single_load` закрепляет это поведение. Единого тяжёлого GPU-slot
  между MADLAD и будущим ASR сейчас нет.
- Текущий pressure monitor реагирует после падения свободной VRAM ниже 768 MiB и выгружает
  только idle READY model. Это не admission-control, не thermal-control и не scheduler.
- `ai-local` bind'ится на loopback, но сейчас не имеет browser-facing pairing token, Origin
  allowlist, PNA/CORS policy и upload caps; публиковать текущую поверхность браузеру нельзя.
- Канонический порт — `8799` (`config.py`, `docs/CONFIG.md`, `start_all.ps1`), но
  `ai-local/README.md`, два server/UI hint и команды в нём ещё печатают stale `8765`.
  Этот packet фиксирует дрейф, но не исправляет его без отдельного docs/implementation scope.

## 2. Scope L1 и жёсткие non-goals

### В scope после отдельного GO

1. Secure loopback capability и explicit model install/verify.
2. Один локальный Hebrew ASR job для загруженного audio/video.
3. Формат-независимая физическая нарезка через ffmpeg до inference.
4. Pinned turbo FP16 worker и provider-neutral `transcript-v1`.
5. Независимые S12.5, S12.6, S12.7 verdicts.
6. Queue/admission, cancel, bounded restart-resume и ephemeral job storage.
7. Явное local failure без скрытого cloud upload.
8. Fault/thermal/3h/human-gold acceptance packet.

### Не в scope L1

- full large-v3 как default/fallback;
- diarization, VAD, word-level timestamps, forced alignment (L5);
- batch/folder UX и полноценный multi-job ledger (L2);
- Media Package/editor/schema migration (L3/B+C);
- local translation/nikud scheduler consumers productization (L4);
- TTS/OCR/local LLM;
- remote media acquisition;
- server/prod proxy к локальной машине;
- silent fallback, silent model download, silent compute-type downgrade;
- изменение текущего production provider default.

## 3. Выбранная архитектура

```text
browser Studio
  ├─ source bytes stay on owner machine
  ├─ explicit pairing token + Origin/PNA gate
  └─ loopback job API 127.0.0.1:8799
       ├─ control process: job state / scheduler / cancellation / TTL
       ├─ ffmpeg slicer: immutable physical PCM chunks
       ├─ one heavy-GPU residency slot
       └─ isolated ASR worker process: pinned turbo CT2 only
            ↓ raw per-chunk output
       provider-neutral normalization
            ↓
       independent S12.5 / S12.6 / S12.7 reports
            ↓
browser adapter → existing table/karaoke/OPFS path
```

### D1. Browser обращается прямо к loopback companion

Прод-сервер не проксирует запрос и не получает source bytes. Node `server.js` не может быть
путём `prod → user's localhost`. Разрешается только явный browser→loopback transport:

- bind только `127.0.0.1`/`::1`, LAN bind запрещён default-ом;
- случайный pairing token минимум 256 bit, не в URL и не в логах;
- versioned Origin allowlist; неизвестный/`null` Origin запрещён для mutation endpoints;
- явные CORS + Private Network Access headers;
- request cap 300 MiB и duration cap 3h сохраняют текущую продуктовую границу;
- model/job endpoints разделены; browser не передаёт произвольный filesystem path;
- Chrome/Edge/Firefox matrix является exit-gate, не допущением.

### D2. ASR inference живёт в отдельном worker process

Нынешний in-process `asyncio.to_thread()` не даёт гарантированно прервать CTranslate2 inference.
Control process поэтому не владеет CUDA model напрямую. Worker process владеет ровно одной
ASR model residency; hard cancel/driver error/OOM может завершить worker без остановки control
API. Незаписанный текущий chunk отбрасывается; только атомарно завершённые chunks являются
checkpoint.

### D3. Один heavy-GPU scheduler на ASR и MADLAD

`translator` и `asr` становятся взаимоисключающими heavy model classes. DictaBERT-menaked
остаётся CPU slot и не занимает heavy-GPU residency. Нельзя просто добавить третий независимый
`ModelSlot`: существующий lifecycle допускает конкурентный inference и не защищает 8 GB VRAM.

## 4. Физическая нарезка: единственный local transport

### 4.1 Два уровня, которые нельзя смешивать

1. **Canonical validation window:** те же границы, что даёт живой
   `AsrTranscript.asrWindows()` — nominal 900s, overlap 30s:
   `[0,900]`, `[870,1800]`, `[1770,2700]`, … . Это сохраняет существующий text seam и
   S12 regression fixtures.
2. **Physical media chunk:** отдельный файл, созданный до inference. Worker получает только
   этот файл и chunk-relative координаты; исходный media path worker не получает.

L0 использовал 900s WAV chunks без overlap. 30s overlap — сознательное сохранение текущего
product seam contract, которое надо заново измерить в L1: оно не объявляется уже доказанным L0.

### 4.2 Формат-независимый slicer

Для каждого window control process запускает bounded ffmpeg decode:

```text
input selected audio stream
  → accurate seek to startSec
  → duration endSec-startSec
  → 16 kHz, mono, PCM s16le WAV
  → temporary file
  → ffprobe/sample-count verification
  → SHA-256
  → atomic rename into job/chunks/
```

Обязательные поля chunk manifest:

```json
{
  "index": 1,
  "source_sha256": "...",
  "start_sec": 870.0,
  "end_sec": 1800.0,
  "expected_duration_sec": 930.0,
  "actual_samples": 14880000,
  "sample_rate": 16000,
  "channels": 1,
  "pcm": "s16le",
  "chunk_sha256": "...",
  "ffmpeg_version": "8.1",
  "audio_stream_index": 0
}
```

- Одно audio stream → выбирается и записывается в manifest.
- Несколько audio streams без однозначного default → job `WAITING_FOR_INPUT`; скрытый выбор
  дорожки запрещён.
- ffmpeg decode/slice failure → `LOCAL_MEDIA_UNSUPPORTED`; local path не откатывается к
  whole-file/range prompt.
- Chunk duration/sample count расходится сверх одного 16 kHz sample плюс документированный
  codec-tail tolerance → chunk не идёт в inference.
- Temporary file становится accepted chunk только через atomic rename.
- Prefetch ограничен одним следующим chunk; все chunks заранее не материализуются.

### 4.3 Координаты и seam

Faster-Whisper возвращает `start/end` относительно физического chunk. Adapter:

1. проверяет finite/monotonic/bounds относительно chunk duration;
2. прибавляет **manifest `start_sec`**, а не значение модели;
3. сохраняет raw relative и normalized absolute timestamps отдельно;
4. выполняет существующий text seam на 30s overlap;
5. никогда не принимает provider timestamp как доказательство того, какой source range был
   обработан.

Сегмент получает стабильный derived id из `source_sha256 + model_revision + chunk_sha256 +
raw_segment_ordinal`; это provider artifact id, не новая DB identity и не schema migration.

## 5. Provider-neutral output и provenance

Минимальный job result:

```text
selected_provider: local
actual_provider: local-faster-whisper
source_sha256 / bytes / duration / selected audio stream
model id / exact revision / model.bin SHA-256 / license
faster-whisper / CTranslate2 / CUDA / driver / ffmpeg versions
decode params (all pinned fields from §0)
hardware fingerprint
physical chunk manifests + raw-output SHA-256 per chunk
normalized transcript-v1 [{id,start,end,text,speaker?}]
S12.5 verdict
S12.6 verdict
S12.7 verdict
warnings / retries / cancellation ancestry
elapsed / RTF / peak VRAM/RAM / thermal samples summary
codeVersion
```

Raw model output immutable; normalized transcript и validators являются производными. Browser
adapter может положить accepted result в существующий source passport/OPFS только после будущего
integration GO. Sidecar job store не становится вторым каноном пользовательской библиотеки.

## 6. Независимые S12.5–S12.7 gates

У каждого gate свой `PASS | FAIL | NOT_APPLICABLE`, evidence и reason codes. Нельзя свести их
в одно `quality_ok`, потому что «текст полный» не доказывает часы, а «метки монотонны» не
доказывает свой текст.

### G-L1-S12.5 — physical-source integrity

**Вопрос:** модель физически получила только заявленный range?

PASS только если:

- у каждого provider call есть accepted physical chunk manifest и chunk SHA-256;
- worker request содержит chunk handle, а не source handle/range prompt;
- actual sample count/duration согласованы с manifest;
- absolute timestamps получены только `relative + manifest offset`;
- raw output, normalized output и code/model pins связаны хэшами;
- mutation tests ловят whole-source substitution, неверный offset, swapped chunks, stale manifest
  и пропуск chunk.

Out-of-chunk model marks не отменяют физическую изоляцию, но валят timing-envelope конкретного
chunk и передают его в S12.7/retry. S12.5 не имеет права выдать «текст верен», он доказывает
только input provenance.

### G-L1-S12.6 — completeness / own-text integrity

**Вопрос:** значимая речь не исчезла и не была заменена replay?

Отдельно считаются:

- zero-text significant chunks;
- `classifyCoverageGaps` и `runSpeechDensity` на сырых per-window segments;
- duplicate 4-gram rate и существующий 6-word anti-replay;
- word-count ratio там, где есть независимый text oracle;
- lost ranges, rejected ranges и healed ranges как разные факты.

Для corpus без human/oracle zero-text и density — integrity evidence, не WER. Чистая тишина не
может автоматически считаться «потерянной речью»: до L5/VAD generic job получает warning и
owner-visible range; на frozen S12/3h fixtures, где речь известна, zero-text chunk = FAIL.

### G-L1-S12.7 — clock integrity

**Вопрос:** segment clock пригоден для karaoke?

Отдельно проверяются:

- chunk-relative start/end finite, bounded, monotonic;
- clock span compression/expansion per physical chunk;
- существующий `classifyClockCompression` относительно independent run density;
- p50/p95 timestamp error против внешнего oracle там, где он есть;
- unresolved chunk → `clockCompressedRanges`/`blind`, а не guessed timing.

Single-window файл без независимой baseline не получает ложный density-PASS: соответствующий
подгейт = `NOT_APPLICABLE`; bounds/monotonic остаются. Ни proportional text timing, ни VAD-based
guess не разрешены как repair: S12.7 уже измерил их как недостаточные.

### Retry policy gates, а не меняет verdict задним числом

1. transient error / malformed output → один retry того же physical chunk;
2. clock/completeness failure → один retry того же chunk;
3. physical split repair около 310s допускается только после отдельной L1 fault fixture,
   подтверждающей, что он не теряет текст; число split repairs ≤4 на job;
4. новый output принимается только если gate evidence строго улучшилось и text volume не упал
   ниже 0.85 предыдущего;
5. не вылечилось → visible gap/blind/failure. Model/compute/provider не меняются.

## 7. Job state, checkpoints и bounded resume

L1 вводит не product `import-job-v1`, а внутренний ephemeral execution manifest. Это минимальный
мост к L2, достаточный для cancel/restart proof и не требующий DB/OPFS schema.

```text
CREATED → PREFLIGHT → SLICING → WAITING_FOR_GPU → LOADING_MODEL
        → TRANSCRIBING(chunk N) → VALIDATING → COMPLETE

из любой активной стадии:
  CANCEL_REQUESTED → CANCELED
  recoverable process death → RECOVERABLE
  non-recoverable → FAILED
```

- Один writer — control process; update через temp+fsync+atomic replace; monotonic `event_seq`.
- Checkpoint — только completed physical chunk + raw output + hash + basic envelope PASS.
- In-flight chunk после crash/cancel никогда не считается completed.
- Resume сверяет source SHA, model/revision/hash, decode params, slicer version и каждый chunk
  hash. Любое расхождение → новый attempt, не смешивание результатов.
- L1 resume покрывает тот же single source/job после browser reload или companion restart.
- Multi-file queue, folder batch, per-file product result и long-term job history остаются L2.

## 8. Cancellation contract

Cancellation — отдельное действие, не network disconnect:

- `POST /v1/asr/jobs/{jobId}/cancel` идемпотентен;
- API acknowledgement p95 ≤500ms;
- queued/waiting/slicing job прекращается без GPU load;
- ffmpeg child получает graceful terminate, затем hard kill по deadline;
- ASR worker проверяет cooperative flag между yielded segments; если библиотека не отдаёт
  управление достаточно быстро, bounded hard-kill worker process остаётся обязательным;
- если worker не вышел, control process завершает worker process; accepted previous chunks
  сохраняются, current temp/output удаляется;
- terminal `CANCELED` p95 ≤15s на frozen cancel fixtures;
- после terminal cancel VRAM возвращается к pre-job baseline ±256 MiB в течение 30s;
- `cancel` не означает согласие на fallback и не запускает новый job;
- resume/retry после cancel — отдельная явная команда с новым `attempt_id`.

Без process isolation последний hard-cancel/VRAM-release gate недоказуем; поэтому добавление
ASR прямо в текущий `asyncio.to_thread` path — NO-GO дизайна.

## 9. Concurrency, VRAM admission и thermal policy

### 9.1 Лимиты L1

| Ресурс | Лимит |
|---|---|
| Heavy GPU residency | 1 (`asr` XOR `translator`) |
| Active ASR inference | 1 chunk |
| Active ffmpeg slicer | 1 |
| Prefetched chunks | 1 |
| Active local media jobs | 1 |
| Waiting local media jobs | 1 (дальше `LOCAL_QUEUE_FULL`) |
| `faster-whisper` workers | 1 |

ASR job удерживает heavy slot на весь файл, чтобы не грузить/выгружать Whisper между chunks.
MADLAD request получает честный `waiting_for_gpu`; активный chunk не прерывается ради перевода.
Перед permanent integration обязателен sweep всех MADLAD consumers: их текущий 180s timeout не
знает о многоминутном GPU wait.

### 9.2 VRAM admission

L0 measured delta = 2,330 MiB. До load/run gate требует:

```text
free_vram_mib >= measured_peak_delta_mib + 1536 MiB safety reserve
```

Для текущего pin это **3,866 MiB free**. Порог хранится рядом с model manifest как измеренная
policy, не как универсальное свойство Whisper. Перед admission scheduler:

1. ждёт завершения active heavy request;
2. выгружает другую idle heavy model;
3. подтверждает, что её VRAM действительно освобождена;
4. проверяет free VRAM;
5. только затем запускает ASR worker.

CUDA OOM: worker уничтожается, VRAM baseline проверяется, допускается один clean retry того же
pin. Второй OOM = FAIL. Переход на int8/full/cloud запрещён без нового решения/consent.

### 9.3 Thermal

NVML/driver telemetry обязательна на поддерживаемом NVIDIA path. Во время active job каждые 2s
фиксируются temperature, utilization, power и free VRAM; transcript/log payload не фиксируется.

```text
pause_at = min(83°C, NVML slowdown threshold - 5°C)
resume_at = pause_at - 5°C
abort_at = min(88°C, NVML slowdown threshold - 1°C)
```

- Три последовательных sample ≥`pause_at` → не dispatch следующий chunk, state `COOLING`.
- Resume только после 30s непрерывно ≤`resume_at`.
- Один sample ≥`abort_at` или driver thermal-throttle reason → hard cancel worker, unload,
  `THERMAL_ABORT`; автоматического cloud fallback нет.
- Telemetry unavailable → local capability `thermal_monitor:false`; на официально поддерживаемой
  8 GB NVIDIA конфигурации это preflight FAIL, а не молчаливый запуск.

Эти числа — консервативная L1 policy, а не утверждение о пределе RTX 3070. 3h soak должен либо
подтвердить их, либо вернуть packet владельцу; реализация не поднимает пороги сама.

## 10. Model lifecycle и storage

### 10.1 Explicit install

- Никакого download при первом нажатии «Локально».
- Отдельный install screen/command показывает model id, exact revision, Apache-2.0, размер и
  нужное свободное место.
- Download только по full revision SHA во временный managed directory.
- До atomic activation сверяются model manifest и `model.bin` SHA-256.
- Mutable alias/main, partial snapshot и checksum mismatch не активируются.
- Preflight disk: `2 × declared snapshot bytes + 2 GiB reserve` для temp+atomic activation.

Managed root — owner-configurable `AI_LOCAL_MODELS_DIR`, структура:

```text
models/asr/ivrit-ai--whisper-large-v3-turbo-ct2/
  72ad623a37947395efcc3933132353790e5a12f5/
    model files
    linguistpro-model-manifest.json
```

L0 external Hugging Face cache на `F:` остаётся research evidence, но не product lifecycle:
глобальный cache может быть очищен/перенаправлен и не является atomic activated install.

### 10.2 Residency

- startup: ASR `UNLOADED`;
- first admitted ASR job: load→warm→run;
- модель остаётся загружена между chunks одного job;
- после job: immediate unload, если в heavy queue ждёт другой model class; иначе idle timeout
  **300s** (load cost L0 = 2.03–7.18s, поэтому держать VRAM 15 min как MADLAD необязательно);
- cancel/OOM/thermal abort: worker process terminated, state `UNLOADED` после VRAM proof;
- model update — новая side-by-side revision, никогда overwrite active revision;
- rollback pointer меняется только между jobs.

### 10.3 User-data TTL

Job spool — Class C personal content, не model cache:

- source/chunks/raw transcript живут до client receipt/delete, максимум 24h после terminal state;
- cancel/failed/recoverable artifacts тоже максимум 24h, чтобы оставить explicit retry window;
- «Удалить job» удаляет source, chunks, raw/normalized outputs и manifest, возвращает receipt;
- cleanup не следует symlink/junction наружу managed job root;
- original filename и transcript text не пишутся в operational logs;
- model files не удаляются вместе с job; uninstall модели — отдельное explicit действие.

L2 может пересмотреть TTL вместе с full durable jobs. L1 не имеет права превратить 24h spool в
долговременную библиотеку.

## 11. Fallback matrix

| Событие | Local действие | Cloud действие |
|---|---|---|
| model absent/checksum fail | install/repair prompt; job не стартует | только отдельное «Перейти к Gemini» |
| GPU busy/MADLAD active | `waiting_for_gpu` + ETA | не запускается |
| insufficient VRAM | unload idle heavy model, один preflight retry, затем FAIL | не запускается |
| CUDA OOM | worker reset + один same-pin retry, затем FAIL | не запускается |
| thermal pause | ждать охлаждения | не запускается |
| thermal abort | FAIL с сохранёнными completed chunks | не запускается |
| unsupported media/slice failure | FAIL, показать stream/codec reason | отдельный opt-in Gemini job |
| S12.6 lost range | same-chunk retry/approved split; затем visible gap | не запускается |
| S12.7 clock failure | same-chunk retry/approved split; затем `blind` | не запускается |
| cancel | terminal CANCELED | не запускается |
| local sidecar unavailable | capability unavailable | пользователь выбирает provider до upload |

`Auto` в будущем означает **выбрать provider до старта по capability**, а не «если local не
получилось, отправить файл в cloud». При переходе local→Gemini UI обязан показать bytes,
provider/model, privacy/cost, reason и получить отдельное consent. Новый job пишет
`selected_provider=local`, `actual_provider=gemini`, `fallback_reason`, consent version/time.

## 12. Implementation slicing после owner GO

### L1-A — contract/security/model activation (без Studio UI)

- versioned loopback capability, pairing/Origin/PNA/body caps;
- pinned model installer/manifest/checksum;
- isolated worker skeleton;
- port canon `8799` и stale `8765` docs/hints исправляются внутри явно разрешённого allowlist;
- gates: auth/CORS/PNA mutation suite, checksum/disk/partial-install faults.

**Exit:** model можно explicit установить, проверить, warm/unload; source bytes ещё не
приземляются в продукт.

### L1-B — scheduler + physical slicer + single-job executor

- exclusive heavy slot across MADLAD/ASR;
- format-neutral ffmpeg chunks, manifests, atomic checkpoints;
- queue/cancel/worker reset/restart resume;
- no provider UI/default changes.

**Exit:** CLI/API frozen fixtures проходят 117min/3h и fault injection.

### L1-C — provider-neutral normalization + independent gates

- local adapter returns `transcript-v1`;
- reuse/factor existing pure S12 logic, без Python-копии с иной семантикой;
- S12.5, S12.6, S12.7 reports independently pinned by mutation tests;
- enlarged human-gold evaluation packet.

**Exit:** quality/integrity packet reviewed; no product surfacing yet.

### L1-D — Studio adapter behind default-off experimental capability

- explicit `Local` selection and capability/install state;
- progress/queue/cancel/retry/delete;
- same table/karaoke/passport, no new DB schema;
- no silent cloud fallback, no default change;
- 380px RTL + Chrome/Edge/Firefox loopback gates.

**Exit:** local owner-machine flow works default-off; permanent integration still forbidden.

### L1-E — closure evidence

- clean 117min, 3h soak, restart/cancel/OOM/thermal/disk faults;
- human-gold speaker-stratified report;
- storage deletion receipt and model lifecycle proof;
- owner listen/read acceptance;
- adversarial diff review.

**Exit:** отдельный owner packet решает permanent integration/provider policy. L1-E completion
сама по себе default не меняет.

## 13. Gates перехода к реализации

### 13.1 Owner-entry gate — до первого кода

Все пункты обязательны:

1. Владелец утверждает exact sentence из §16.
2. Подтверждены L1-A→L1-E и stop-boundaries.
3. Подтверждены managed model store, 24h job TTL, worker hard-cancel и thermal policy.
4. Allowlist первого implementation slice перечисляет точные files/modules; schema/prod/defaults
   отсутствуют.
5. Baseline dirty worktree повторно снят; unrelated изменения не входят в commit.
6. Для каждого слайса заранее записаны independent fixtures/mutations и stop condition.

Если любой пункт не утверждён, разрешена только правка этого packet.

### 13.2 Engineering exit — до L1-D product adapter

- exact model/runtime/decode pins подтверждены runtime manifest;
- physical slice mutation gate 100%; whole-source/range fallback отсутствует;
- one-heavy-slot race/OOM tests доказывают ASR XOR MADLAD;
- cancel ack ≤500ms p95, terminal ≤15s p95, VRAM baseline ≤30s;
- restart возобновляет только hash-matched completed chunks, 0 duplicate accepted inference;
- 117min: all chunks, zero known-speech empty chunks, duplicate 4-gram <3%, unresolved
  clock-distorted chunks 0;
- 3h: complete, no OOM/thermal abort, RTF ≤0.05, peak VRAM policy соблюдена;
- batch-20 harness: 20/20 terminal results, aggregate WER ≤5%, CER ≤2%; это regression gate
  frozen L0 set, не population-quality claim;
- model checksum/disk-low/sidecar-down/cancel/OOM/thermal/slicer faults fail honestly;
- deletion receipt подтверждает отсутствие job artifacts.

### 13.3 Recommended permanent-quality evidence — owner-reclassified 2026-07-31

The owner reclassified the 60-minute/12-speaker paired-Gemini study from a mandatory permanent-
integration exit gate to recommended evidence. The criteria below remain the canonical protocol if
that study is run, but their absence no longer blocks a beta, deploy, or future permanent decision.
Permanent integration still requires a separate explicit owner authorization.

- recommended human-gold ≥60 minutes, ≥12 speakers, stratified by speaker/age/register/noise; exact corpus
  и consent/rights описаны;
- на одном и том же полном set local paired WER не хуже Gemini более чем на 2 absolute pp
  overall и более чем на 5 pp в любом заранее объявленном stratum;
- cloud baseline обязан завершить весь declared set; quota/error rows не импутируются, а
  оставляют paired gate открытым;
- абсолютный product-quality threshold утверждён владельцем **после** первого blinded report —
  L0 не даёт честной базы, чтобы выдумать его сейчас;
- timestamp oracle p95 ≤5s на segment-level set и ни одного уверенно подсвеченного failed range;
- B+C integrity debts закрыты;
- browser/owner live acceptance записана с commit/device/scenario;
- отдельное решение задаёт `Auto/Local/Gemini` policy и defaults.

## 14. Адверсариальная критика по ролям

- **R4 Premium UX:** «Local» не может означать скрытую установку на 1.6+ GB, неизвестное ожидание
  GPU или зависший cancel. Ответ: explicit install, `waiting_for_gpu`, ETA, cancel/delete receipt,
  honest blind ranges. Product UI отложен до L1-D.
- **R5 Offline/privacy product:** direct loopback — сильная ценность, но текущий FastAPI не
  browser-secure. Ответ: pairing/Origin/PNA/body caps входят в L1-A, а не hardening afterward.
- **R9 Provenance:** «модель получила chunk» нельзя доказывать её timestamps. Ответ: physical
  chunk/sample/hash manifest, immutable raw output, independent absolute offset.
- **R11 Do-no-harm:** локальная модель может быть быстрее/дешевле и всё равно потерять речь или
  сломать karaoke. Ответ: S12.5–S12.7 не ослабляются; FAIL/N/A различаются; timing может стать
  blind, текст не переписывается guessed repair.
- **R12 Architecture:** добавить независимый `ModelSlot` — значит создать конкурирующую GPU
  truth. Ответ: один heavy scheduler; job spool — execution artifact, OPFS remains product canon.
- **R14 Security:** localhost не равен trusted. Ответ: pairing token, Origin/PNA, loopback-only,
  no arbitrary paths, caps и browser matrix — entry gates.
- **R15 Lifecycle:** resume легко превращает private media cache в вечное хранилище. Ответ: receipt
  or 24h maximum TTL, explicit deletion, logs без transcript/name.
- **R16 Cost/resource:** «бесплатный local» может занять GPU/MADLAD и диск без потолка. Ответ:
  one heavy slot, queue 1+1, VRAM/thermal/disk admission, no silent retries/splits/cloud.

**Синтез:** самый короткий безопасный L1 — не «добавить `/transcribe` в `ai-local`», а сначала
сделать secure control plane + exclusive GPU worker + physical chunks, затем подсоединить уже
существующие validators. Иной порядок создаёт работающий happy path без доказуемого cancel,
privacy boundary и resource ownership.

## 15. Явные stop conditions

Остановиться и вернуть решение владельцу, если:

- exact model/revision/hash/runtime pin недоступен;
- нужен full model/int8/VAD/word timestamps для прохождения gate;
- физический slicer требует whole-source/range inference fallback;
- one-heavy-slot ломает существующий MADLAD consumer и требует product-policy change;
- browser требует LAN bind или ослабление Origin/pairing;
- cancel не освобождает worker/VRAM в установленный срок;
- 3h RTF >0.05, OOM или thermal abort повторяется;
- expanded gold нарушает paired non-inferiority;
- нужна schema migration, production mutation, provider-default или cloud upload без отдельного
  owner approval.

## 16. Текст отдельного утверждения владельца

До получения следующей фразы реализация не начинается:

> **Утверждаю grounded L1 design packet от 2026-07-30 и разрешаю ограниченную реализацию
> L1-A→L1-E с pinned `ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`;
> full large-v3 не использовать как default/fallback; permanent integration, schema, production
> и provider-default changes по-прежнему требуют отдельного решения владельца.**

## 17. Paste-ready prompt следующей implementation-сессии (только после §16)

```text
Продолжаем Studio Ingest local ASR после отдельного утверждения L1.

Прочитай сначала:
1. docs/planning/STUDIO_INGEST_LOCAL_ASR_L1_DESIGN_DECISION_PACKET_2026_07_30.md
2. docs/research/studio-local-processing/2026-07-30/README.md
3. docs/research/studio-local-processing/2026-07-30/GO_NO_GO_DECISION.md
4. docs/research/studio-local-processing/2026-07-30/quality-report.json
5. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
6. CLAUDE.md и docs/PROJECT_ROLES.md

Точное утверждение владельца:
<вставить дословно фразу из §16>

Начни только с L1-A. Сначала dirty worktree + живой код + adversarial recon. Не трогай Studio
UI, schema, production или provider defaults. Реализуй secure loopback capability, pairing/
Origin/PNA/body caps, pinned managed model activation и isolated worker skeleton. Не добавляй
ASR product path, пока L1-A gates не закрыты. Любой выход за allowlist или необходимость
ослабить security/model pin — STOP и решение владельцу.
```

## 18. Evidence read for this packet

- `docs/research/studio-local-processing/2026-07-30/{README.md,GO_NO_GO_DECISION.md,quality-report.json,hardware.json,model-manifest-ivrit-turbo.json,run-manifest-ivrit-turbo-fp16.json,benchmark_runner.py}`;
- `docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`;
- `docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md`;
- `docs/planning/STUDIO_INGEST_S12_5_AUDIO_SLICING_DESIGN_2026_07_29.md`;
- `docs/planning/STUDIO_INGEST_S12_6_FALSE_GAP_COMPRESSED_MARKS_2026_07_30.md`;
- `docs/planning/STUDIO_ASR_CLOCK_COMPRESSION_S12_7_2026_07_30.md`;
- live `public/js/{studio-import,asr-transcript,mp3-slice,gemini-files,media-store}.js`;
- live `ai-local/ai_local/{config,state,lifecycle,monitor,main}.py`, lifecycle tests,
  `db/premium/pythonClient.js`, `scripts/start_all.ps1`, `docs/CONFIG.md`;
- `CLAUDE.md`, `docs/PROJECT_ROLES.md`, dated project memory/export and recent local history.
