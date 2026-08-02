# Студия: общий roadmap импорта и учебных медиа

> **Дата:** 2026-07-30
> **Статус:** 🟢 канонический общий roadmap по директиве владельца; L3a Correctable
> Media Package shipped до `v3.11.282`; L3a.3 Material Revision Workspace foundation
> shipped в `v3.11.283`, mapping/follow correction shipped в `v3.11.286`, а
> first-slot/compact-header polish deployed и production-verified как `v3.11.287` / `2e8f4bf3`.
> P2 Portable Learning Package v2 implemented и прошёл automated local gates 2026-08-02;
> owner-approved production release candidate — `v3.11.288`. Exact contract и evidence находятся в
> `STUDIO_INGEST_P2_PORTABLE_LEARNING_PACKAGE_V2_IMPLEMENTATION_PACKET_2026_08_02.md`,
> production delivery/real owner-material read-only check ещё pending на этой точке.
> Реализация новых слайсов требует обычных
> measure-before-code, adversarial design и owner/live gates.
> **Срез:** production/origin `2e8f4bf355a2babc0de619bfca817d1fff74b44f`
> (`v3.11.287`); actual browser migration count — `46`; production health/DB/migrations PASS,
> `disk_warn=false` after bounded cleanup.

Этот документ долговечно фиксирует результат обсуждения владельца:

> Что уже умеет «Импорт», что осталось в roadmap, чего ещё нельзя импортировать,
> какие артефакты и необговорённые дыры важны, и что расширит образовательные сценарии,
> качество и UX?

Иерархия канона:

1. **Этот документ** — общий capability ledger, дыры и порядок следующих слайсов.
2. `STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` — исходные решения,
   история реализации S1–S12 и доказательства.
3. `STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md` — специализированный
   сквозной трек local GPU/CPU processing L0–L6, подчинённый общему roadmap.
4. Per-slice design/implementation docs — точные контракты и гейты конкретной работы.
5. `STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md` —
   owner-approved contract повторной correction учебного материала: two-layer Workspace,
   immutable table revisions, affected-only regeneration и full rebuild только явно.

## 1. Что реализовано в последней импорт-волне

| Сценарий | Статус | Реальный результат |
|---|---|---|
| Единый «Импорт» | ✅ | вкладки «Статья / страница», «Видео», «Файл» |
| S1 URL статьи | ✅ | извлечение основного текста, anti-SSRF, provenance |
| S2 PDF/DOCX | ✅ | PDF через Gemini BYOK; DOCX детерминированно |
| S3 любой текст → иврит-таблица | ✅ | обратное направление с derived-провенансом |
| S8 фото/скриншот | ✅ | JPEG/PNG/WebP → Gemini OCR |
| S4 аудио → транскрипт | ✅ | до 3ч/300МБ, таблица, сегментное караоке |
| S4.2 загруженное видео без субтитров | ✅ | ASR аудиодорожки; изображение видео не является полноценным player-flow |
| S5a YouTube с субтитрами | ✅ | credentialless player + принесённый VTT/SRT/YouTube transcript |
| S5a.1 UX субтитров | ✅ | распознавание URL, подсказки, переход к ролику, честный track hint |
| S11 «Упростить до моего уровня» | ✅ | A1–B2, новый derived-текст, знакомая лексика до/после |
| S12 длинные медиа | ✅ | физическая MP3-нарезка, окна ASR, таблица чанками по 120, progressive render |
| S12.1–S12.6 hardening | ✅ | retry/bisect/stitch/coverage/anti-replay/честный timing warning |
| text-card-v2 | ✅ | паспорт, сегменты и построчный provenance в карточке |
| честный row timing | ✅ | опасный premium `segment_index` отключён; K2/K3 fallback |
| S12.7 clock compression | ✅ SHIPPED v3.11.270 | гейт, переспрос/дробление и честная blind-деградация |

Главное уточнение: **локально загруженный видеофайл без субтитров уже распознаётся**.
Не поддержан прямой сценарий «YouTube/другой remote URL без субтитров → скачать → ASR».

## 2. Матрица входов: умеем, частично, не умеем

### 2.1 Поддерживается

