# Studio Ingest после L3a.2: образовательное закрытие, artifact continuity, iPhone и Hermes

> **Дата:** 2026-08-01
> **Статус:** 🟢 research завершён; направление и необходимость подробного planning
> утверждены владельцем 2026-08-01
> **Repo baseline at research start:** `v3.11.282`, commit
> `5c5239332093bb5a10e10e500c81eb0300a8be4b`, `MIGRATIONS.length=45`
> **Тип работы:** docs/research only; никаких code/schema/data/provider/deploy mutations
> **Current program update 2026-08-02:** Workspace/Playback Review production-closed as
> `v3.11.287` / `2e8f4bf355a2babc0de619bfca817d1fff74b44f`, browser migrations `46`;
> exact derived Artifact Graph/schema-v2 manifest/v47 receipt/import/security/allowlist were
> production-closed as `v3.11.289` / `da30fdbaf79f6751bee74406f73b093be742e76b`;
> automated production PASS and read-only real-material PARTIAL OWNER PASS. P3 real iPhone
> continuity is next and owner-gated.
> **Planning-выход:**
> `docs/planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md`
> **Implementation packet:**
> `docs/planning/STUDIO_INGEST_P2_PORTABLE_LEARNING_PACKAGE_V2_IMPLEMENTATION_PACKET_2026_08_02.md`

## 0. Вопрос и решение в одном экране

После L3a.2 LinguistPro умеет получить Local/Gemini ASR draft, сохранить immutable raw,
создать отдельные corrected revisions, синхронизировать player↔cue↔table row,
экспортировать VTT/SRT/slim Media Package и вернуться к сохранённым правкам.

Это закрывает **локальное исправление транскрипта**, но ещё не закрывает импорт как:

1. законченный образовательный объект;
2. долговечный и восстанавливаемый набор артефактов;
3. воспроизводимый материал между ПК и iPhone/другими устройствами;
4. понятный пользователю процесс с единым справочным контуром;
5. безопасно и честно доступный Hermes объект.

Главная архитектурная находка: сегодня есть два корректных, но неполных продукта.

- `linguistpro-media-package-v1` переносит package identity, raw/current corrected
  tracks, lineage/provenance и hashes, но не media bytes и не learning table.
- `text_bundle`/text-card переносит сохранённый текст/таблицу и строки, но cloud-slim
  намеренно вырезает canonical Media Package snapshots и оставляет local-only stub.

Они взаимодополняют друг друга, но не образуют один переносимый учебный объект.
Следующий продуктовый слой должен быть не ещё одной кнопкой export, а
**Import Artifact Graph + Portable Learning Package v2 + Import Center**.

## 1. Источники и метод

### 1.1 Repo canon

Полностью или целевым live-code recon были сверены:

- `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`;
- `docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md`;
- `docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`;
- `docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md`;
- `docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md`;
- `docs/planning/LINGUISTPRO_SYNC_HARDENING_P0P2_DESIGN_2026_07_18.md`;
- `docs/planning/LINGUISTPRO_AGENT_ACCESS_PERSONAL_CONTENT_BRIDGE_RECON_2026_07_18.md`;
- `docs/planning/LINGUISTPRO_AGENT_ACCESS_HERMES_MATURE_INTEGRATION_2026_07_18.md`.

### 1.2 Live code

Проверены реальные contracts/consumers:

- `public/db/migrations.js` — actual browser migration count `45`;
- `public/js/media-package-core.js`;
- `public/js/media-package-repository.js`;
- `public/js/studio-media-package.js`;
- `public/js/studio-media-editor.js`;
- `public/js/studio-media-karaoke.js`;
- `public/db/local-db.js`, особенно `filterMediaPackageMetaForSlim()`;
- `public/js/cloud-sync.js` и Library auto-sync entry;
- `agent/access/capabilities.js`, `mcpSchemas.js`, `productionHandlers.js`;
- `db/learnerArtifactsRepo.js`, `db/agentSentenceRepo.js`.

### 1.3 Hermes current-state check

Read-only проверка активного Docker Hermes показала:

