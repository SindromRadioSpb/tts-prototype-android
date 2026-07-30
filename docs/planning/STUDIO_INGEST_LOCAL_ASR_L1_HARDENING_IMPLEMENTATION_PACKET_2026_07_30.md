# Studio Ingest local ASR L1 — owner-approved hardening implementation packet

> **Дата утверждения:** 2026-07-30
> **Статус:** COMPLETED — bounded gates PASS
> **Базовый commit:** `71e61132e224bfb47ee39046309cd9daf8b58e92`
> **Implementation commit:** `33ba3f49129f72e7ce5f5d1eea90c4a674d93407`
> **Объём:** bounded B+C integrity fixes и hardening существующего default-off L1 adapter
> **Не разрешено:** permanent integration, schema migrations, production, deploy, push,
> provider-default changes, cloud spend, Gemini media upload, L2–L6.

## 1. Решение владельца

Владелец заменил прежнее ограничение «только evidence-closure» на bounded
implementation/hardening slice. Разрешено реализовать известные B+C integrity defects и
исправления уже существующего default-off Studio Local ASR adapter.

Расширенный human-gold `>=60 минут / >=12 дикторов`, поиск публичного корпуса, blinded owner
listen/read packet и полный paired Gemini run исключены из текущего slice и не должны
задерживать разработку. Их отсутствие остаётся открытым permanent-integration evidence gap;
batch-20 является только regression gate, не population-quality proof.

## 2. Неизменяемая модельная граница

```text
model     ivrit-ai/whisper-large-v3-turbo-ct2
revision  72ad623a37947395efcc3933132353790e5a12f5
```

Full large-v3 не используется как default, fallback или comparison provider. Revision,
compute type, decode/VAD/beam/timestamp policy не меняются без нового измеряемого решения.

## 3. Implementation scope

В порядке приоритета:

1. `exportBundle`/`importBundle` parity с text-card-v2 по row provenance, timing/segment
   metadata и `niqqud_derived`.
2. Additive/versioned persistence устойчивого `source_segment_id`; разведение
   `source_segment_id`, `source_line_index` и premium `sentence_index` с backward compatibility.
3. Content-identity guard против молчаливого duplicate import с новым случайным `text_key`.
4. `text_audio_asset_key` export/import/backup round-trip.
5. Запрет UPDATE чужой карточки через stale `baseTextId` в обычном import/draft flow.
6. Исправления реальных дефектов существующего L1 adapter, найденных focused browser checks.

Schema migrations запрещены. Если отдельный пункт нельзя честно реализовать через существующие
versioned JSON/passport/export shapes, он получает decision gap; остальные пункты продолжаются.

## 4. Пропорциональные gates

- regression test до каждого исправления;
- frozen L0 batch-20 через sidecar: 20/20 terminal, WER `<=5%`, CER `<=2%`, без silent
  fallback/integrity failures;
- Chrome: полный default-off/pair/upload/progress/cancel/retry/delete/sidecar-down flow при
  `380x844` RTL;
- Edge и Firefox: focused real-browser loopback/pairing/Origin/PNA/CORS/upload-start/no-fallback;
- релевантные Python/Node/i18n/API/round-trip tests;
- adversarial diff review по R4/R5/R9/R11/R14/R15/R16.

Новый расширенный corpus, YouTube acquisition, blinded worksheet и большой benchmark в этом
slice не выполняются. Gemini runner/cost manifest допустим только после основной реализации,
без вызовов и если не задерживает код.

## 5. Lifecycle и closure

- unrelated dirty/untracked файлы сохраняются и не входят в коммиты;
- временные jobs/media удаляются, deletion receipt фиксируется;
- evidence кладётся в
  `docs/research/studio-local-processing/2026-07-30/evidence-closure/`;
- обновляются `L1_IMPLEMENTATION_EVIDENCE.md`, `l1-evidence-report.json` и roadmap с честным
  разделением implemented / verified / deferred;
- разрешены только scoped local commits; push/deploy запрещены.

## 6. Stop conditions

STOP и отдельное решение владельцу, если требуется schema migration, permanent/provider policy,
production/deploy/push, cloud upload/spend, remote-media acquisition, изменение model/runtime
pin, L2–L6 или выход за зафиксированный allowlist.

## 7. Closure result

- B+C items 1–5 implemented without schema change;
- frozen sidecar batch-20: 20/20, WER 2.597%, CER 0.926%, no retry/fallback;
- Chrome 150 and Edge 150 system binaries PASS; Firefox-engine 146 PASS with stock Firefox 153
  automation limitation recorded;
- 380×844/RTL and all authorized lifecycle scenarios PASS; cloud requests = 0;
- focused tests, API, compile and real DB round-trip PASS;
- temporary jobs/model/media/process state deleted.

Permanent integration remains outside this packet and is still NO-GO.