- вставленный/набранный текст;
- публичная HTML-статья по URL, если контент доступен обычному server fetch;
- PDF ≤6МБ;
- DOCX ≤6МБ;
- JPEG, PNG, WebP ≤6МБ;
- аудио и видео-файлы ≤3ч и ≤300МБ, которые принимает браузер/Gemini;
- VTT, SRT;
- вставленная штатная расшифровка YouTube с таймкодами;
- YouTube URL + отдельно принесённые субтитры.

### 2.2 Частично

- **видео без субтитров:** загруженный файл — да; remote URL — нет;
- **неивритское медиа:** ASR может вернуть `NOT_HEBREW`, но end-to-end
  «речь любого языка → ивритская timed-таблица» ещё не гарантирован;
- **локальное видео:** аудиодорожка проигрывается, но нет полноценного `<video>` + sidecar-track UX;
- **рукописный Hebrew:** cloud OCR может сработать, но gold/обещанной планки нет;
- **динамические/paywalled/auth pages:** обычный URL-extractor не имеет сессии браузера;
- **переносимость медиа:** metadata переносится лучше самих OPFS-байтов.

### 2.3 Не поддерживается как файловый/ссылочный вход

**Документы:** TXT, Markdown, local HTML, EPUB, ODT, RTF, legacy DOC, PPTX,
XLSX/CSV как структурированный материал, защищённые документы, Google Docs/Drive с auth.

**Изображения:** HEIC/HEIF, TIFF, многостраничный пакет фото, batch изображений.

**Медиа:** podcast RSS/direct audio URL, Vimeo/Rutube/social video URL, Spotify/Apple
Podcasts, livestream, embedded subtitle/audio tracks, несколько дорожек одного файла,
локальный video + внешний subtitle sidecar как единый объект.

**Субтитры:** ASS/SSA, TTML/DFXP, SBV, LRC, JSON3 как пользовательский input,
две дорожки сразу (original+translation), выбор/версионирование нескольких track.

## 3. Остаток исходного S-roadmap

| Сценарий | Статус/решение |
|---|---|
| S5b remote video без субтитров | parked: companion/lawful acquisition после спроса; server yt-dlp NO-GO |
| S6 audio translation | pending: исходная речь → timed Hebrew learning output/TTS |
| S7 karaoke export | pending; теперь часть Media Package v1 |
| S10 PWA share_target | отложен до Android-спроса; WebKit/iOS не поддерживает |
| S5A browser extension | отложено: высокая стоимость поддержки селекторов/дистрибуции |
| S9 song alignment | анти-приоритет до доказанного качества и спроса |

Не переоткрывать без нового owner-решения и evidence: server yt-dlp/ffmpeg,
непроверенный word-level forced alignment, real-time streaming ingest, обещание точности песен.

## 4. Каких пользовательских артефактов не хватает

> **Update 2026-08-01:** L3a реализовал first-class local package/track/revision store,
> corrected editor, VTT/SRT и media-free slim package. Открытый пробел теперь точнее:
> Media Package, learning table и device/cloud/agent projections ещё не образуют один
> составной переносимый learning artifact. Канон исследования и утверждённого порядка:
> `docs/research/studio-ingest-artifact-continuity/2026-08-01/REPORT.md` и
> `STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md`.

Сейчас импорт в основном создаёт **текст/таблицу с паспортом**. Для долговечного учебного
медиа нужен **Media Package v1**:

```text
manifest.json
media/original.ext                 # опционально в полном ZIP; иначе SHA+relink
tracks/original.vtt                # immutable/raw
tracks/normalized-transcript.json
tracks/user-corrected.vtt
tracks/translated-ru.vtt
tracks/simplified-a2.vtt
mapping/segment-row-map.json
quality/import-run.json
```

Минимальные сущности:

1. `media_asset` — SHA-256, MIME, duration, original name, OPFS path.
2. `caption_track` — язык, kind, source, версия, raw/normalized, связанный `media_sha256`.
3. `source_segment` — стабильный id, start/end, text, speaker, quality flags.
4. `row_mapping` — source segment → saved sentences/table rows.
5. `import_manifest` — provider/model/revision/code, consent, cost/time, input checksum.
6. `quality_report` — coverage, duplicates, gaps, unreliable timing, retries, confirmations.
7. `import_job` — durable checkpoints для resume/cancel/restart.

Raw, normalized, corrected, translated и simplified — разные версии/производные; ни одна
не должна молча перезаписывать другую (R9/R12).

## 5. Архитектурная готовность видео + субтитры

Готовые кирпичи:

- медиа в OPFS с SHA/MIME/duration;
- нормализованные timestamped segments;
- HTML audio clock и YouTube clock-adapter;
- сегментное караоке и row-range mapping;
- table chunking;
- provenance passport.

Недостающие кирпичи:

- сильная связь subtitle track↔media по SHA;
- хранение raw cues, а не только слитых ≤15с предложений;
- полноценный local `<video>` player;
- cue editor: edit/split/merge/offset/drift/speaker/replay;
- persistent `source_segment_id`; развод `source_line_index` и `sentence_index`;
- перенос полного media package и relink на другом устройстве;
- VTT/SRT/LRC export и round-trip gate.

**Вывод:** архитектура достаточно зрелая, чтобы начать Media Package/editor после
закрытия segment-identity/schema-хвоста. Это не перестройка ядра, но и не одна кнопка
«прикрепить VTT»: без binding, persistence и portability появится новый хрупкий dual-write.

## 6. Дыры качества, надёжности и UX

### P0 — целостность

1. **S12.7 закрыт:** стохастическое сжатие часов ASR-чанка теперь детектируется;
   недоказуемый диапазон честно слеп для караоке, а не подсвечивает ложную строку.
2. **Backup parity:** обычный `exportBundle` беднее text-card-v2 и теряет row provenance/
   `niqqud_derived`.
3. **Segment identity:** `segment_index` не персистится; после reload K3 выравнивает по тексту.
4. **Name collision:** premium sentence ordinal и ASR segment id нельзя называть одинаково.
5. **Duplicate import:** повтор файла создаёт новый случайный `text_key`.
6. **`text_audio_asset_key` round-trip:** известная потеря Shape A.
7. **UPDATE чужой карточки:** обычный import/draft без retell может унаследовать stale `baseTextId`.

### P0/P1 — длинные и множественные файлы

- после закрытия/выгрузки вкладки нет полного durable ASR job-ledger;
- batch многих файлов пока не продуктовая возможность;
- нужны очередь, bounded concurrency, progress/cancel/resume и per-file best-effort report;
- GPU/облачный budget должен оцениваться до запуска, фактический расход — после.

### P1 — переносимость и редактирование

- media bytes не гарантированно приезжают с карточкой/cloud-sync;
- нужен full ZIP, slim ZIP и relink по SHA;
- плоское редактирование preview при изменении числа строк сбрасывает timing;
- нужен segment editor, а не text-area как единственный корректор.

### P1 — privacy/lifecycle

- явный экран «что уйдёт в cloud»;
- TTL/удаление OCR/PDF/LLM cache;
- local→cloud fallback только по consent;
- raw media, model outputs и derived artifacts должны иметь понятные классы retention/export/delete.

### P1/P2 — доступность источников

- EPUB и HEIC — самые заметные бытовые форматы;
- TXT/Markdown/local HTML — дешёвые usability wins;
- PPTX полезен для уроков/лекций;
- podcast/direct audio URL полезнее большинства экзотических document formats;
- paywalled/auth pages требуют browser/extension/share flow, не расширения SSRF proxy.

## 7. Сквозной local-processing трек

Local GPU/CPU processing — **часть этого общего roadmap**, применимая к нескольким
входам и выходам, а не отдельный продукт:

- local Hebrew ASR для аудио/видео и batch;
- durable jobs и GPU scheduler;
- уже существующие MADLAD local translation и DictaBERT-menaked;
- VAD/diarization/alignment;
- измерительный поиск более качественного local Hebrew TTS;
- кандидаты local OCR и local LLM для упрощения/metadata только после gold.

Полный контракт, hardware truth, кандидаты ivrit.ai, лицензии и порядок L0–L6:
`STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`.

Терминологический инвариант: Whisper/основной ivrit.ai track = **STT/ASR**, не TTS.
TTS остаётся отдельной quality-gated веткой.

## 8. Образовательные сценарии

| Возможность | Образовательный эффект |
|---|---|
| Media Package + corrected captions | чтение/слушание одного источника без потери правок |
| segment editor | разбор трудной реплики, диктант, точечное исправление ASR |
| original/translated/simplified tracks | graded listening и постепенное снятие scaffolding |
| replay-range + timestamp notes | pronunciation note, grammar observation, micro-shadowing |
| speaker diarization | интервью/диалог/role-play по ролям |
| local ASR + batch | большие личные курсы/лекции без квоты и утечки речи |
| audio translation | production: «как сказать услышанную мысль на иврите» |
| VTT/SRT/LRC export | продолжение в плеерах/Anki/архиве вне LinguistPro |
| EPUB import | длинное graded reading из пользовательских книг |
| HEIC/batch photo | меню, вывески, чаты и worksheets с телефона |
| chaptering | управляемые учебные сессии вместо таблицы на 1000+ строк |