- LinguistPro MCP enabled;
- OAuth mode;
- tool allowlist содержит 25 инструментов, включая
  `list_personal_texts`, `get_personal_text_content`, `get_text_coverage`,
  morphology, handoffs и propose-family;
- отдельного Media Package/caption/revision tool нет.

Токены, client secrets и API keys не читались и не выводились. Это подтверждает
конфигурацию tool surface, но не заменяет fresh ordinary-chat invocation для будущего
acceptance нового инструмента.

### 1.4 Внешняя browser evidence

Официальные WebKit-источники, access date 2026-08-01:

- OPFS и browser support:
  <https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/>;
- quota, persistence и eviction:
  <https://webkit.org/blog/14403/updates-to-storage-policy/>;
- Home Screen web-app storage isolation:
  <https://webkit.org/blog/11338/cname-cloaking-and-bounce-tracking-defense/>.

Внешние источники использованы только для ограничения обещаний iPhone/WebKit.
Архитектурные выводы основаны прежде всего на live code репозитория.

## 2. Фактическое состояние после v3.11.282

### 2.1 Что уже реализовано хорошо

1. `raw_original` — immutable canonical normalized source track.
2. `user_corrected` — отдельный logical track с recoverable draft и immutable commits.
3. Stable identity:
   `source_segment_id != caption_segment_id != source_line_index != sentence_index`.
4. Split/merge lineage и per-field authority.
5. Exact revision binding сохранённой таблицы; новая correction не переписывает таблицу.
6. Stale-state и CTA вместо destructive generic update.
7. Media content-addressed по SHA-256 в OPFS.
8. Exact SHA relink; mismatch fail-closed.
9. Editor review console: permanent transport, direct cue jump, bidirectional player/cue sync.
10. Table source-player, row replay и player↔row sync.
11. VTT/SRT semantic round-trip и slim-package checksums.
12. Package editor не вызывает cloud/model автоматически.
13. Local/Gemini defaults не изменены; implicit fallback отсутствует.

### 2.2 Какие owner-live gates ещё нельзя считать закрытыми автоматически

Стабильный L3a owner packet всё ещё честно оставляет открытыми:

- десять реальных Mia-corrections;
- split/merge/offset/replay на owner media;
- fresh-profile slim import + exact relink + one-byte mismatch;
- stale-table observation на реальном saved material;
- real local `<video>` end-to-end acceptance;
- dirty-close/browser-process crash ceremony;
- quota-full UI.

Production automated gate на реально served v3.11.282 прошёл, но не подменяет эти
содержательные и destructive-environment проверки.

### 2.3 Почему package остаётся local-only

`filterMediaPackageMetaForSlim()` удаляет `segments`, `raw`, `corrected`, `draft`,
`revisions`, `timing`, `rawSource`. В server artifact уходит только stub:

```json
{
  "package_id": "...",
  "local_only": true,
  "media_included": false,
  "revision_sha256": "..."
}
```

Это правильная граница L3a: она исключает неявную отправку personal speech transcript
в cloud. Но следствие — второй девайс может получить таблицу без канонического track store.

### 2.4 Ограничения slim Media Package v1

Текущий export содержит:

```text
manifest.json
tracks/raw-original.json
tracks/raw-original.vtt
tracks/user-corrected.json
tracks/user-corrected.vtt
mapping/text-binding.json
quality/import-run.json
README.txt
```

Однако:

- media bytes отсутствуют by design;
- export snapshot берёт current raw/current corrected, не гарантирует полный revision history;
- learning table/text-card в package не входит;
- `text_id` является device-local identity и непригоден как единственный portable binding;
- `importSnapshot()` импортирует package/tracks/revisions, но не восстанавливает binding к
  уже импортированной таблице автоматически;
- Library full backup не является гарантированным backup всех first-class Media Package rows;
- package catalog на другом устройстве появляется только после отдельного package import.

### 2.5 Ограничения обычного text/cloud artifact

Сохранённая таблица может ехать через `cloud_texts` как slim `text_bundle`:

- source text и rows сохраняются;
- notes/bookmarks/progress имеют существующие контракты;
- corpus исключён;
- delete/tombstone semantics существуют;
- server replica может быть прочитана Agent Access при consent/grant.

