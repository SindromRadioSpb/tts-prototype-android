"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TABLE_ROOT = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-08-30", "artifacts", "student-solution-tables");
const LEDGER = path.join(ROOT, "docs", "research", "materials-science-problem-solutions", "2026-09-01", "tts", "formula-speech-review.json");

test("formula speech compiler preserves Hebrew prose and voices embedded notation", () => {
  const speech = require("../scripts/premium/lib/materialsFormulaSpeech.js");
  const result = speech.compileSpeech("מַאֲמָץ הַכְּנִיעָה הוּא σ_y = 220 MPa.");
  assert.equal(result.status, "SYSTEM_COMPILED_PASS");
  assert.match(result.spoken_he_niqqud, /^מַאֲמָץ הַכְּנִיעָה הוּא /);
  assert.match(result.spoken_he_niqqud, /סִיגְמָה תַּת וַאי שָׁוֶה 220 מֶגָה־פַּסְקָל/);
  assert.doesNotMatch(result.spoken_he_niqqud, /[A-Za-z_]/);
});

test("formula speech compiler handles TeX fractions, powers, ranges, units and chemistry deterministically", () => {
  const speech = require("../scripts/premium/lib/materialsFormulaSpeech.js");
  assert.equal(
    speech.compileSpeech("E=\\Delta\\sigma/\\Delta\\varepsilon").spoken_he_niqqud,
    "אִי שָׁוֶה דֶּלְטָה סִיגְמָה חֶלְקֵי דֶּלְטָה אֶפְּסִילוֹן",
  );
  assert.match(speech.compileSpeech("A = π·d²/4").spoken_he_niqqud, /פַּאי כָּפוּל דִּי בָּרִבּוּעַ חֶלְקֵי 4/);
  assert.equal(speech.compileSpeech("727°C + (30–50)°C").spoken_he_niqqud,
    "727 מַעֲלוֹת צֶלְזִיּוּס וְעוֹד 30 עַד 50 מַעֲלוֹת צֶלְזִיּוּס");
  assert.equal(speech.compileSpeech("4Al + 3O₂ → 2Al₂O₃").spoken_he_niqqud,
    "4 אַלְמִינְיוּם וְעוֹד 3 חַמְצָן תַּת 2 נוֹתֵן 2 אַלְמִינְיוּם תַּת 2 חַמְצָן תַּת 3");
});

test("plain Hebrew stays natural while an unknown semantic token fails closed", () => {
  const speech = require("../scripts/premium/lib/materialsFormulaSpeech.js");
  const plain = "הַתְּשׁוּבָה נְכוֹנָה.";
  assert.equal(speech.compileSpeech(plain).spoken_he_niqqud, plain);
  assert.equal(speech.compileSpeech("הַחוֹמֶר ________ לְהַשְׁפָּעָה").spoken_he_niqqud,
    "הַחוֹמֶר לְהַשְׁפָּעָה");
  assert.equal(speech.compileSpeech("Cr₍₂₃₎C₆").spoken_he_niqqud,
    "כְּרוֹם תַּת 23 פַּחְמָן תַּת 6");
  assert.throws(() => speech.compileSpeech("E = ∂σ/∂ε"), /FORMULA_SPEECH_UNKNOWN_TOKEN:∂/);
});

test("compiler covers every condition and solution row and preserves four owner overrides", () => {
  const speech = require("../scripts/premium/lib/materialsFormulaSpeech.js");
  const manifest = JSON.parse(fs.readFileSync(path.join(TABLE_ROOT, "manifest.json"), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const overrides = speech.reviewedOverrides(ledger);
  assert.equal(overrides.size, 4);
  let rows = 0;
  let transformed = 0;
  let systemCompiled = 0;
  for (const entry of manifest.tasks) {
    const table = JSON.parse(fs.readFileSync(path.join(TABLE_ROOT, entry.file), "utf8"));
    for (const row of table.condition.rows) {
      const display = row.hebrew_niqqud || row.hebrew_plain;
      const result = speech.compileSpeech(display);
      rows += 1;
      transformed += Number(result.spoken_he_niqqud !== speech.normalizeSpeech(display));
      systemCompiled += Number(result.status === "SYSTEM_COMPILED_PASS");
    }
    for (const row of table.rows) {
      const display = row.text.he_niqqud || row.text.he;
      const result = speech.compileRowSpeech({ rowId: row.row_id, displayText: display, reviewed: overrides });
      assert.doesNotMatch(result.spoken_he_niqqud, /undefined|תַּת תַּת/);
      rows += 1;
      transformed += Number(result.spoken_he_niqqud !== speech.normalizeSpeech(display));
      systemCompiled += Number(result.status === "SYSTEM_COMPILED_PASS");
      if (overrides.has(row.row_id)) {
        assert.equal(result.status, "OWNER_REVIEWED_OVERRIDE");
        assert.equal(result.spoken_he_niqqud, overrides.get(row.row_id));
      }
    }
  }
  assert.equal(rows, 2612);
  assert.ok(transformed > 800, `expected broad embedded-notation coverage, got ${transformed}`);
  assert.ok(systemCompiled > 800, `expected systematic compilation, got ${systemCompiled}`);
});

test("formula speech audit is exact-source-bound and contains no unresolved rows", () => {
  const speech = require("../scripts/premium/lib/materialsFormulaSpeech.js");
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const audit = speech.auditCorpus({ tableRoot: TABLE_ROOT, formulaLedger: ledger });
  assert.equal(audit.schema_version, "materials_pb2_formula_speech_audit.1.0.0");
  assert.equal(audit.row_count, 2612);
  assert.equal(audit.owner_override_count, 4);
  assert.equal(audit.unresolved_count, 0);
  assert.equal(audit.ready, true);
  assert.match(audit.source_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(audit.rows.length, 2612);
});
