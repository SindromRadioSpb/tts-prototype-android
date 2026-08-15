# Reading Room Library/Corpus surface program — closure

Дата закрытия: 2026-08-15

Статус: **CLOSED · OWNER ACCEPTED · PRODUCTION 3.11.388**

Ветка: `main`

Closure baseline: `6bc578b17712bddf70d7d8e1cf3b4667b359f4fa`

Production URL: `https://linguistpro.kolosei.com/library.html`

Production read-back при закрытии: client/SW `3.11.388`; application, DB и
migrations ready.

Dirty tree: 34 существовавших ранее посторонних tracked/untracked entries;
они не входят в эту программу и не публикуются этим закрытием.

## Закрытые срезы

| Срез | Release chain | Итог |
|---|---|---|
| Library/Corpus Surface Unification | `e1d95f06` (`3.11.385`), `24736188` (`3.11.386`) | Global Reading Journey закреплён за Library/L0; корпуса получили corpus-local browse; reading lists консолидированы; рабочие коллекции переведены в bounded vertical rows; typed disclosure сохранён |
| Corpus Discovery & Catalog | `755a25ff` (`3.11.387`) | Во всех корпусах закреплён порядок identity → Continue/Start → optional profile-fit → Catalog → controls → bounded results → management; сортировка больше не скрывает независимую проекцию |
| Audio/TTS Indicator Parity | `86916313` (`3.11.388`), evidence `6bc578b1` | Reading Room восстановил Studio-compatible состояния row-audio indicator, immediate repaint после TTS и reload persistence через существующие canonical audio writers |

## Owner acceptance

После production-релиза Library/Corpus и Discovery владелец сообщил, что
тестирование прошло успешно, а найденный затем audio-indicator дефект существовал
значительно раньше и не был вызван этой разработкой.

После выпуска `3.11.388` владелец отдельно подтвердил:

> тестирование прошло успешно

и перечислил фактически проверенные строки:

- у `Position 1. אושר כהן - כולם גנבים` все кружки зелёные;
- после нового TTS серый кружок сразу становится зелёным;
- состояние сохраняется после reload.

Владелец затем явно распорядился документально закрыть все три среза. Это
owner-reported production evidence. Оно не переименовывается в automation,
physical-device или assistive-technology evidence.

## Замороженный продуктовый контракт

### Surface ownership

- Library/L0 владеет global Reading Journey: Continue, Finished, Bookmarks и
  единым модулем Reading Lists.
- Ben-Yehuda, My Texts и Study Songs владеют corpus identity, corpus-local
  continuation, каталогом, поиском/фильтрами/сортировкой и management.
- Глобальные learner projections не дублируются по корпусам.
- Named reading lists остаются owner data; голый destructive `×` не является
  допустимым контрактом удаления.

### Discovery and catalog

- `Подходит по вашему профилю слов` — bounded read-only projection, а не
  обещание понимания, assignment или сохранённый recommendation feed.
- Блок показывается только при наличии минимум двух надёжных альтернатив;
  честное отсутствие в My Texts/Study Songs не является регрессией.
- Search/filter/sort управляют только явно обозначенным Catalog region.
- Ben Ready остаётся bounded preview с явным `Показать все`; unbounded DOM для
  796+ работ запрещён.

### Material and section grammar

- Рабочие коллекции используют полноширинные compact rows без горизонтальной
  прокрутки; семантические различия Continue, Bookmark, Finished, profile-fit,
  Reading List и Ready сохранены.
- Header содержит title, count, optional secondary action и typed disclosure
  справа в первой строке; explanation расположен отдельно.
- `aria-expanded`, `aria-controls`, predictable focus, RU/EN/HE/RTL и
  persisted disclosure state остаются обязательными.

### Audio/TTS indicator

- persisted usable audio → green `state-ok`;
- missing audio → neutral `state-missing`;
- complete but different TTS profile → amber `state-mismatch`;
- fresh TTS меняет индикатор сразу и сохраняет существующими
  `upsertAudioAsset()` / `linkSentenceAudio()` writers;
- доступное имя сообщает статус не только цветом.

## Truth и migration boundary

```text
NEW_PROGRESS_WRITER=NONE
NEW_BOOKMARK_WRITER=NONE
NEW_FINISHED_WRITER=NONE
NEW_REVIEW_LOG_WRITER=NONE
NEW_READING_LIST_WRITER=NONE
NEW_RECOMMENDATION_WRITER=NONE
SCHEMA_CHANGE=NONE
MIGRATION=NONE
LOCALSTORAGE_FORMAT_EVOLUTION=NONE
OWNER_DESTRUCTIVE_ACTIONS=NONE
```

## Evidence ledger

- Library/Corpus production evidence:
  [`PRODUCTION_RELEASE_EVIDENCE.md`](../research/room-library-surface-unification/2026-08-14/implementation/PRODUCTION_RELEASE_EVIDENCE.md).
- Discovery/Catalog production evidence:
  [`RELEASE_EVIDENCE.md`](../research/room-library-surface-unification/2026-08-14/implementation/discovery-catalog-2026-08-15/RELEASE_EVIDENCE.md).
- Audio/TTS parity evidence:
  [`ROOM_AUDIO_TTS_INDICATOR_PARITY_IMPLEMENTATION_EVIDENCE_2026_08_15.md`](./ROOM_AUDIO_TTS_INDICATOR_PARITY_IMPLEMENTATION_EVIDENCE_2026_08_15.md).
- Decision packet:
  [`ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`](./ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md).

Kapture evidence остаётся desktop Chrome evidence. 380px/RTL automation не
является физическим iPhone/Android или VoiceOver/NVDA/TalkBack evidence. Два
optional Ben-Yehuda shard 404, записанные во время audio verification, не были
внесены этой программой и не влияли на row-audio контракт.

## Freeze boundary

Три среза закрыты и не должны переоткрываться для общего редизайна. Re-entry
допустим только при конкретном regression evidence, security/data/accessibility
дефекте либо в отдельно утверждённом successor scope.

B9 не является продолжением Library/Corpus implementation. Следующий этап —
отдельный research-only goal **ROOM-UX-B9 — Curated Paths & Assignments**:
[`ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_RESEARCH_SESSION_PROMPT_2026_08_15.md`](./ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_RESEARCH_SESSION_PROMPT_2026_08_15.md).