Но:

- Studio cloud engine dormant без login/sync action; авто-sync surface находится в Library;
- Media Package canon не едет;
- media bytes не едут;
- второй девайс не может честно продолжить correction/replay только по text bundle;
- server replica может быть stale относительно owner device.

## 3. Требуемая целевая модель: Import Artifact Graph

### 3.1 Логический граф

```text
media_asset@sha256
  └─produced/input-of─> import_run@id
      └─produced─> raw_track@revision/hash            [immutable]
          └─derived-by-user─> corrected_track@rev/hash
              ├─projected-as─> VTT/SRT@semantic-hash
              ├─bound-to─> learning_material@portable-text-key
              │   ├─contains─> table rows@row-id
              │   ├─anchors─> notes/bookmarks
              │   └─records─> reading/listening progress
              ├─exported-in─> portable_package@manifest-hash
              ├─replicated-to─> device/cloud vault projection
              └─shared-with─> agent projection@scope/TTL/hash
```

### 3.2 Не создавать новую конкурирующую истину

Artifact Graph — граф ссылок и статусов, не generic JSON dump:

- media bytes canon остаётся content-addressed OPFS/object blob;
- caption content canon остаётся `studio_caption_revisions`;
- learning table canon остаётся saved text/sentences с frozen binding;
- review memory canon остаётся append-only `review_log`;
- graph registry хранит typed refs, hashes, availability и edges, но не копирует содержимое;
- passport/VTT/help UI — projections.

### 3.3 Минимальные типы узлов

1. `media_asset` — SHA, MIME, size, duration, codec, per-device availability.
2. `import_run` — selected/actual provider, model/revision, code version, parameters,
   hardware/runtime, input hash, time/cost, consent, warnings, quality report.
3. `caption_revision` — existing raw/corrected revision identity/hash/lineage.
4. `learning_material` — portable text key, exact bound revision/hash, table hash/version.
5. `projection` — VTT/SRT/text-card with source revision/hash.
6. `portable_package` — schema version, file manifest/checksums, included/excluded classes.
7. `device_replica` — device pseudonymous ID, availability/freshness, not content truth.
8. `agent_share` — explicit revision, bounded fields, scope, TTL, revoke/purge state.

### 3.4 Обязательные edges

- `produced_from`;
- `derived_from`;
- `bound_to_revision`;
- `projection_of`;
- `contains`;
- `available_on_device`;
- `missing_media_for`;
- `supersedes`;
- `conflicts_with`;
- `shared_with_agent`.

Все edges ID/hash-based. Titles, filenames и source-line ordinals не являются identity.

## 4. Образовательное закрытие

### 4.1 Импорт не заканчивается в textarea или таблице

Зрелый end state — named learning material, который можно:

- проверить;
- слушать и читать;
- продолжить с места остановки;
- использовать для shadowing/dictation;
- снабжать timestamp notes;
- переносить/восстанавливать;
- экспортировать/удалять;
- безопасно передавать агенту.

### 4.2 Три отдельные пользовательские задачи

#### A. Проверить транскрипт

- raw compare;
- corrected revision;
- focused cue review;
- verified/unverified status не смешивается с grade;
- correction coverage можно показывать только как authoring progress.

#### B. Учиться с источником

- player + exact row/cue;
- A–B repeat;
- micro-shadowing;
- timestamp pronunciation/grammar/free notes;
- bookmarks/chapters;
- last cue/row/media position;
- original/corrected comparison по запросу.

#### C. Практиковать понимание

- listen first, затем reveal corrected text;
- self-report явно маркируется self-report;
- dictation/cloze deterministic-first;
- неответ/timeout не пишет grade;
- agent/LLM не сертифицирует правильность единолично;
- challenge привязан к exact revision/cue.

### 4.3 Что не является blocker образовательного закрытия

- L4 local translation/niqqud;
- L5 diarization;
- forced word alignment;
- local LLM;
- automatic drift correction;
- batch L2.

Они могут расширить объект позже, но не должны задерживать превращение уже готового
corrected transcript в долговечный learning material.

