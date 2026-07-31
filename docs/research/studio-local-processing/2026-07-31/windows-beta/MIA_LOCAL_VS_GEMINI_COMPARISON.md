# Mia Schem Local ASR versus Gemini offline comparison

Date: 2026-07-31
Disposition: **PROCESS PASS; OUTPUT REQUIRES HUMAN REVIEW; NOT HUMAN GOLD**

## Exact inputs

Both exported cards reference the same source MP3: SHA-256
`094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90`, `43,339,787` bytes,
`1,805.81875 s`.

- Gemini card `Заложница Миа. Интервью v2`: export SHA-256
  `592b6d84d09a43a9ccf34fcb18f1bcc6afd38eca1530b8a1f31504539220c98b`.
- Local card `Заложница Миа. Интервью — Local ASR 2026-07-31`: export SHA-256
  `aaaef14bce61eaf7bd34f2b30840cc1ebce163a5a3b8c49bfcee16649c04a7b9`.

The transcript-bearing exports remain outside git. Only hashes, aggregate metrics, and bounded
error descriptions are recorded here.

## Process result

The Local export proves the production UI path selected `local` and actually used
`local-faster-whisper`. Job `5455d295-a86a-4be6-8e50-a1f0deb74386` used the exact pinned
`ivrit-ai/whisper-large-v3-turbo-ct2` revision and model hash. It completed `3/3` physical PCM
windows with no retry, gap, rejected range, unreliable range, clock-compressed range, OOM, thermal
throttle, or fallback. S12.5, S12.6, and S12.7 are all PASS.

- model time: `62.23183 s`; model RTF `0.03446` (`29.02x` realtime);
- end-to-end job wall time: `71.987 s`; wall RTF `0.03986` (`25.09x` realtime);
- GPU: RTX 3070; maximum `60 C`; minimum `3,581 MiB` free VRAM;
- `503` normalized ASR segments; `503/503` timing entries;
- both seams at `900 s` and `1,800 s` anchored; normalized SHA-256
  `83def9bc1a6976cf6c6ef51f81a0b5b5820928125ccd96b7e6176d5cb917d80e`.

The saved card preserves the normalized Local transcript token-for-token across its Hebrew rows.
Its `552` row timing mappings report zero disagreements. Thus the observed text defects come from
ASR, not from loss during Library import or row construction.

## Offline text comparison

Gemini is a useful paired comparator but not independent human-authored gold. The following values
are disagreement metrics, not WER/CER and not a claim that every Gemini/Local difference is a Local
error.

| Metric | Result |
|---|---:|
| normalized Gemini tokens | 2,537 |
| normalized Local tokens | 2,621 |
| Local/Gemini length ratio | 1.0331 |
| exact aligned token matches | 2,096 |
| minimum token edits against Gemini | 583 |
| Gemini disagreement rate | 22.98% |
| Gemini multiset tokens represented in Local | 86.68% |
| exact bigram recall against Gemini | 72.68% |
| exact four-gram recall against Gemini | 54.98% |

The first five-minute bins range from `17.81%` to `23.27%` disagreement. The 25–30 minute bin rises
to `37.82%`; Gemini itself marks `1,529.02–1,769.01 s` (`239.997 s`) unreliable, so that bin needs
audio review rather than automatic attribution to either provider.

## Material Local review findings

- Core story coverage is intact: all 13 bounded story anchors from the prior review are present.
- The name Mia Schem is repeatedly split into ordinary Hebrew words meaning “who is guilty”, which
  produces materially wrong Russian rows. This is the clearest entity-quality failure.
- The hand/gunshot passage contains substitutions that turn “hand” into unrelated words such as
  “target”, “in favor of”, or “witness”. The Russian table then preserves some of those wrong meanings.
- One passage changes remaining/burning into joining/death; another changes “someone” into “who is
  guilty”. These are meaning-changing, not merely punctuation or spelling differences.
- The Local result omits the explicit `54` in the sleep-duration passage while retaining the nearby
  `55`-day captivity references and the other main numeric facts.
- Mixed Hebrew/English passages are unstable. `We will dance again` appears five times in Local
  versus once in Gemini, and a later physiotherapy passage introduces an unsupported Muhammad name.
- The final Local segment starts at `1,800 s` with a Knesset-address phrase absent from Gemini and
  apparently unrelated to the interview. Owner listening must decide whether this is source-media
  tail content or a hallucination before deletion.

These material examples make the Local output suitable as a fast first draft with mandatory human
correction, not as a publication-ready transcript.

## Product-row usability

The Local card is substantially over-fragmented compared with the Gemini card:

| Metric | Gemini | Local |
|---|---:|---:|
| rows | 212 | 552 |
| mean tokens per row | 11.97 | 4.75 |
| median tokens per row | 10 | 4 |
| one-word rows | 3 | 65 |
| rows with at most two tokens | 7 | 134 |

This improves timestamp granularity but produces a noisy Library learning card and magnifies ASR
errors into many translated rows. Row coalescing is a separate product-quality issue; it does not
invalidate the L1 integrity result.

## Privacy boundary observed in the export

The audio ASR route is Local and contains no Gemini fallback. The saved card separately records
`provider=google-free`, `fromCache=false`, and `nikudProvider=dicta-cloud` for downstream table
translation/niqqud. Therefore the accurate beta statement is: the media stayed local for ASR, but
the subsequent text enrichment was not fully local. This should be disclosed distinctly in UX.

## Owner listen/read checkpoints

Review these ten bounded regions against both exports:

1. `00:55–01:10` — opening therapy dialogue.
2. `02:20–02:40` — name and gunshot/hand injury.
3. `04:05–04:25` — remain/burn/die decision.
4. `06:20–06:40` — hand treatment and handedness.
5. `11:05–11:25` — physiotherapy and cooking detail.
6. `18:05–18:40` — “someone” phrase and cooking detail.
7. `22:00–22:40` — shower/hair and mixed English release statement.
8. `23:30–23:50` — English kindness statement.
9. `27:25–28:00` — tattoo and `We will dance again` repetition.
10. `28:35–30:05.82` — physiotherapy, closing message, and final tail.

Owner decision on 2026-07-31 makes these ten checkpoints, the independent four-speaker beta study,
and the former permanent 60-minute/12-speaker paired-Gemini study recommended rather than
mandatory. This comparison does not turn any of them into PASS evidence.
