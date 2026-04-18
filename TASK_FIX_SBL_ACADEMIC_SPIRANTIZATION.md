# TASK: Fix SBL Academic Spirantization transliteration bugs

## Context

Project: `tts-prototype-android`

There is a bug in the Hebrew transliteration pipeline for the scheme:

`sblAcademicSpirantization`

The transliteration is currently inconsistent. For a single word it may use the correct SBL Academic spirantized mapping, but for multiple words or for some final Begadkephat letters it falls back to a simplified/non-spirantized transliteration.

This is not acceptable. The transliteration must be fully derived from the actual Hebrew text with niqqud and dagesh, not from word count, not from unpointed Hebrew, and not from a fallback ASCII/simple scheme.

## Current observed bugs

After restarting servers and generating again, the following output is still produced:

| Case | Hebrew | Current output | Expected output | Status |
|---|---|---|---|---|
| Single word | לָלֶכֶת | lāleḵeṯ | lāleḵeṯ | currently correct |
| Two words | לָלֶכֶת מִכָּאן | lāleket mikkāʾn | lāleḵeṯ mikkāʾn | wrong: lost ḵ and ṯ in לָלֶכֶת |
| Word with final bet without dagesh | טוֹב | ṭôb | ṭôḇ | wrong: ב without dagesh must be ḇ |
| Word with pe without dagesh | סֵפֶר | sēper | sēp̄er | wrong: פ without dagesh must be p̄ |

Important: the first word `לָלֶכֶת` is correct when processed alone, but wrong inside a phrase. This strongly suggests that one code path uses the correct SBL function and another code path uses a simplified transliteration path.

## Goal

Fix the transliteration pipeline so that `sblAcademicSpirantization` always follows the full SBL Academic spirantization rules for Hebrew text with niqqud.

The same transliteration function must be used for:

1. one Hebrew word;
2. multiple Hebrew words;
3. table generation;
4. batch generation;
5. regenerated rows after server restart;
6. any UI/API path where the scheme is `sblAcademicSpirantization`.

Do not patch only the four examples. Implement the scheme correctly and add tests for the full table of rules below.

---

# Required behavior

## 1. Begadkephat consonants

For the letters בגדכפת, transliteration depends on presence of dagesh U+05BC.

| Hebrew letter | Without dagesh | With dagesh |
|---|---:|---:|
| ב | ḇ | b |
| ג | ḡ | g |
| ד | ḏ | d |
| כ / ך | ḵ | k |
| פ / ף | p̄ | p |
| ת | ṯ | t |

### Required examples

| Hebrew | Expected transliteration | Notes |
|---|---|---|
| אָב | ʾāḇ | final ב without dagesh → ḇ |
| בַּיִת | bayiṯ | בּ with dagesh → b; final ת without dagesh → ṯ |
| גַּן | gan | גּ with dagesh → g |
| לָלֶכֶת | lāleḵeṯ | כ without dagesh → ḵ; ת without dagesh → ṯ |
| מִכָּאן | mikkāʾn | כ with dagesh → k; preserve existing expected gemination behavior as `kk` |
| טוֹב | ṭôḇ | ב without dagesh → ḇ |
| סֵפֶר | sēp̄er | פ without dagesh → p̄ |
| תּוֹרָה | tôrâ | תּ with dagesh → t |
| אֶת | ʾeṯ | ת without dagesh → ṯ |

---

## 2. Other consonants

| Hebrew letter | Transliteration |
|---|---:|
| א | ʾ |
| ע | ʿ |
| ה | h |
| ו | w |
| ז | z |
| ח | ḥ |
| ט | ṭ |
| י | y |
| ל | l |
| מ / ם | m |
| נ / ן | n |
| ס | s |
| צ / ץ | ṣ |
| ק | q |
| ר | r |
| שׁ | š |
| שׂ | ś |
| מַקֵּף | - |
| יהוה | yhwh |