## 5. Artifact completeness и воспроизводимость

### 5.1 Portable Learning Package v2

Рекомендуемый состав:

```text
manifest.json
graph/artifacts.json
graph/edges.json
source/media-ref.json
provenance/import-run.json
quality/report.json
tracks/raw/track.json
tracks/raw/revisions/<revision-id>.json
tracks/corrected/track.json
tracks/corrected/revisions/<revision-id>.json
tracks/projections/<revision-id>.vtt
learning/material.json
learning/table/text-card.json
learning/mapping/segment-row-map.json
learning/optional-notes.json
README.txt
```

Media bytes default: absent. Manifest обязан сказать `media_included:false` и дать
expected SHA/size/MIME/duration/codec.

### 5.2 Portable identity

- package/track/revision/segment IDs сохраняются;
- learning material связывается по portable `text_key`, не только local `text_id`;
- local text/sentence UUID могут remap-иться при import;
- mapping использует portable source/caption IDs + order anchors;
- export timestamps не участвуют в semantic hashes;
- volatile hardware/run fields остаются provenance, но не identity.

### 5.3 История revisions

Два честных export modes:

- `snapshot` — raw + выбранная corrected revision, явно без истории;
- `archive` — raw + все reachable corrected revisions/operations/conflict heads.

Нельзя называть current-only snapshot «полным backup истории».

### 5.4 Import semantics

- verify all checksums before mutation;
- dry-run preview состава;
- transaction/savepoint;
- idempotent reimport = zero duplicates;
- exact ID+hash duplicate = reuse;
- same ID/different hash = hard conflict;
- portable text-key match → explicit rebind preview;
- missing text → import included table;
- missing media → honest usable-text state + relink CTA;
- receipt с imported/reused/skipped/conflicted/missing counts;
- rollback on any integrity failure.

### 5.5 Backup/restore

Полный library backup должен либо включать package archive, либо честно перечислять
Media Packages как `NOT_INCLUDED` и предлагать отдельный backup. Молчаливый backup,
после которого таблица восстановилась, а corrected revisions исчезли, неприемлем.

Минимальный restore drill:

1. export на device A;
2. fresh profile/device B;
3. import;
4. compare artifact graph/hash sets;
5. relink exact media;
6. replay cue and row;
7. reopen after cold restart;
8. re-export and compare semantic set.

## 6. PC → iPhone

### 6.1 Что возможно сегодня теоретически

1. Export slim package на ПК.
2. Перенос ZIP + original media через Files/iCloud Drive.
3. Import slim package на iPhone.
4. SHA relink media.
5. Отдельный import/sync learning table.

Это не единый premium flow, потому что package/table/binding переносятся разными путями.

### 6.2 Рекомендуемый ближайший пользовательский flow

**ПК:**

1. `Использовать на другом устройстве`.
2. Preflight: package revision, table version, media SHA/size/codec, included notes.
3. Export Portable Learning Package v2.
4. Подсказка перенести original media отдельно через Files/iCloud.

**iPhone:**

1. Открыть одну поддерживаемую поверхность — предпочтительно установленную PWA.
2. Import package; получить dry-run и checksum receipt.
3. Table/package binding восстанавливается через portable key.
4. Выбрать media из Files; local SHA verification.
5. Capability check codec/player.
6. Контрольный cue replay и player↔row sync.
7. Request persistent storage where available.
8. Cold reopen доказывает persistence.

### 6.3 Обязательные iPhone gates

- exact owner iPhone model/iOS/WebKit version;
- Safari и Home Screen PWA не объявляются общей БД без доказательства;
- OPFS capability probe;
- `navigator.storage.estimate()` before relink;
- `persisted()/persist()` result recorded;
- quota error and low-space recovery;
- 30–60 minute real audio/video;
- MP4/M4A/AAC baseline плюс honest unsupported-codec state;
- Files/iCloud picker;
- download/export/share behavior;
- background/foreground, screen lock, reload, process kill;
- 380px RU/LTR и HE/RTL;
- no horizontal overflow;
- media object URL cleanup;
- delete/GC receipt.

### 6.4 Почему OPFS не backup

