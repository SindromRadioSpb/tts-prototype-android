# Materials PB2 production release evidence

Status: `PRODUCTION_EDITION_PUBLISHED / EXACT_RUNTIME_BUILT / FINAL_DEPLOY_IN_PROGRESS`.

Completed locally on real corpus bytes:

- exact source ZIP SHA-256
  `04bb4b69741a0ec4cdc188b04ab9e630ae90994f252e0cc233cb6d33f8bc97d5`;
- temporary publication: 3-item pilot, 60-item full immutable edition,
  pointer rollback to pilot and restore to full;
- 60 public snapshot readbacks, 180 rights facts, 0 audio assets, 0 missing
  assets, package complete, learner/private/review fingerprint unchanged;
- exact-edition solution runtime: 60 shards and 72 content-hash source images;
- desktop RU, 380px RU, 380px Hebrew RTL, exam projection, focus target and
  overflow checks with zero page errors and zero failed public responses;
- browser PDF samples rendered to PNG and visually reviewed for headings,
  repeated table headers, line breaks, source figure, page numbers and clipping.
- focused Materials/Room Node suite: 78 passed, 0 failed;
- Materials Python suite: 36 passed, 0 failed (including a licensed-source
  deterministic rebake supplied only through `MATERIALS_PB2_SOURCE_PDF`);
- i18n/cache lock: 233 passed, 0 failed; current release is `3.11.449`, Room
  module `v426`, public-corpus adapter `v418`, locales `v187`;
- repository-wide Node suite: 1215 passed, 6 unrelated baseline failures.
  Those six concern three already-absent Classic UI contracts, one historical
  Import Center route expectation and two historical Room IA expectations;
  none exercises the Materials publication, solution runtime or release lock.

The local publication used a clearly labeled synthetic rights fixture solely to
test mechanics. Production apply must use the separately validated owner file
`publication-rights-attestation.json` (SHA-256 recorded in
`rights-acceptance-receipt.json`).

Production backup, 3-item pilot, 60-item full publication and real pointer
rollback/restore are complete. The exact-edition runtime has been built from
the production anchor. Still pending in this release: final runtime deploy and
live anonymous verification. Explicitly deferred: physical printer acceptance,
owner review of all 60 live cards and full TTS.

The owner explicitly attested every class in
`publication-rights-attestation.json`, including
`public_stream_current_zero_audio_edition`. That class permits only the stream
capability of this exact edition with zero audio assets. It does not authorize
TTS generation, timings or audio publication.
