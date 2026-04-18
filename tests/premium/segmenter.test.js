"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { segment } = require("../../db/premium/segmenter");
const { normalizeForDisplay } = require("../../db/premium/normalize");

// Helper: returns just the `he` array — most tests don't care about index.
function texts(input) {
  return segment(normalizeForDisplay(input)).map((s) => s.he);
}

// ---------- 1. Empty / boundary ----------

test("empty string → []", () => {
  assert.deepEqual(segment(""), []);
});

test("whitespace-only → []", () => {
  assert.deepEqual(segment("   \n\n\t  "), []);
});

test("non-string input → []", () => {
  assert.deepEqual(segment(null), []);
  assert.deepEqual(segment(undefined), []);
  assert.deepEqual(segment(42), []);
});

// ---------- 2. Single-segment cases ----------

test("single sentence without punctuation", () => {
  assert.deepEqual(texts("שלום עולם"), ["שלום עולם"]);
});

test("single sentence ending with period", () => {
  assert.deepEqual(texts("שלום עולם."), ["שלום עולם."]);
});

test("single sentence ending with exclamation", () => {
  assert.deepEqual(texts("שלום עולם!"), ["שלום עולם!"]);
});

test("single sentence ending with question mark", () => {
  assert.deepEqual(texts("מה שלומך?"), ["מה שלומך?"]);
});

test("single sentence ending with Hebrew sof pasuq", () => {
  assert.deepEqual(texts("בְּרֵאשִׁית בָּרָא אֱלֹהִים׃"), ["בְּרֵאשִׁית בָּרָא אֱלֹהִים׃"]);
});

// ---------- 3. Multi-segment splits ----------

test("two sentences split on period+space", () => {
  assert.deepEqual(texts("שלום עולם. ברוך הבא."), ["שלום עולם.", "ברוך הבא."]);
});

test("three sentences with mixed punctuation", () => {
  assert.deepEqual(
    texts("בוקר טוב! מה שלומך? אני בסדר."),
    ["בוקר טוב!", "מה שלומך?", "אני בסדר."]
  );
});

test("consecutive punctuation !? treated as one boundary", () => {
  assert.deepEqual(texts("מה?! לא נכון."), ["מה?!", "לא נכון."]);
});

test("paragraph break (\\n\\n) splits sentences", () => {
  assert.deepEqual(
    texts("שלום עולם\n\nברוך הבא"),
    ["שלום עולם", "ברוך הבא"]
  );
});

test("multiple blank lines treated as single paragraph break", () => {
  assert.deepEqual(
    texts("שלום\n\n\n\nעולם"),
    ["שלום", "עולם"]
  );
});

test("single newline acts as a sentence boundary", () => {
  assert.deepEqual(
    texts("שלום עולם\nברוך הבא"),
    ["שלום עולם", "ברוך הבא"]
  );
});

test("trailing whitespace after punctuation does not produce empty segment", () => {
  assert.deepEqual(texts("שלום.   "), ["שלום."]);
});

test("leading whitespace stripped", () => {
  assert.deepEqual(texts("   \nשלום."), ["שלום."]);
});

test("indexes are 1-based, monotonic, dense", () => {
  const segs = segment(normalizeForDisplay("ראשון. שני. שלישי."));
  assert.deepEqual(segs.map((s) => s.index), [1, 2, 3]);
});

// ---------- 4. Hebrew abbreviation whitelist ----------

test("ד״ר (Dr.) does not split", () => {
  assert.deepEqual(texts("ד״ר כהן הגיע. הוא רופא."), ["ד״ר כהן הגיע.", "הוא רופא."]);
});

test("עו״ד (lawyer) does not split", () => {
  assert.deepEqual(texts("עו״ד לוי דיבר. אז הלך."), ["עו״ד לוי דיבר.", "אז הלך."]);
});

test("פרופ׳ does not split", () => {
  assert.deepEqual(texts("פרופ׳ ישראלי הרצה. כולם הקשיבו."), ["פרופ׳ ישראלי הרצה.", "כולם הקשיבו."]);
});

test("מס׳ (number-abbrev) does not split", () => {
  assert.deepEqual(texts("ראה מס׳ 7 ברשימה. הוא חשוב."), ["ראה מס׳ 7 ברשימה.", "הוא חשוב."]);
});

test("וכו׳ (etc.) does not split", () => {
  assert.deepEqual(texts("פירות וירקות וכו׳ מומלצים. בריאות."), ["פירות וירקות וכו׳ מומלצים.", "בריאות."]);
});

test("ת״א (Tel Aviv) does not split", () => {
  assert.deepEqual(texts("גרים בת״א כבר שנה. אוהבים את העיר."), ["גרים בת״א כבר שנה.", "אוהבים את העיר."]);
});

test("ארה״ב (USA) does not split", () => {
  assert.deepEqual(texts("הוא נסע לארה״ב לחופשה. חזר אחרי חודש."), ["הוא נסע לארה״ב לחופשה.", "חזר אחרי חודש."]);
});

test("ת״ד (P.O. Box) does not split", () => {
  assert.deepEqual(texts("שלח לת״ד 123. נא לאשר."), ["שלח לת״ד 123.", "נא לאשר."]);
});

test("ASCII-quote variant ד\"ר also recognized", () => {
  assert.deepEqual(texts('ד"ר כהן הגיע. הוא רופא.'), ['ד"ר כהן הגיע.', "הוא רופא."]);
});

test("ASCII-apostrophe variant מס' also recognized", () => {
  assert.deepEqual(texts("ראה מס' 7. בסדר."), ["ראה מס' 7.", "בסדר."]);
});