OPFS — origin-private и browser-managed. WebKit storage может быть best-effort,
ограничено quota и подвержено eviction; persistent mode зависит от браузерных heuristics.
Следовательно, UI обязан различать:

- `сохранено на этом устройстве`;
- `защищено portable backup`;
- `синхронизировано`;
- `media доступно на устройстве`.

Один зелёный badge «сохранено» для всех четырёх утверждений будет ложным.

## 7. Cross-device architecture options

### 7.1 Option A — manual portable package + SHA relink

**Плюсы:** минимальная новая privacy-поверхность; нет server content; быстро; работает
через Files/iCloud; хороший независимый backup.

**Минусы:** ручной перенос; нет автоматической freshness; table/package могут разойтись
без composite package.

**Вердикт:** обязательный первый слой и universal fallback.

### 7.2 Option B — расширить существующий server-readable Artifact Sync

Новый `media_package_bundle` едет как class-C server-readable blob под отдельным consent.

**Плюсы:** максимальный reuse; Hermes может читать после отдельного grant; работает при
закрытом source device.

**Минусы:** сервер видит personal transcript; conflict semantics сложнее текущего text LWW;
не подходит для media bytes; требует отдельного lifecycle/security packet.

**Вердикт:** возможен как осознанный privacy tier, но не default рекомендация.

### 7.3 Option C — E2EE device vault

Browser encrypts package revisions; server stores ciphertext/content-addressed chunks.

**Плюсы:** premium privacy; raw/corrected не server-readable; естественный путь к
encrypted optional media; server не становится linguistic/content truth.

**Минусы:** device keys, recovery key, rekey/revoke, conflict protocol, observability и
iPhone crypto/performance complexity; Hermes не может читать ciphertext напрямую.

**Вердикт:** рекомендуемый automatic sync target после manual portability и отдельного
adversarial design packet.

### 7.4 Option D — full-media browser ZIP

**Плюсы:** один файл.

**Минусы:** 100–300MB memory pressure, long blocking generation/import, poor resume,
duplicate media bytes, mobile crash risk.

**Вердикт:** не рекомендован как основной путь. Если seamless media transport становится
нужен — encrypted resumable chunks/object storage сильнее.

### 7.5 Рекомендуемая лестница

1. Portable Package v2 без media.
2. Real iPhone manual transfer/relink.
3. E2EE transcript/package vault.
4. Optional encrypted media chunks только по usage trigger.

## 8. Multi-device conflict semantics

Текущий local stale-draft guard недостаточен после появления двух offline devices.

Требования:

- revisions immutable and append-only;
- sync переносит revision objects, не mutable snapshot overwrite;
- track head — отдельный pointer;
- commit names exact base revision;
- concurrent heads создают conflict branch;
- UI показывает compare/choose/merge;
- merge создаёт новую revision с provenance обоих parents;
- raw никогда не конфликтует через mutation;
- table остаётся bound к exact revision;
- delete — tombstone/receipt, не silent last-write;
- device revoke не удаляет локальную копию на уже offline stolen device, поэтому threat
  model честно различает future access и remote erasure.

Для первого cross-device slice допустим single-editor policy, но он должен быть явным:
secondary device read/replay-only. Нельзя молча применять LWW к corrected transcript.

## 9. Hermes: что он видит и чего не видит

### 9.1 Уже доступно при выполнении consent/grant условий

Hermes может:

- перечислить server-synced personal texts;
- прочитать bounded Hebrew/Russian row windows;
- вычислить deterministic coverage;
- создавать handoffs/proposals существующих типов.

Следовательно, если corrected revision превращена в saved table, таблица доехала через
`cloud_texts`, consent актуален и content grant активен, Hermes может увидеть конечные
строки таблицы.

### 9.2 Не доступно

Hermes не видит:

- Media Package catalog;
- raw/corrected track roles;
- revision history/hash/lineage;
- cue timestamps/speakers/quality flags;
- media SHA/availability;
- stale table binding;
- media bytes/player;
- correction draft;
- package export/delete state.

Он не может вывести эти факты из plain text rows без фабрикации.

