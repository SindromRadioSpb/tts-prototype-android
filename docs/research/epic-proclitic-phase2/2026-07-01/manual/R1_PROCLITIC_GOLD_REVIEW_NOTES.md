# R1 proclitic gold review — summary
Input: `gold-worksheet.tsv` (332 rows). Output: `gold-worksheet.r1-verified.tsv`.

## Policy applied
- `-` = no live proclitic should be surfaced.
- Fossilized function words/adverbs are suppressed (`-`), not decomposed letter-by-letter.
- Narrative wayyiqtol forms keep verdict `ו`, with a note that it is vav-consecutive, not plain conjunctive “and”.
- Infinitival ל is kept as `ל`, but noted as infinitival/non-dative.
- Reconstructed fused article is included only where niqqud/context was strong enough (`בה`, `לה`, `וה`, etc.).
- Proper-name/name-initial hard negatives are marked `-` unless there is a clear external preposition/conjunction.

## Verdict counts
- `ה`: 100
- `-`: 81
- `ל`: 38
- `ו`: 32
- `ב`: 26
- `מ`: 12
- `בה`: 12
- `ש`: 11
- `לה`: 7
- `כ`: 4
- `ול`: 3
- `וה`: 3
- `ולכשה`: 1
- `מש`: 1
- `וש`: 1

Rows changed vs draft/blank-or-unclear baseline: 147

## Highest-risk corrections
- 12 `לסקרשילר` (לֶסְקֶרְשִׁילֶר): draft `ל` → `-` — surname Lasker-Schüler; initial ל is part of the name, not a proclitic
- 13 `מנח` (מִנֹּחַ): draft `מ` → `-` — context is מונח/מנח “resting/placed”; not מ+נח
- 25 `ויצמן` (וַיְצְמָן): draft `∅` → `-` — hard negative: Weizmann name; ו is part of the name
- 34 `מיכה` (מִיכָה): draft `∅` → `-` — hard negative: מיכה name; מ is part of the name
- 35 `מרים` (מִרְיָם): draft `∅` → `-` — hard negative: מרים name; מ is part of the name
- 36 `משה` (מֹשֶׁה): draft `∅` → `-` — hard negative: משה name; not מ+שה
- 43 `באמת` (בֶּאֱמֶת): draft `∅` → `-` — fossilized/lexicalized function word; suppress live proclitic segmentation
- 47 `בעיקר` (בְּעִקָּר): draft `(unclear)` → `-` — fossilized/lexicalized function word; suppress live proclitic segmentation
- 55 `לאמור` (לֵאמֹר): draft `(unclear)` → `ל` — archaic infinitive ל; sense must be infinitival, not dative
- 56 `לאמר` (לֵאמֹר): draft `∅` → `ל` — archaic infinitive ל; sense must be infinitival, not dative
- 78 `למה` (לְמָה): draft `ל` → `ל` — ל + מה in interrogative phrase; not dative
- 89 `שלך` (שֶׁלְּךָ): draft `ש` → `-` — שלך is possessive של+suffix; ש is not standalone complementizer here
- 91 `כאילו` (כְּאִלּוּ): draft `(unclear)` → `-` — lexicalized כאילו; do not split כ
- 100 `מרוב` (מֵרֹב): draft `(unclear)` → `מ` — מ + רוב in “from most of / by much”; live preposition
- 103 `בבית` (בַּבַּיִת): draft `בה` → `בה` — canonical fused article: ב + ה + בית
- 116 `בעלבית` (בַּעֲלָבִית): draft `ב` → `-` — בעלבית is whole lexical/adjectival form; ב is not locative proclitic
- 117 `בערתשמש` (בערתשׁמשׁ): draft `ב` → `-` — בערת־שמש / burning-sun compound; ב is root/compound-internal, not proclitic
- 123 `בקשתיה` (בְּקַשָּׁתֶיהָ): draft `ב` → `-` — בקשתיה is verb ביקשתיה/“I sought her”; ב is root, not proclitic
- 216 `ולבואך` (וּלְבוֹאֲךָ): draft `ו` → `ול` — ו + infinitival/prepositional ל in לבואך
- 228 `לאנראה` (לָאַנְרָאָה): draft `ל` → `-` — merged לא נראה / adjectival form; not ל + noun
- 239 `למשל` (לְמָשָׁל): draft `ל` → `-` — lexicalized למשל “for example”; suppress live ל segmentation
- 250 `מזהבות` (מִזְּהָבוֹת): draft `מ` → `-` — מזהבות is adjectival/participle “gilded”; מ is derivational, not מן
- 263 `בוקר` (בֹּקֶר): draft `(unclear)` → `-` — whole word בוקר; ב is root
- 266 `בליהרף` (בְּלִהְרָף): draft `(unclear)` → `-` — lexicalized בלי־הרף; do not split ב/בלי
- 275 `הביער` (הֲבִעֵר): draft `(unclear)` → `ה` — interrogative ה; not article
- 277 `הורגלנו` (הֻרְגַּלְנוּ): draft `(unclear)` → `-` — הורגלנו is Hophal/verb morphology; ה is not article/interrogative proclitic
- 283 `הריגולן` (הֲרִגּוּלָן): draft `(unclear)` → `-` — הריגולן is fused הרי־גולן / toponymic compound; initial ה belongs to lexical word הרי, not article
- 284 `השיביני` (הַשִּׁיבֵנִי): draft `(unclear)` → `-` — השיביני is imperative/verb form; ה is binyan/lexical morphology, not article
- 293 `כרותראש` (כְּרֻתְרָאשׁ): draft `(unclear)` → `-` — כרות־ראש: כ is root of כרות, not comparative כ
- 300 `לוקטו` (לֻקְּטוּ): draft `(unclear)` → `-` — לוקטו is passive verb; ל is root/verb morphology
- 329 `שבליהזהר` (שֶׁבְּלִהְזַהֵר): draft `(unclear)` → `ש` — ש + בלי־הזהר; only outer ש is live, inner בלי is lexicalized