// ---------- 5. English abbreviations ----------

test("Dr. (English) does not split", () => {
  assert.deepEqual(texts("Dr. Cohen arrived. He is a physician."), ["Dr. Cohen arrived.", "He is a physician."]);
});

test("e.g. does not split", () => {
  assert.deepEqual(texts("Use vowels, e.g. niqqud. They help readers."), ["Use vowels, e.g. niqqud.", "They help readers."]);
});

test("Mr. and Mrs. do not split", () => {
  assert.deepEqual(
    texts("Mr. and Mrs. Smith came. They left at noon."),
    ["Mr. and Mrs. Smith came.", "They left at noon."]
  );
});

// ---------- 6. Numbers, dates, times, URLs, emails, ellipses ----------

test("decimal number 3.14 does not split", () => {
  assert.deepEqual(texts("הערך הוא 3.14 בקירוב. זה פאי."), ["הערך הוא 3.14 בקירוב.", "זה פאי."]);
});

test("thousand-separator 1,000.50 does not split", () => {
  assert.deepEqual(texts("המחיר 1,000.50 שקלים. הנחה זמינה."), ["המחיר 1,000.50 שקלים.", "הנחה זמינה."]);
});

test("date 11.12.2024 does not split", () => {
  assert.deepEqual(texts("הפגישה ב-11.12.2024 בבוקר. נא לאשר."), ["הפגישה ב-11.12.2024 בבוקר.", "נא לאשר."]);
});

test("time 10:30 does not split (and survives intact)", () => {
  const out = texts("נפגשים ב-10:30. ראש לראש.");
  assert.deepEqual(out, ["נפגשים ב-10:30.", "ראש לראש."]);
});

test("URL with periods does not split", () => {
  assert.deepEqual(
    texts("בקרו ב-https://example.com/page.html למידע. תודה."),
    ["בקרו ב-https://example.com/page.html למידע.", "תודה."]
  );
});

test("email does not split", () => {
  assert.deepEqual(
    texts("שלחו ל-foo.bar@example.co.il. נחזור."),
    ["שלחו ל-foo.bar@example.co.il.", "נחזור."]
  );
});

test("ellipsis ... does not split mid-sentence", () => {
  assert.deepEqual(texts("רגע... תן לי לחשוב. בסדר."), ["רגע... תן לי לחשוב.", "בסדר."]);
});

test("Unicode ellipsis … does not split (decomposed by NFKC into ...)", () => {
  // NFKC normalization (used by normalizeForDisplay) decomposes U+2026 into
  // three ASCII periods, so the `…` character itself never reaches the
  // segmenter — but it still must not act as a sentence boundary.
  assert.deepEqual(texts("רגע… תן לי לחשוב. בסדר."), ["רגע... תן לי לחשוב.", "בסדר."]);
});

// ---------- 7. Single-letter initials ----------

test("single-letter Latin initial does not split", () => {
  assert.deepEqual(texts("A. Einstein wrote it. It changed physics."), ["A. Einstein wrote it.", "It changed physics."]);
});

test("single-letter Hebrew initial does not split", () => {
  assert.deepEqual(texts("א. גרין הגיע. הוא נסע."), ["א. גרין הגיע.", "הוא נסע."]);
});

// ---------- 8. Real-world mixed paragraphs ----------

test("real-world Hebrew paragraph segments correctly", () => {
  const input =
    "ד״ר כהן עבד בת״א מ-1.1.2020. הוא טיפל בכ-100 חולים בחודש. ב-15.6.2024 פרש לפנסיה.";
  assert.deepEqual(texts(input), [
    "ד״ר כהן עבד בת״א מ-1.1.2020.",
    "הוא טיפל בכ-100 חולים בחודש.",
    "ב-15.6.2024 פרש לפנסיה.",
  ]);
});

test("two paragraphs each with multiple sentences", () => {
  const input = "ראשון. שני!\n\nשלישי? רביעי.";
  assert.deepEqual(texts(input), ["ראשון.", "שני!", "שלישי?", "רביעי."]);
});

test("normalize then segment: CRLF input still splits", () => {
  const input = "שלום.\r\n\r\nעולם.";
  assert.deepEqual(texts(input), ["שלום.", "עולם."]);
});

test("BIDI marks in input do not affect segmentation", () => {
  // U+200E LTR mark inserted between sentences should not produce extra segments.
  const input = "שלום עולם.\u200E ברוך הבא.";
  assert.deepEqual(texts(input), ["שלום עולם.", "ברוך הבא."]);
});

// ---------- 9. Stability / regression ----------

test("re-running segment on its own output is a no-op (idempotent on simple text)", () => {
  const once = texts("שלום עולם. ברוך הבא.");
  const twice = once.flatMap((s) => texts(s));
  assert.deepEqual(twice, once);
});

test("punctuation-only paragraph drops cleanly", () => {
  // After protection these are protected ellipses — restored as single segment.
  // What we really want to check: the segmenter never returns an empty `he`.
  const segs = segment(normalizeForDisplay("..."));
  for (const s of segs) {
    assert.ok(s.he.length > 0, "no segment should be empty");
  }
});

test("very long paragraph with many sentences produces dense indexes", () => {
  const input = Array.from({ length: 25 }, (_, i) => `משפט מספר ${i + 1}.`).join(" ");
  const segs = segment(normalizeForDisplay(input));
  assert.equal(segs.length, 25);
  assert.deepEqual(segs.map((s) => s.index), Array.from({ length: 25 }, (_, i) => i + 1));
});