### 9.3 Рекомендуемый additive tool sequence

#### H-M1 metadata

`list_media_learning_packages`:

- package/material ID;
- title/duration/language;
- current corrected revision/hash;
- bound table revision/stale;
- media availability coarse state;
- replica freshness/authority;
- no transcript body.

#### H-M2 first-party handoff

`create_media_handoff`:

- exact package/revision/cue/time;
- single-use canonical-origin link;
- browser opens OPFS object;
- agent never receives media bytes.

#### H-M3 bounded corrected content

`get_media_transcript_window` только после отдельного content consent/share:

- selected corrected revision only by default;
- 1–20 cues, byte cap;
- timestamps/text/speaker if explicitly allowed;
- raw requires separate scope;
- revision hash + authority;
- access ledger contains metadata, not content;
- TTL/revoke/purge.

#### H-M4 propose-only actions

- `propose_timestamp_note`;
- позже `propose_caption_correction`.

Execution проходит first-party browser ticket+receipt. Hermes не пишет OPFS/SQLite напрямую,
не мутирует raw, не перепривязывает таблицу и не ставит learning grade.

### 9.4 E2EE и агентский доступ

E2EE vault key нельзя отдавать Hermes. Для работы при закрытом device нужен отдельный
`agent_share` projection:

- конкретный corrected revision;
- явно выбранные fields;
- content hash;
- TTL либо явный persistent grant;
- revoke/purge;
- отдельное раскрытие downstream LLM retention.

Так agent accessibility не разрушает privacy архитектуру device sync.

### 9.5 Acceptance Hermes

- schema/byte/rate/tenant tests;
- scope presentation and consent version;
- content-free audit;
- revoke/purge;
- no grades/SRS/raw media by construction;
- production `tools/list` — только supporting evidence;
- final gate — fresh ordinary Hermes chat вызывает новый tool с реальным разрешённым object.

## 10. Справочный контур: Import Center

### 10.1 Почему текущих подсказок недостаточно

Справка сейчас распределена между Import modal, Local Companion help, transcript shelf,
editor advanced tools, Library backup и cloud sync. Пользователь должен сам понимать:

- где raw и corrected;
- что saved locally означает;
- переносится ли media;
- почему table stale;
- нужен ли повторный ASR;
- что видит Hermes;
- как восстановить объект после смены устройства.

Это системная UX-задача, не одна FAQ-строка.

### 10.2 Import Center как primary surface

Для каждого материала:

```text
Источник ✓ → Распознано ✓ → Проверено v3 ✓ → Таблица v1 устарела
                                      ├─ Продолжить правки
                                      ├─ Создать новую таблицу
                                      ├─ Учиться с источником
                                      ├─ Использовать на другом устройстве
                                      ├─ Создать резервную копию
                                      └─ Разрешить Hermes…
```

Карточка показывает:

- source filename/type/duration;
- Local/Gemini/VTT/SRT и provider provenance;
- raw immutable hash;
- corrected current revision/draft;
- bound tables и stale status;
- media availability on this device;
- portable backup freshness;
- cloud/device state;
- Hermes share state;
- quality warnings;
- last successful integrity check.

### 10.3 Четыре слоя справки

1. **Context help:** короткое объяснение рядом с CTA/error.
2. **Task wizards:** PC→iPhone, relink, restore, stale table, delete.
3. **Reference:** форматы, артефакты, privacy, storage, provider/provenance.
4. **Diagnostics:** content-free support manifest, versions, hashes, quota, codecs,
   missing object, last receipts/gate IDs.

### 10.4 Обязательные honest states

- сохранено локально;
- есть/нет recoverable draft;
- backup отсутствует/актуален/устарел;
- media есть/нет/codec unsupported;
- package/table revision aligned/stale;
- sync off/pending/conflict/error;
- agent access off/metadata/content TTL;
- cloud/model call не требуется;
- повторный ASR не нужен.

## 11. Lifecycle, privacy, security и cost

### 11.1 Data classes

