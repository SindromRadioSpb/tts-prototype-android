# C4 local benchmark harness

Research-only Node.js harness. It makes no network calls and never reads LinguistPro/prod directly.
Run it only with files under the parent `private/` directory.

## Input schema

```json
{
  "schema_version": "c4.notes.1",
  "dataset_class": "owner-private",
  "notes": [{
    "source_note_id": "local opaque id",
    "word": "חלק",
    "query_context": "...",
    "dictionary_facts": {"niqqud":"...","root":"...","pos":"...","binyan":"..."},
    "personal_note": {"meaning":"...","mnemonic":"...","explanation":"...","example_sentence":"..."}
  }]
}
```

Exactly 20 unique notes are required. Keep this file untracked.

`export-owner-notes.browser.js` is an owner-side DevTools snippet for the authenticated
LinguistPro page. It reads OPFS only inside that browser origin, applies the frozen 10+10 sampling
rule, downloads only the selected 20-note dataset, and never sends it over the network. Codex/Hermes
must not inspect the downloaded file before the consent step.

## Commands

From the research folder:

```powershell
node prototype/c4-benchmark.mjs consent --notes private/notes.json --out private/consent.json --affirmation "I APPROVE TEMPORARY personal.notes.read FOR C4 BENCHMARK"
node prototype/c4-benchmark.mjs prepare --notes private/notes.json --consent private/consent.json --ledger private/exposure.ledger.jsonl --out private/author-packets.json
node prototype/c4-benchmark.mjs revoke --consent private/consent.json
node prototype/c4-benchmark.mjs blind --responses private/responses.json --out private/evaluation.json --mapping private/mapping.json
node prototype/c4-benchmark.mjs score --ratings private/ratings.json --mapping private/mapping.json --out private/result.json
```

`prepare` writes and flushes content-free exposure events before writing `author-packets.json`.
If ledger writing fails, no packet is created. The author packet is private because its B branches
contain personal notes. Feed A and B to separate clean Hermes contexts and save responses as:

```json
{"responses":[{"pair_id":"c4-pair-01","without_note":"...","with_note":"..."}]}
```

Ratings contain `pair_id` and `preferred: X | Y | TIE`. The evaluation file contains no mapping;
the mapping remains separate until scoring.

`revoke` atomically marks the receipt revoked and updates its integrity hash. After revoke,
`prepare` fails closed. Revocation cannot remove content already delivered to an external chat.
