# Thesis Bilingual Workflow — Formal Rule-Set

> **Назначение.** Зафиксировать workflow для bilingual thesis (EN
> canonical + RU mirror) так, чтобы синхронизация не drift'илась между
> сессиями. Один файл правил, на который ссылаются `thesis/*.md`,
> `thesis/*.ru.md`, и memory.
>
> **Контекст.** User выбрал Option D из 4-х предложенных вариантов
> 2026-05-22: paired files + GLOSSARY + sync invariant. RU — для full
> comprehension автора (его родной язык); EN — deliverable thesis
> submission. **Никогда не должны drift'иться.**
>
> **Approved.** 2026-05-22 by user during Chapter 4 drafting kickoff.

---

## 1. Naming convention

```
thesis/
├── 01_introduction.md              ← EN canonical (для thesis submission)
├── 01_introduction.ru.md           ← RU mirror (для author review)
├── 02_related_work.md
├── 02_related_work.ru.md
├── 03_system_design.md
├── 03_system_design.ru.md
├── 04_privacy_contribution.md
├── 04_privacy_contribution.ru.md
├── 05_methodology.md
├── 05_methodology.ru.md
├── 06_results.md                   ← после пилота
├── 06_results.ru.md
├── 07_discussion.md
├── 07_discussion.ru.md
├── 08_conclusion.md
├── 08_conclusion.ru.md
├── GLOSSARY.md                     ← bilingual term mappings (стабильные RU↔EN пары)
├── OSF_PREREGISTRATION_DRAFT.md    ← EN-only (registered artifact, не часть thesis body)
├── OSF_FORM_FIELDS.md              ← EN-only (operational tool)
└── IRB_FRAMEWORK_DRAFT.md          ← EN-only (intermediate artifact — материал для §4.7)
```

**Convention rules:**

- **Filename pattern:** `NN_section_slug.md` (EN canonical) + `NN_section_slug.ru.md` (RU mirror). Identical basename + `.ru.md` suffix.
- **Section numbering identical:** §4.1 в EN file = §4.1 в RU file. Same heading hierarchy, same anchor IDs.
- **Operational artifacts (OSF / IRB drafts) — EN-only.** Это не thesis body — это working artifacts. RU mirror не нужен; их содержимое summarized в Russian при необходимости.
- **`GLOSSARY.md` — единый файл** для всех глав. Растёт по мере появления новых терминов.

## 2. Sync invariant (the core rule)

> **Любая правка одного из paired files MUST trigger immediate
> corresponding edit в parnter file. Никогда коммит на main с
> рассинхронизированными paired files.**

**Concrete enforcement:**

1. **Atomic dual update.** Drafting/editing сессии touch BOTH files в одном logical unit. Не «сначала EN, потом потом RU» — это и есть drift risk.

2. **Same-day timestamp parity.** В header каждого файла `Last updated:`
   field. После любого editing session оба файла имеют **identical**
   timestamp + identical section status.

3. **Section-level TOC parity check.** В начале каждой write-up session:
   ```bash
   grep '^## ' thesis/04_privacy_contribution.md
   grep '^## ' thesis/04_privacy_contribution.ru.md
   ```
   Output должен match exactly (same headings in same order). Если нет —
   разбираемся **до** того как продолжать drafting.

4. **GLOSSARY append-only invariant.** Каждый новый key term получает
   запись в GLOSSARY на момент первого появления в любой из глав. После
   фиксации term'а в GLOSSARY — все последующие occurrences в обеих
   языках используют этот canonical mapping.

## 3. Translation philosophy

> **Цель — meaning-preservation, не word-mapping.** Оба файла должны
> читаться natively на своём языке, а не как буквальный перевод друг
> друга.

**Что это означает практически:**

- **Academic register каждого языка свой.** Английский academic style
  допускает direct первое лицо во множественном числе («we argue»,
  «we show»). Русский academic style исторически более passive
  («показывается», «утверждается») но современный тренд допускает «мы»
  тоже. Используем «we» / «мы» в обоих — modern academic convention.
- **Idioms не переводим буквально.** «The deliverable is infrastructure
  for finding things ethically» → не «доставка — инфраструктура для
  нахождения вещей этично» (калька), а «результат настоящей работы —
  инфраструктура для этичного и воспроизводимого получения находок» или
  более идиоматично.
- **Sentence boundaries могут не совпадать.** EN sentence из 35 слов
  может стать в RU двумя sentences по 18 слов. Это нормально — главное
  что paragraph-level claims идентичны.
- **Paragraph breaks — must match.** §-level и paragraph-level breaks
  identical between EN и RU. Это даёт reviewers point-by-point
  alignment.
- **Citations identical.** `[TODO: cite Sweeney 2002]` маркер
  присутствует ровно одинаково в обоих файлах. После замены на real
  citation — заменяется одновременно в обоих.
- **Числа, формулы, code references — identical.** «N = 28 для r = 0.5»
  → «N = 28 для r = 0.5» (числа не переводятся даже формально).

**Конфликт fidelity vs idiomaticness — fidelity wins.** Если natural
RU прочтение получает claim немного иной формулировки чем natural EN,
надо переписать **обе версии** так чтобы они означали одно и то же.
GLOSSARY помогает фиксировать сложные термины.

## 4. Drafting cadence protocol

**Per-section workflow (Role 1, BRIEF §9):**