| Объект | Класс | Default |
|---|---|---|
| media bytes | C personal content | local only |
| raw/corrected tracks | C personal content | local only |
| table/text | C для personal source | existing consent policy |
| import/provenance | B/C | local; travels in explicit package |
| agent share | C/D exposure | explicit scope + TTL/purge |
| support diagnostics | B metadata | content-free |

### 11.2 Consent separation

Нельзя переиспользовать один checkbox для разных обещаний:

- sync learning texts;
- sync transcript package;
- sync media bytes;
- allow Hermes metadata;
- allow Hermes corrected content;
- allow raw track;
- downstream LLM retention.

Каждое согласие versioned, revocable, с direction/retention/delete semantics.

### 11.3 Cost

- editor/export/import/relink остаются model-free;
- transcript sync cost — bytes/storage/egress, не LLM;
- media sync имеет отдельный quota/cost ledger;
- Hermes metadata/handoff почти нулевой;
- Hermes content вызывает downstream LLM только в Hermes, что должно быть раскрыто;
- никакого автоматического re-ASR/retranslation после import/sync.

## 12. Adversarial role review

### R2/R17 — образовательность

Риск: построить хороший subtitle/archive продукт без learning loop. Ответ: exact revision
feeds listening/table/practice; correction progress не grade; deterministic-first drills.

### R4 — premium UX

Риск: пользователь видит пять несвязанных экспортов и не понимает, что сохранено. Ответ:
Import Center, stage rail, device availability, task wizards, no repeat-ASR dead end.

### R5 — product

Риск: ручной ZIP/relink выглядит технической функцией. Ответ: один portable learning object,
guided transfer и first-class learning modes. Manual package остаётся universal fallback.

### R9/R11 — authority/do-no-harm

Риск: corrected объявляется «человеческой истиной» целиком; table regenerates silently.
Ответ: per-field authority, immutable raw, frozen binding, explicit new table version.

### R12 — architecture

Риск: graph, package, passport, cloud blob и Hermes share становятся пятью truths.
Ответ: graph хранит refs/hashes; canonical stores не меняются; projections fail closed.

### R13 — migration/recovery

Риск: новый export восстанавливает только happy path или теряет IDs/notes/history.
Ответ: portable keys, dry-run, idempotency, fault injection, fresh-device oracle, rollback.

### R14 — isolation/security

Риск: package/tool существует без user/scope/device boundary. Ответ: authenticated tenant,
separate scopes, byte/rate caps, device revoke, conflict-safe sync, content-free audit.

### R15 — lifecycle

Риск: personal transcript начинает синхронизироваться вслед за table consent. Ответ:
separate package/media/agent consents, local-only default, export/delete receipts.

### R16 — economics

Риск: media auto-sync съедает disk/egress. Ответ: transcript-first, manual relink default,
optional media chunks with quota and trigger.

## 13. Definition of Done по уровням

### Level A — L3a local correction closure

Все owner-live gates §2.2 выполнены и зафиксированы; docs отражают shipped state.

### Level B — Artifact continuity closure

Composite v2 package переносит graph + tracks + exact table/binding; archive/snapshot честны;
fresh-profile restore/re-export oracle PASS.

### Level C — Educational closure

Material имеет correction/study/practice flows, source replay, notes/bookmarks/resume и
revision-bound learning events.

### Level D — Manual cross-device closure

PC→real iPhone→cold reopen→re-export, exact relink, table binding and media replay PASS.

### Level E — Automatic device continuity

Отдельно consented sync, conflict branches, revoke/delete/export, device loss recovery.

### Level F — Hermes closure

Metadata/handoff, затем bounded content/proposals; fresh ordinary-chat owner-live proof;
никакого direct mutation/grade/raw media leakage.

Процесс нельзя объявлять полностью закрытым, если выполнен только один из уровней.

## 14. Утверждённое направление и границы authority

Владелец 2026-08-01 утвердил формализацию исследования и планирование по всем указанным
направлениям. Исследование рекомендует следующий порядок:

