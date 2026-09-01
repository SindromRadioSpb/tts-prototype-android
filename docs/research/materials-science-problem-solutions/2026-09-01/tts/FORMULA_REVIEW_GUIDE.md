# Materials PB2 — formula speech policy

Status: `SYSTEM COMPILER PASS · 2,612/2,612 ROWS RESOLVED · 4 OWNER OVERRIDES`

The educational priority is natural TTS for Hebrew condition and solution
sentences. Formula notation must not block those sentences or be submitted raw
to the Hebrew voice.

## Release authority

`materials-formula-speech-he-v1` deterministically compiles notation embedded
in every condition and solution row:

- Hebrew prose and punctuation remain Hebrew prose;
- Latin and Greek variables become Hebrew letter names;
- operators, ranges, fractions, indices, powers and arrows become spoken Hebrew;
- common engineering units, lattice acronyms, material symbols and technical
  terms use an explicit glossary;
- ordinary numbers remain numeric so the Hebrew Standard voice reads them as
  complete numbers rather than digit by digit;
- an unknown TeX command or semantic symbol fails closed before any provider
  request or output-directory creation.

The four Task 1 readings explicitly accepted by the owner remain exact-row
overrides in `formula-speech-review.json`. The other pending entries in that
legacy ledger are not release blockers: the compiler output is the authority
unless an exact reviewed override exists.

## Full audit

```powershell
node scripts/premium/materials-pb2-tts.js formula-audit `
  --ledger docs/research/materials-science-problem-solutions/2026-09-01/tts/formula-speech-review.json `
  --output .tmp/materials-pb2-formula-speech-audit.json
```

Expected invariants:

- `row_count: 2612`;
- `owner_override_count: 4`;
- `unresolved_count: 0`;
- `ready: true`.

The audit binds every displayed row to its actual spoken string and source
manifest SHA-256. It is regenerated from canonical tables; it is not a second
content source.

## Optional exception workflow

If listening QA finds a genuinely awkward formula, add only that exact row to
the reviewed ledger with a non-empty Hebrew spoken form, reviewer identity and
timestamp. The override remains source-hash-bound. Do not edit display text to
improve TTS and do not approve unrelated rows by analogy.

## Full no-synthesis preflight

```powershell
node scripts/premium/materials-pb2-tts.js preflight `
  --ledger docs/research/materials-science-problem-solutions/2026-09-01/tts/formula-speech-review.json `
  --rights docs/research/materials-science-problem-solutions/2026-09-01/tts/full-tts-rights-attestation.owner.json `
  --output .tmp/materials-pb2-full-preflight.json
```

All four gates (`rights`, `formula_speech`, `cost`, `secret`) must equal `PASS`
before `bake`. Formula compilation is completed before secret validation, output
creation and provider calls.
