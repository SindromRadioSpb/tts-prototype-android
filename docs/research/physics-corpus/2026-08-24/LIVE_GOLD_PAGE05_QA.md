# Live gold QA — page 05

Date: 2026-08-24

Source: `для оцифровки учебника_2_Страница_05_Изображение_0001.png`

Source SHA-256: `dee68b75334ebc60d3f687af32f16fd1168fcc35e6d9b9fa3e255a9e7e899f10`

Provider/model: Google Gemini / `gemini-3.7-flash`

Tasks on page: 1.1, 1.2

## Verdict

The new OCR and Russian translation are materially better than the legacy tables, but the first generated niqqud column is not acceptable as batch gold. A corrected prompt, consonantal-drift guard, exact Hebrew source-coverage guard, and deterministic learner-Latin transliteration must pass one page-05 retry before the three prepared PDFs are sent.

## OCR checked against the source image

Correct improvements over legacy data include `הצומת C`, `החותך`, `בנקודה N מאיץ הנהג`, `חותך`, `מהי`, and `M ו-N`. In task 1.2 the source image supports `תאוצת ... בתחילת העקיפה`, `ותאוטתו`, and the final `קטע נוסף של תאוטה`.

One new OCR defect remains: the first body occurrence `שווה-תאוצה` must be `שוות-תאוצה`, as printed in the image.

## Translation comparison

The most consequential legacy error was corrected: legacy `בנקודה זו עוזב...` led to a Russian statement that the vehicle “leaves”, while the new OCR has `בנקודה N מאיץ הנהג...` and the new Russian correctly says that the driver accelerates the vehicle. Task 1.2 now also distinguishes acceleration (`תאוצה`) from deceleration (`תאוטה`).

Similarity is diagnostic, not an acceptance score:

| Task | Hebrew plain | Hebrew niqqud | Translit | Russian | Legacy rows | Gold rows |
|---|---:|---:|---:|---:|---:|---:|
| 1.1 | 0.958569 | 0.941402 | 0.877816 | 0.828514 | 12 | 8 |
| 1.2 | 0.966942 | 0.961257 | 0.904762 | 0.823263 | 11 | 5 |

The lower Russian similarity mostly reflects corrected meaning and improved sentence segmentation, not degradation.

## Niqudd defects in the first live table

- `אֶופַנּוֹעַ` is incorrect; the Hebrew Language Academy entry is [`אוֹפַנּוֹעַ`](https://terms.hebrew-academy.org.il/munnah/19129_1/%D7%90%D7%95%D6%B9%D7%A4%D6%B7%D7%A0%D6%BC%D7%95%D6%B9%D7%A2%D6%B7).
- The generated `אׇפְקִי` does not match the Academy entry [`אָפְקִי`](https://terms.hebrew-academy.org.il/munnah?kodErekhIvrit=1621).
- Some model rows changed spelling or morphology while adding niqqud. Full-to-defective spelling involving matres may be legitimate (`שתיים` / `שְׁתַּיִם`), but consonantal or lexical drift such as `שווה` / `שְׁוַת` is rejected.

## Approved transliteration profile

The corpus uses deterministic, ASCII learner Latin matching the existing tables and the approved example:

`Perek 1: be'ayot bitkhum tnu'a shvat te'utsa`

This is generated locally from `he_niqqud`; it does not consume another Gemini request. SBL Academic and Russian-phonetic profiles remain available separately.

## Evidence boundary

The exact rendered rows and OCR text are preserved in `live-gold-page05-rendered-evidence.json`; the automated legacy comparison is in `live-gold-page05-comparison.json`. The browser exposed native JSON download buttons, but its extension did not retain the Blob downloads, so the evidence is explicitly a rendered-DOM capture and does not claim to be a native export.

## Owner-approved corrected-text retry — application 3.11.427

The owner approved exactly one local correction, `שווה-תאוצה` → `שוות-תאוצה`, and exactly one corrected-text request to Google Gemini 3.7 Flash. The 1,097-character source then contained zero wrong occurrences and two correct occurrences; its corrected-text SHA-256 is `05c232cf922ba0d243a6f2abedcf417af513860554824af6b65071b78d62b0d8`.

The request succeeded and rendered 16 rows. The UI identified the result as generated through the Gemini API, advanced usage to total 76 and `Сегодня: 2 / 50`, and exposed `Обновить таблицу` after completion. No second request was sent. The approved learner-Latin heading is exact:

`Perek 1: be'ayot bitkhum tnu'a shvat te'utsa`

The corrected source removed the prior row-3 consonant mismatch, but the returned niqqud is still not acceptable as batch gold:

- row 11 generated `אֶוֹפַנּוֹעַ`, while the Academy form is `אוֹפַנּוֹעַ`;
- row 11 generated `אֹפְקִי`, while the Academy form is `אָפְקִי`;
- the malformed motorcycle niqqud propagated into learner transliteration as `Evofano'a` / `ha'evofano'a`, rather than the required `Ofno'a` / `ha'ofno'a` family.

Therefore the corrected retry validates the forced-regeneration workflow, source correction, request accounting, source coverage, and the exact approved chapter transliteration, but it does **not** approve the current Gemini niqqud output for the three-PDF batch. The exact retry rows are in `live-gold-page05-retry-02-rendered-evidence.json`; the refreshed legacy comparison is in `live-gold-page05-retry-02-comparison.json`.

## Production local-repair acceptance — application 3.11.429

Application 3.11.429 was accepted on production after a bounded Docker build-cache/image cleanup recovered the host from 100% to 69% disk usage without touching volumes. Seven consecutive no-cache client-config probes returned `3.11.429`; `/healthz` reported `ok=true`, database ready, migrations ready, and `disk_warn=false`.

On a fresh production load the previously cached 16-row table repaired itself through the shared audited local normalizer. The UI reported `таблица восстановлена и исправлена локально (без запроса к Gemini)`. Usage remained total 76 and `Сегодня: 2 / 50`, proving that the repair did not consume a provider request. The rendered table contained none of `אֶוֹפַנּוֹעַ`, `אֹפְקִי`, or `Evofano'a`, and did contain `אוֹפַנּוֹעַ`, `וְאָפְקִי`, `Ofno'a`, and the exact approved heading `Perek 1: be'ayot bitkhum tnu'a shvat te'utsa`.

Machine-readable acceptance evidence is preserved in `live-gold-page05-production-local-repair.json`. This closes the page-05 niqqud/transliteration preflight without another Gemini call; it does not by itself approve unseen vocabulary in the remaining three PDF batches.