1. **Я draft EN section.**
2. **Сразу же** (same tool-call unit) — mirror RU section в paired
   file. Не отдельной сессией, не «позже» — атомарно.
3. **Я добавляю новые terms в GLOSSARY.md** если в секции появились
   notable RU↔EN pairs.
4. **User читает RU section first** (full comprehension), потом
   verify EN на technical accuracy.
5. **Single sign-off покрывает оба файла.** Они synchronized по
   construction.
6. **Любая subsequent edit** = atomic dual update.

**При user request на edit:**

- Если запрос приходит на RU («измени формулировку H1 в §4.3.1 на ...»)
  — я делаю edit в обоих файлах одновременно.
- Если запрос приходит на EN — то же.
- Если запрос приходит на «оба варианта расходятся, верни consistency»
  — я identify drift и применяю corrective edit.

## 5. Sign-off rule

**Sign-off от user НА RU IS sign-off на EN.** Пара synchronized по
construction. Если user не согласен с EN формулировкой — это требует
edit в обоих файлах (см. §3 «conflict resolution»).

**Implication для review pace:** user не нужно читать оба файла каждой
сессии — только RU. Это и есть raison d'être этого workflow.

## 6. Glossary maintenance

`thesis/GLOSSARY.md` — single source of truth для term mappings.

**Когда добавлять запись:**

- Новый technical term появляется впервые в любой главе.
- Existing term получает refined / context-specific RU translation.
- Term показывает inconsistent translations в разных секциях (выявляется
  через grep) — нужна canonical resolution.

**Когда менять существующую запись:**

- Только если есть конкретный grounded reason (e.g. supervisor
  preference, native review feedback). При изменении entry — **все
  occurrences в обеих языках обновляются consistency check'ом**.

## 7. Exceptions (когда RU mirror НЕ нужен)

- **OSF artifacts** (`OSF_PREREGISTRATION_DRAFT.md`, `OSF_FORM_FIELDS.md`)
  — registered на OSF на EN, локальный artifact на EN. Не часть thesis
  body.
- **IRB framework draft** (`IRB_FRAMEWORK_DRAFT.md`) — intermediate
  artifact, integrated в §4.7 of thesis (где уже будет paired RU).
  Самостоятельный RU mirror не нужен.
- **Code comments, schema docs, RESEARCHER_GUIDE** — operational docs,
  не thesis body. Существующие language conventions сохраняются.
- **Closure plan / audit / memory** — working documents on RU
  (преимущественно), не EN deliverables. Bilingual sync не применим.

## 8. Drift detection и recovery

**Sanity checks в начале каждой write-up session:**

1. **TOC parity:** `grep '^## ' thesis/04_*.md` vs `grep '^## '
   thesis/04_*.ru.md` — same heading list.
2. **Timestamp parity:** `Last updated:` field в обоих headers
   совпадает.
3. **Word-count sanity:** EN word count vs RU word count в пределах
   ±25% (typical RU expansion). Большее расхождение → drift suspect.

**Recovery если drift обнаружен:**

1. Identify diverging section.
2. Read both versions side-by-side.
3. Decide canonical version (обычно — последняя touch'ed).
4. Re-sync partner.
5. Update both timestamps + commit single «sync» commit.

## 9. Цитата rules в bilingual context

- APA 7 citations identical в обоих файлах (author + year unchanged
  across languages).
- Inline citation form: `(Sweeney, 2002)` в EN = `(Sweeney, 2002)` в RU
  (no transliteration of author name).
- Bibliography section (Chapter 9 равноимущественная или appendix) — EN
  canonical. RU thesis tradition позволяет cite EN sources в их
  оригинальной форме.
- TODO citations: identical marker `[TODO: cite Sweeney 2002
  k-anonymity]` в обоих файлах.

## 10. Final deliverable derivation

Когда thesis готов:

- EN file → pandoc → final PDF/DOCX для submission в международный вуз.
- RU file → reading reference для author, supervisor (если RU-speaking),
  публикации на русскоязычной площадке (если случится).
- GLOSSARY → appendix к thesis (если supervisor запросит) — показывает
  terminology accountability.

**При publication thesis** — EN version is the authoritative
publishable artifact. RU mirror — для author records / future RU
preprint.

---

## 11. Tripwires (что НЕ делать)

- ❌ Не делать edit только в одном файле «потом synchronizeу».
  Atomic dual update — invariant, не рекомендация.
- ❌ Не переводить word-by-word. Natural academic register обоих
  языков — приоритет.
- ❌ Не append new sections / новые headings без обновления partner
  файла **в той же сессии**.
- ❌ Не trust GLOSSARY blindly — context может потребовать nuanced
  translation. Если consistent — добавлять new entry; если
  context-specific — note в footnote или comment.
- ❌ Не считать RU mirror «черновиком EN». Они peer artifacts,
  paired, equal authority. Single source of truth per term is
  GLOSSARY.

## 12. Future cohort question

Когда / если **HE** native review consent template приходит — мы
получаем 3-язычный artifact (RU/EN/HE). Этот workflow покрывает только
RU↔EN; HE handling — separate decision (likely HE-only locales file,
not full thesis chapter mirror).

---

**Authorship.** Workflow document drafted 2026-05-22 by author during
Chapter 4 §4.1 sign-off. Approved by user via Option D selection in
bilingual workflow question. This document is the authoritative
reference for all future paired-file editing in `thesis/`.
