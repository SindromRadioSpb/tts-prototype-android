# B7 cross-device SRS convergence — production evidence

Date: 2026-08-13

Status: **ENGINEERING PASS · PRODUCTION READ-BACK PASS · IPHONE↔PC OWNER RETEST PASS**

Production release: `3.11.373`, `main@12f0e47f`.

## Defect and invariant

After training on both devices the owner observed iPhone `200 / 324` and PC
`210 / 335` for due/in-work. This was not intended per-device personalization.
`review_log` is the append-only cross-device truth; `word_status.srs_*` and the
manual-status map are local projections. After both devices complete sync, the
two counters must converge at the same observation time.

The old client could advance its download cursor after SRS recompute but before
manual LWW application, and a retry only projected newly inserted rows. It also
throttled a session-completion or quick foreground sync for 90 seconds. An
interrupted PWA could therefore retain a stale projection indefinitely while
its log count and cursor looked current.

## Repair

- SRS and manual projections commit before the page cursor.
- Projection failure keeps the cursor retryable; the retry projects the full
  uncommitted page, including rows already inserted before interruption.
- One versioned local heal rebuilds both axes from the complete canonical log
  without creating review or mark events.
- Boot, completed session, foreground, `pageshow`, and `online` use serialized
  forced sync; focus remains throttled.
- Clearing the manual axis keeps an independent SRS carrier.

## Evidence

- unit/frozen contracts `50/50`;
- B7 browser `161/161`;
- cloud sync `32/32`;
- Studio↔Room SRS `49/49`;
- Memory Canon/FSRS `79/79`;
- i18n `233/233`;
- canon version `18/18`;
- real-browser word-status smoke PASS.

Production `3.11.373` reported DB and migrations ready. Six changed served
assets matched local release bytes. The signed-in PC profile automatically
recorded projection-heal marker `v1`; `review_log` stayed `7,315` before/after
and matched cloud, while the PC counters corrected from `210 / 335` to
`205 / 335`. No Reader, review grade, or word-status action was invoked.

On 2026-08-13 the owner completed the production iPhone↔PC smoke and reported
PASS. This closes the cross-device-counter defect: after foreground sync both
devices converged without requiring a card to be opened. The exact final
counter pair was not transcribed, so this packet records the observed equality,
not invented values.

This result does not fill the rest of the B7 physical/AT matrix. iPhone
offline/large-text/VoiceOver, Android/TalkBack, Windows/NVDA and macOS/VoiceOver
remain separate rows in the canonical acceptance packet.

The later compact physical smoke filled iPhone Safari RTL/200%, PWA
reopen/offline/reconnect and PC keyboard/200%. The owner closed B7 with the
remaining named `NOT RUN` rows accepted as documented exceptions. Canonical
verdict:
[`ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`](../../../../planning/ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md).

Machine-readable record:
[`PRODUCTION_READBACK_EVIDENCE.json`](./PRODUCTION_READBACK_EVIDENCE.json).