### Notes

1. Shin/sin must be decided by shin dot U+05C1 and sin dot U+05C2.
2. Final forms must map exactly like regular forms:
   - ך = כ
   - ף = פ
   - ץ = צ
   - ם = מ
   - ן = נ
3. Maqef U+05BE must be transliterated as `-`.
4. The Tetragrammaton יהוה must be transliterated as `yhwh` if the current scheme already treats it specially. Do not break existing behavior.

---

## 3. Vowels / niqqud

| Name | Hebrew sign | Transliteration |
|---|---|---:|
| Sheva vocal | ְ | ə |
| Hataf-segol | ֱ | ĕ |
| Hataf-patah | ֲ | ă |
| Hataf-qamats | ֳ | ŏ |
| Hiriq | ִ | i |
| Tsere | ֵ | ē |
| Segol | ֶ | e |
| Patah | ַ | a |
| Qamats gadol | ָ | ā |
| Qamats qatan | ָ | o |
| Holam | ֹ | ō |
| Qubuts | ֻ | ū |
| Dagesh / mappiq | ּ | not a vowel by itself |
| Shin dot | ׁ | used for š |
| Sin dot | ׂ | used for ś |

### Matres lectionis / long vowels

| Hebrew combination | Transliteration |
|---|---:|
| ֵי | ê |
| ֶי | ê |
| ָה | â |
| ֶה | ê |
| ֵה | ê |
| וֹ | ô |
| וּ | û |
| ִי | î |
| MS suffix | āyw |

### Required vowel behavior

1. Do not strip niqqud before transliteration.
2. Do not lose niqqud when text has more than one word.
3. Do not rely on visual RTL order. Process the actual Unicode string.
4. Normalize input to a stable Unicode form before parsing.
5. Parse Hebrew as base letter + combining marks, not as isolated codepoints.
6. Combining marks may appear in different order; detection must be order-independent.

---

# Suspected root causes to investigate

Perform a repo audit before patching. Search for all transliteration paths and all references to the scheme.

Use PowerShell:

```powershell
cd E:\projects\tts-prototype-android

rg -n "sblAcademicSpirantization|SBL|spirant|spirantization|translit|transliteration|Begad|Beged|בגד|dagesh|niqqud|nikud|vowels|hebrew" .
```

Likely causes:

1. There are two transliteration paths:
   - correct path for a single word;
   - simplified fallback path for phrases / multiple tokens / table generation.

2. Tokenization may strip niqqud or dagesh when the string contains spaces.

3. The phrase/table pipeline may call a generic transliterator instead of the SBL Academic spirantized transliterator.

4. Final letters may be mapped by a simple table:
   - ב → b instead of ḇ when no dagesh;
   - פ → p instead of p̄ when no dagesh;
   - כ → k instead of ḵ when no dagesh;
   - ת → t instead of ṯ when no dagesh.

5. The transliterator may be checking only the base letter and ignoring U+05BC dagesh.

6. Unicode normalization or grapheme parsing may be incorrect.

---

# Required implementation approach

## A. Create or fix one canonical transliteration function

There must be one canonical function for the scheme `sblAcademicSpirantization`.

Expected shape may differ depending on existing code, but conceptually it should behave like:

```ts
transliterateHebrew(input: string, scheme: "sblAcademicSpirantization"): string
```

or:

```ts
transliterateSblAcademicSpirantization(input: string): string
```

All code paths must call this function.

Do not maintain separate logic for:

- single word;
- phrase;
- generated table;
- row regeneration;
- UI display;
- batch mode.

## B. Unicode parsing requirement

The implementation must parse Hebrew into grapheme-like units:

```text
base Hebrew letter + all following Hebrew combining marks
```

For each base letter:

1. collect all marks following it;
2. detect dagesh U+05BC;
3. detect shin dot U+05C1;
4. detect sin dot U+05C2;
5. detect vowel marks;
6. decide consonant output;
7. decide vowel output;
8. append output in logical order.