## 9. Формальный порядок следующих слайсов

| Порядок | Слайс | Приоритет | Exit |
|---|---|---|---|
| 0 | S12.7 clock compression | ✅ DONE | v3.11.270, `4a17686d` |
| 1 | local L0 benchmark | ✅ DONE | pinned turbo CT2; full large-v3 not default/fallback |
| 2 | provenance/schema B + UX/data C | ✅ BOUNDED DONE | backup parity, portable ids, explicit dedupe, audio round-trip |
| 3 | local L1 ASR | 🟡 ENGINEERING PASS | sidecar batch/browser/B+C PASS; owner acceptance and permanent integration open |
| 4 | resumable import-job + batch | ⏸ DEMAND-TRIGGERED | reload/job-loss или регулярные 3–5+ файлов; не начат |
| 5 | L3a Correctable Media Package | ✅ SHIPPED v3.11.282 | v45, immutable raw/corrected revisions, editor, reopen shelf, player↔cue↔row, VTT/SRT/slim package; remaining owner-live ceremonies tracked separately |
| 6 | **L3a.3 Material Revision Workspace** | ✅ SHIPPED / PROD PASS v3.11.287 | two-layer source+learning workspace, v46 immutable revisions, field authority, targeted regeneration, exact repaired cue↔row follow, first-slot upcoming context and compact title→state→history header |
| 7 | **L3b Artifact Continuity / P2 entry** | 🟡 NEXT OWNER-GATED SLICE | P1A material-revision contract and P1B Workspace are complete; exact Artifact Graph schema/migration/package allowlist must be frozen at P2 entry, then Portable Learning Package v2 → iPhone → Import Center |
| 8 | local translation/nikud + S6 | P1 | shared provider contract, R1/R11 quality gates |
| 9 | diarization/alignment | P1 | speaker/timing gold, segment default remains honest |
| 10 | EPUB + TXT/MD/HTML + HEIC | P1 | real fixtures, provenance, mobile acceptance |
| 11 | local TTS/OCR/LLM R&D | P2 | license+quality GO; no downgrade for «free» |
| 12 | remote media/companion | P2/triggered | demand, lawful source path, privacy/cost decision |

L0 и ограниченный default-off L1 engineering/evidence closure выполнены. Permanent L1
integration требует отдельного owner acceptance; expanded human-gold и paired Gemini cloud
comparison не запускались и не подразумеваются фактом закрытия B+C.

### Текущая точка и следующий слайс (update 2026-08-02)

```text
P0 L3a closure ✅
  → P1A Material Revision contract + exact Artifact Graph/P2 entry packet ✅
  → P1B Material Revision Workspace + Playback Review ✅
  → P2 Portable Learning Package v2 implementation 🟡 AUTOMATED LOCAL PASS / PROD PENDING
  → P3 real iPhone manual continuity
  → P4 Import Center + educational continuity
```

Следующая сессия не должна переоткрывать Workspace UI или строить cloud sync. Exact
Artifact Graph/schema/manifest/allowlist уже frozen в P2 packet; после отдельной дословной
owner-authority она реализует pure Artifact Graph builder, snapshot/archive package writer,
checksum/referential verifier, dry-run plan,
transactional OPFS import/rebind, receipts, backup coverage и fault/performance/browser gates.
Media bytes, E2EE/autosync, Hermes, concurrent-device editing и L2/L4/L5/L6 остаются вне P2.

## 10. Обязательные процессные артефакты

Для каждого нового формата/provider:

1. stable research directory + README;
2. input manifest/checksums/license;
3. immutable raw output;
4. normalized canonical output;
5. independent gold/quality report;
6. cost/time/memory/provenance report;
7. fault-injection и round-trip gates;
8. owner acceptance record с устройством/commit/сценарием;
9. regeneration command;
10. явный список known failures/non-goals.

Пользовательские/лицензионно-проблемные большие исходники, модели и ключи не коммитятся;
в репозитории остаются manifests, разрешённые малые fixtures и воспроизводимые runners.