1. закрыть current L3a owner-live/canon — ✅;
2. Material Revision + exact derived Artifact Graph/P2-entry contract — ✅;
3. Material Revision Workspace maturity bridge — ✅;
4. Portable Learning Package v2 — **SHIPPED v3.11.289 / PARTIAL OWNER PASS**;
5. real iPhone manual continuity — **NEXT / OWNER-GATED**;
6. Import Center/reference;
7. automatic E2EE package sync после отдельного design/authority;
8. optional encrypted media transport по usage trigger;
9. Hermes metadata/handoff;
10. Hermes bounded corrected-content/propose bridge.

Это **не** разрешение на implementation, browser migration, server migration/API,
cloud upload, E2EE key management, Hermes scope/config mutation, push/deploy или production
data/schema mutation. Каждый соответствующий слайс требует отдельного adversarial design
packet и exact owner authority.

L2 recovery/batch остаётся demand-triggered. L4/L5/L6 и remote-media acquisition не входят
в эту программу автоматически.

### 14.1 Subsequent owner decision: Material Revision Workspace

После production dogfood L3a.2 владелец отдельно утвердил **единый Material Revision
Workspace с двумя слоями** как premium target. Решение уточняет порядок artifact continuity:

1. corrected transcript и learning projection видны в одном material-centric workflow;
2. они остаются разными versioned canon, а не одной mutable формой;
3. обычное сохранение correction/manual field делает zero provider calls;
4. caption change вычисляет deterministic affected row/field impact;
5. manual learning fields защищены от silent provider overwrite;
6. targeted regeneration работает только по явно выбранному affected subset;
7. full-table rebuild — редкое advanced действие, создающее новую revision;
8. previous table revision сохраняется при success/failure/rollback;
9. table-revision/field-provenance contract предшествует Portable Learning Package v2.

Таким образом, coarse `table stale` был правильным L3a safety floor, но не является зрелым
L3b UX/data contract. Package/device continuity не должна переносить этот временный предел как
финальную модель.

Normative implementation packet:
`docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`.

Browser v46, table-revision canon, targeted provider contract и T0–T10 subsequently shipped;
mapping repair/follow reached production `v3.11.286`, the owner observed real-material
revision `v2` with synchronized follow, and first-slot/header polish passed production
automation as `v3.11.287`. P2 Portable Learning Package v2 now requires its own
exact code/schema/push/deploy authority; cloud/E2EE/Hermes authority remains absent.

## 15. Known unknowns, которые должны стать gates, а не предположениями

1. Реальный размер v2 package на 514/2,800 cues и с полной revision history.
2. iPhone model/iOS, Safari vs installed PWA storage behavior на owner device.
3. Codec matrix real owner media.
4. OPFS quota/persist result и behavior при process kill.
5. Нужна ли пользователю concurrent correction на двух devices либо read-only secondary v1.
6. Частота PC↔iPhone переносов, оправдывающая automatic sync.
7. Требуется ли media byte sync либо Files/iCloud relink достаточен.
8. E2EE recovery-key UX и acceptable loss/recovery model.
9. Какие поля corrected track действительно нужны Hermes и на какой TTL.
10. Нужна ли Hermes async работа при закрытых devices, оправдывающая agent-readable projection.
11. Реальный 0/1/N caption→row distribution на owner materials.
12. Какие direct sentence writers должны быть routed/guarded для promoted bound material.
13. Может ли каждый existing provider безопасно принимать affected subset без нового API.
14. Какой measured punctuation-only policy минимизирует лишний stale без скрытой семантики.
15. Performance table-revision compare/impact на 514 и 2,800 cues.

Ни один из этих unknown не блокирует первый design packet Artifact Graph + Portable Package v2.

## 16. P2 entry packet outcome — 2026-08-02

Live code recon froze the implementation contract without code/schema mutation. Artifact Graph
is pure and derived from v45/v46 canon; no registry/edge metadata tables are added. The only
necessary additive schema is proposed v47 `studio_portable_import_receipts`, storing hashes,
counts, rollback pointers and portable↔local maps without copied content. Snapshot/archive,
canonical serialization, strict ZIP limits, no-write dry-run, one-SAVEPOINT Apply, full rollback,
idempotent re-import, full-backup coverage, independent oracle, performance ceilings and exact
allowlist are normative in the packet above. Implementation, push and deploy still require the
separate exact owner sentence in that packet.
