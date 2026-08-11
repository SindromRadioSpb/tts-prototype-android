# Reading Room B6 Scale & Resilience — research evidence

**Дата:** 2026-08-11
**Режим:** research-only, без продуктового кода
**Source commit:** `36ff3ecec07efd779fa589fed6ac03ef41b8d44a`
**Production snapshot:** `v3.11.359`
**Decision packet:** [`ROOM_UX_B6_SCALE_RESILIENCE_DECISION_PACKET_2026_08_11.md`](../../../planning/ROOM_UX_B6_SCALE_RESILIENCE_DECISION_PACKET_2026_08_11.md)

## Граница исследования

- B0–B5 считаются закрытыми и не переоткрываются.
- Исследование проверяет только B6: большой локальный профиль, честность выборки,
  presentation-state, offline/reconnect/update lifecycle и privacy-safe RUM.
- Никакие данные owner-профиля не изменялись. В production был прочитан только
  агрегированный UI; тексты не открывались, review/grade/status не создавались.
- В продуктовые JS/CSS/HTML/DB/SW/server-файлы изменений нет.

## Источники фактов

1. Живой код `public/db/local-db.js`, `public/js/library-ui.js`, `public/sw.js` и
   публичное обещание `docs/PRIVACY.md`.
2. Read-only production UI owner-профиля: `115` личных текстов, `77` групповых,
   `796` готовых из `26 455` Ben-Yehuda, `209` due; версия `3.11.359`.
3. Изолированные Chromium/OPFS профили с `1 000` и `5 000` синтетических личных
   текстов. Каждый текст имел 4 KiB `source_text` и около 4 KiB
   `table_model_meta_json`, чтобы измерить текущий тяжёлый list contract.
4. Отдельный controlled-service-worker smoke: warm online и warm offline reload.

Сырые числовые результаты лежат в
[`SCALE_PROBE_EVIDENCE.json`](./SCALE_PROBE_EVIDENCE.json). Это single-run recon,
а не p95 benchmark. Heap snapshots между отдельными browser contexts сравнивать
нельзя: GC и время снимка различались. В implementation gate нужен повторяемый
cold/warm protocol с CDP GC/heap-delta.

## Короткий вывод

- B1 bounded DOM остаётся зелёным: `48` карточек и `1 048` DOM nodes и при 1k,
  и при 5k.
- B6 query truth красный: UI показывает `48 / 500` при фактических `1 000` или
  `5 000`; поиск последнего текста возвращает `0 / 0`, первого — `1 / 1`.
- Текущий `listTexts({limit:500})` переносит около `8.42 MB` на один browse и
  занимает `1.89 s` на 1k / `5.47 s` на 5k в этих recon-профилях.
- Текущее route/filter/search состояние не попадает ни в URL, ни в
  `history.state`; reload возвращает в hub.
- При заранее активном SW warm shell открылся online и после offline reload.
  Отдельного Room connection-state UI и событийного reconnect refresh код не
  содержит.
- Fresh-install headless прогон дважды столкнулся с OPFS AccessHandle collision
  после автоматического SW reload и остался на skeleton. Это красный сигнал для
  B6 update-lifecycle gate, но не owner-device verdict: нужны отдельный stable
  harness и физические iOS/Android проверки.

## Воспроизводимость следующего этапа

До кода owner должен утвердить packet. После approval первая реализационная
ветка обязана превратить этот recon в committed red gate с теми же 1k/5k
fixtures, tail-search oracle, bounded-DOM assertion и read-back total. Scratch
scripts этого исследования намеренно не публикуются как продуктовый контракт.