Do not process combining marks as independent letters.

## C. Begadkephat rule

Implement this exact logic:

```text
if letter in בגדכפת:
    if marks contain dagesh U+05BC:
        use stop/plosive value
    else:
        use fricative value
```

Mapping:

```text
ב without dagesh → ḇ
ב with dagesh    → b

ג without dagesh → ḡ
ג with dagesh    → g

ד without dagesh → ḏ
ד with dagesh    → d

כ/ך without dagesh → ḵ
כ/ך with dagesh    → k

פ/ף without dagesh → p̄
פ/ף with dagesh    → p

ת without dagesh → ṯ
ת with dagesh    → t
```

Important: final forms must also obey this rule.

## D. Do not regress existing correct behavior

The following must remain correct:

| Hebrew | Expected |
|---|---:|
| לָלֶכֶת | lāleḵeṯ |
| מִכָּאן | mikkāʾn |

But the phrase must also be correct:

| Hebrew | Expected |
|---|---:|
| לָלֶכֶת מִכָּאן | lāleḵeṯ mikkāʾn |

---

# Required tests

Add automated tests. Do not rely only on manual browser checks.

Locate the existing test framework first. Then add the smallest appropriate test file near the existing transliteration tests.

Suggested names:

```text
tests/transliteration/sblAcademicSpirantization.test.ts
```

or, if the repo uses another structure:

```text
tests/test_sbl_academic_spirantization.*
```

Use the existing test style of the project.

## Required test cases

### 1. Regression tests for reported bugs

| Input | Expected |
|---|---:|
| לָלֶכֶת | lāleḵeṯ |
| לָלֶכֶת מִכָּאן | lāleḵeṯ mikkāʾn |
| טוֹב | ṭôḇ |
| סֵפֶר | sēp̄er |

### 2. Begadkephat full table

| Input | Expected | Rule |
|---|---:|---|
| בַּ | ba | בּ → b |
| ב | ḇ | ב without dagesh → ḇ |
| גַּ | ga | גּ → g |
| ג | ḡ | ג without dagesh → ḡ |
| דַּ | da | דּ → d |
| ד | ḏ | ד without dagesh → ḏ |
| כַּ | ka | כּ → k |
| כ | ḵ | כ without dagesh → ḵ |
| ך | ḵ | final ך without dagesh → ḵ |
| פַּ | pa | פּ → p |
| פ | p̄ | פ without dagesh → p̄ |
| ף | p̄ | final ף without dagesh → p̄ |
| תַּ | ta | תּ → t |
| ת | ṯ | ת without dagesh → ṯ |

### 3. Other consonants

| Input | Expected |
|---|---:|
| א | ʾ |
| ע | ʿ |
| ה | h |
| ו | w |
| ז | z |
| ח | ḥ |
| ט | ṭ |
| י | y |
| ל | l |
| מ | m |
| ם | m |
| נ | n |
| ן | n |
| ס | s |
| צ | ṣ |
| ץ | ṣ |
| ק | q |
| ר | r |
| שׁ | š |
| שׂ | ś |

### 4. Vowels

| Input | Expected |
|---|---:|
| אַ | ʾa |
| אָ | ʾā |
| אֶ | ʾe |
| אֵ | ʾē |
| אִ | ʾi |
| אֹ | ʾō |
| אֻ | ʾū |
| אְ | ʾə |
| אֲ | ʾă |
| אֱ | ʾĕ |
| אֳ | ʾŏ |

### 5. Matres lectionis

| Input | Expected |
|---|---:|
| אֵי | ʾê |
| אֶי | ʾê |
| אָה | ʾâ |
| אֶה | ʾê |
| אֵה | ʾê |
| אוֹ | ʾô |
| אוּ | ʾû |
| אִי | ʾî |

### 6. Phrase consistency

