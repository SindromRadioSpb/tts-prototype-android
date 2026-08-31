# Condition-card publication profile

Read this reference when a problem book should publish a mature source corpus now,
while reviewed solutions or full TTS remain separate later programs. This profile is
reusable for diagram-heavy STEM books; it is not specific to one title.

## Split the runtime layers

Keep the immutable public item snapshot condition-only. It may contain aligned source
rows, task metadata, diagram descriptors, and source assets, but never solution rows.
Publish reviewed solutions through a separately hashed exact-edition derivative owned
by `$build-reviewed-problem-solutions`.

For every task, emit a production anchor containing corpus slug, edition ID/number,
edition manifest SHA-256, edition-item ID, public-work ID, snapshot SHA-256, canonical
task SHA-256, and source-canonical task SHA-256. The solution resolver must deny any
drift in this tuple.

## Diagrams and source assets

- Preserve the source page, crop/bounding box, semantic role, required-for-solving
  flag, bytes, MIME, and SHA-256.
- The snapshot references only materialized source assets. A derivative can add a
  first-party URL, but cannot turn the crop into a new source of truth.
- Read back every asset after publication and compare both byte length and hash.

## Zero-audio edition

A zero-audio release is valid only when rights and product scope explicitly permit it.
It must report zero audio assets and timing sidecars, render no playback controls, and
retain no dangling audio keys. Future row-level synthesis plans may be validated
locally, but they remain metadata rather than audio evidence.

Do not delay a useful reviewed text/diagram edition merely to manufacture placeholder
audio. Conversely, do not infer later TTS authority from permission to publish a
zero-audio stream. Full synthesis, word timings, and audio publication need a separate
owner approval and a new exact-edition verification cycle.

## Publication handoff to the solution program

Hand off:

- the condition-only publication anchor;
- source/task manifests and deterministic hashes;
- diagram completeness and source-asset manifest;
- exact task order and display aliases;
- the explicit audio boundary and ungranted rights classes.

The solution program may add reviewed tables and Agent Access rights, but must not
rewrite the source snapshot or materialize source-binary agent rights implicitly.
