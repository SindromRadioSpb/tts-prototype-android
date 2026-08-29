# Intake and truth boundaries

Read this reference for a new corpus, a new source edition, a rights change, or any
book containing diagrams, graphs, tables, or detached answer pages.

## Source inventory

Record each input before transformation:

- logical role: problem book, appendix, diagram sheet, glossary, answer key, or
  previously generated derivative;
- owner-visible filename, byte size, SHA-256, page count, format, and language;
- page-to-task range and whether task boundaries cross pages;
- whether text is born-digital, raster-only, handwritten, or mixed;
- whether diagrams are present, removed, cropped, illegible, or stored separately;
- rights holder, rights basis, covered publication class, date, and approver;
- whether the input may be sent to an external provider.

Do not put absolute owner-drive paths in generated public or agent artifacts. Store
filenames and hashes there; keep local coordinates in an owner-local intake record.

## Page-faithful preparation

- Prefer page-faithful PDFs or images that retain original order and visual context.
- Split only at task/chapter boundaries and within the actual upload limit.
- Preserve a 1:1 page mapping and verify it by rendering prepared PDFs back to raster.
- Record generation command, source commit, output hashes, page count, nonblank checks,
  and a visual contact-sheet review when layout matters.
- A prepared PDF is an OCR input, not an OCR result and not reviewed content.

## Rights classes

Treat these as separate approval classes unless the attestation explicitly combines
them:

1. source problem text and diagrams;
2. generated translation, niqqud, and transliteration;
3. generated or supplied audio;
4. answer-key facts;
5. independently authored solutions and tutor explanations;
6. public package download and agent-readable derivative access.

Do not infer a later class from approval of an earlier one.

## Identity

Create a stable internal identity before publication. At minimum bind:

- corpus slug and source-edition identifier;
- task key from the source structure;
- source page and source image/PDF hash;
- deterministic task-record hash;
- publication edition/item/snapshot identities once published.

Display numbers may be corrected without changing immutable identity only when the
source mapping proves they refer to the same task. Never resolve agent or discussion
requests by fuzzy title/number matching when an exact edition anchor exists.

## Raw and derived evidence

Keep separate:

- raw provider response;
- normalized provider cache;
- allowlisted correction ledger;
- rendered learning table;
- canonical task record;
- import/package artifact;
- public snapshot.

Each derivative records its inputs and generator version. A generated table does not
become source truth merely because it looks plausible.

## Missing information

Use explicit typed states such as:

- `generated_unreviewed`;
- `human_reviewed`;
- `incomplete_missing_diagram`;
- `source_illegible`;
- `source_mapping_ambiguous`.

Never synthesize missing dimensions, graph points, labels, or diagram topology.