The transliteration of a phrase must equal the transliteration of each token joined by spaces.

Test:

```text
transliterate("לָלֶכֶת מִכָּאן") === transliterate("לָלֶכֶת") + " " + transliterate("מִכָּאן")
```

Expected:

```text
lāleḵeṯ mikkāʾn
```

### 7. No fallback to simplified ASCII transliteration

The following outputs are forbidden for `sblAcademicSpirantization`:

| Input | Forbidden output |
|---|---:|
| לָלֶכֶת | lāleket |
| לָלֶכֶת מִכָּאן | lāleket mikkāʾn |
| טוֹב | ṭôb |
| סֵפֶר | sēper |
| אֶת | ʾet |
| בַּיִת | bayit |

Add explicit negative assertions if the test framework supports them.

---

# Integration tests

Find the API/table-generation path that produces the final visible table.

Add at least one integration test that calls the same path used by the UI/table generation.

Input:

```text
לָלֶכֶת מִכָּאן
טוֹב
סֵפֶר
תּוֹרָה
אֶת
```

Expected transliteration values:

```text
lāleḵeṯ mikkāʾn
ṭôḇ
sēp̄er
tôrâ
ʾeṯ
```

This test must fail before the fix and pass after the fix.

---

# Manual verification

After implementation, run the relevant servers exactly as the project expects.

Use PowerShell commands only.

First run the automated tests:

```powershell
cd E:\projects\tts-prototype-android

npm test
```

If the repo has targeted tests, run them too. Examples:

```powershell
npm test -- sblAcademicSpirantization
npm test -- transliteration
```

If the repo uses a different test command, inspect `package.json` and use the correct existing command.

Then restart the app/server stack and manually regenerate the table.

Verify that the generated values are exactly:

| Hebrew | Expected transliteration |
|---|---:|
| לָלֶכֶת | lāleḵeṯ |
| לָלֶכֶת מִכָּאן | lāleḵeṯ mikkāʾn |
| טוֹב | ṭôḇ |
| סֵפֶר | sēp̄er |
| תּוֹרָה | tôrâ |
| אֶת | ʾeṯ |

---

# Definition of Done

The task is complete only when all conditions are true:

1. `sblAcademicSpirantization` uses one canonical transliteration implementation.
2. Single-word and multi-word inputs produce the same per-token transliteration.
3. Begadkephat letters obey dagesh vs no-dagesh rules.
4. Final forms obey the same rules as regular forms.
5. `טוֹב` returns `ṭôḇ`, not `ṭôb`.
6. `סֵפֶר` returns `sēp̄er`, not `sēper`.
7. `לָלֶכֶת מִכָּאן` returns `lāleḵeṯ mikkāʾn`, not `lāleket mikkāʾn`.
8. The visible generated table uses the corrected transliteration.
9. Tests cover the full scheme table, not only the four bug examples.
10. There is no silent fallback from `sblAcademicSpirantization` to a simplified transliteration scheme.
11. All relevant tests pass.
12. A short implementation note is added to docs or comments explaining:
    - where the canonical transliterator lives;
    - how dagesh is detected;
    - why phrase/table paths must not use a separate fallback transliterator.

---

# Expected implementation report

After patching, report back with:

1. Files changed.
2. Root cause found.
3. Exact code path that was wrong.
4. How the canonical transliteration path is now enforced.
5. Tests added.
6. Test command output.
7. Manual verification output for:

```text
לָלֶכֶת
לָלֶכֶת מִכָּאן
טוֹב
סֵפֶר
תּוֹרָה
אֶת
```

Expected final output:

```text
לָלֶכֶת        -> lāleḵeṯ
לָלֶכֶת מִכָּאן -> lāleḵeṯ mikkāʾn
טוֹב           -> ṭôḇ
סֵפֶר          -> sēp̄er
תּוֹרָה         -> tôrâ
אֶת            -> ʾeṯ
```
