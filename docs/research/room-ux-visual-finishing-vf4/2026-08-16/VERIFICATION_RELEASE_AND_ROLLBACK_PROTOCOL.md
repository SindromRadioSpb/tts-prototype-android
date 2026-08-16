# Verification, release and rollback protocol

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote origin converged
> Dirty status: 34 pre-existing unrelated entries; no runtime/release target changed
> Production/client baseline: release and owner client `3.11.398`, no update action
> Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`
> Execution status: the approved red/green and isolated local matrix have been performed for planned release `3.11.399`; production, updated owner-client, physical-device and AT rows remain separate. See `VF4_IMPLEMENTATION_EVIDENCE.md`.

## Future red contract

Before an implementation change, `tests/roomUxVf4ResidualA11y.test.js` must fail against the current baseline for the proved reasons:

1. EN and HE `buildBilingualTableHtml` row-TTS names are Russian.
2. playing state changes the control to stop while the accessible name remains “speak row.”
3. Studio marker painter leaves meaningful states `aria-hidden`/unnamed.
4. Room forced-colors produces one signature for all readiness states.
5. Studio forced-colors has collisions (`ok=mismatch`, `too-long=working`).
6. Studio `state-working` still animates with reduced motion.

The red test must not require TTS/provider invocation or owner data.

## Future green contract

- RU, EN and HE expose localized idle, loading, stop and retry row-TTS actions.
- The same function that changes glyph/class/busy/playing/error also changes the accessible name/title/state.
- Room and Studio expose the existing marker truth with localized names; markers remain non-focusable.
- `ok`, `missing`, `mismatch`, `too-long` and `working` have five non-color-identifiable signatures in forced colors.
- reduced motion yields `animation-name: none` for working markers on both surfaces.
- no row/table geometry, column order, focus order, sticky behavior, writer or network path changes.

## Local and isolated gates

Minimum commands:

```text
node --test tests/roomUxVf4ResidualA11y.test.js tests/readerAudioIndicator.test.js
node tests/i18n.smoke.js
node scripts/premium/reader-parity-smoke.js
npm run smoke:room-audio-indicator
node --test tests/visualFoundations.test.js tests/visualFinishingRoom.test.js tests/visualFinishingLearningSurfaces.test.js tests/visualFinishingStudioShell.test.js
```

Also rerun the existing Room/Studio UX and Reader audio unit batch that produced `28/28 PASS` at research baseline. The two current stale documentation-anchor assertions must be repaired only inside their allowlisted tests and must not weaken runtime assertions.

## Verification matrix

| Row | Required proof | Evidence class |
|---|---|---|
| desktop RU/EN/HE | localized names; five marker states; Classic/IDE + Room parity | isolated automation, then owner client for current locale |
| 380×844 RU and HE/RTL | no page/table overflow, same names/states, no clipped targets | isolated automation |
| actual 200% + long mixed titles | no page overflow, obscured audio action or sticky collision | actual owner browser; separate from CSS viewport simulation |
| keyboard-only | stable order, visible focus after transitions, action name matches current action, no sticky/overlay obscuration | browser DOM/focus; owner client |
| screen reader | DOM/ARIA tree and spoken current play/stop/error/readiness meaning | separate physical AT row; never inferred from automation |
| light/dark/auto/system | marker shape remains legible; no new theme | automation + owner current theme |
| forced colors | five non-color signatures; currentColor/system colors; focus visible | isolated automation |
| reduced motion | no marker/pulse animation; equivalent static working state | isolated automation |
| loading/empty/partial/offline/reconnect/stale/update/error | only row-audio loading/working/error plus existing shell regressions actually reachable; no invented state | isolated fixtures |
| Reader/Morph/Trainer/Studio parity | Reader/Studio changed family green; Morph/Trainer unaffected | contract tests + bounded browser smoke |
| no horizontal overflow | document and table scrollers checked at desktop/380/200% | automation + owner browser |
| no new writes | 0 new learner/provider/network/storage writes; existing mocked writer count unchanged | request/storage instrumentation |
| old/new clients | scenarios below | isolated SW compatibility |
| version lock | APP_VERSION, Room footer, SW, API, locale and asset keys exact | static + production readback |

Physical mobile and AT remain `NOT_RUN` until actually performed. Kapture or isolated automation cannot satisfy those rows.

## Mixed-client and failure compatibility

| Scenario | Required result |
|---|---|
| old HTML + new SW | prior complete text/glyph UI still functions; new CSS/JS must not make old markup blank |
| new HTML + old SW | cache-busted changed CSS/JS/locale references fetch or degrade to the prior complete labels/markers; no raw key |
| old locale + new HTML/JS | hardcoded localized fallback is understandable; no raw i18n key |
| new locale + old HTML/JS | extra keys ignored |
| sprite failure | irrelevant to new semantics; existing Unicode play/stop fallback remains visible |
| CSS failure | prior colored marker/glyph remains; action still has localized fallback |
| JS failure | existing HTML action name remains valid for idle; no blank icon-only control |
| offline cold start | precache contains exact changed URLs and integrity hashes |

Any changed locale content requires a new shared locale `?v=` key, updated i18n lock, exact SW precache and integrity-manifest keys. Any changed Reader CSS/JS reference must be cache-busted consistently. `APP_VERSION`, Room footer, `CACHE_VERSION` and `/api/client-config` must advance together.

## Mandatory deployment loop after approval

1. Run all local/unit/browser gates and diff hygiene.
2. Make only the approved scoped commit and push.
3. Wait for the active production image to match the pushed commit.
4. Verify repeated API/Studio/Room/SW convergence and `/healthz`.
5. Connect to the actual owner Chrome/Kapture client.
6. Preserve the current owner URL, then click the visible `Обновить` / `Update` action directly.
7. If no update action appears, prove the real client already runs the new release; if stale, diagnose SW/update state and do not hand off.
8. After update, run the real-client production smoke on the actual owner profile.
9. If any bug is found, fix it, rerun local gates, commit/push/redeploy, apply the next client update and repeat the complete production smoke.
10. Hand off only after the updated real client is green.

The smoke must record client version, update state, DOM/ARIA/focus, overflow, console warnings/errors and the row-audio visible/programmatic contract. Opening a page is not enough. Isolated automation is not the updated owner-client gate.

## Static rollback

Rollback needs no data operation:

1. revert only the approved VF4 runtime/release commit;
2. advance the release/SW lock to a new rollback version;
3. deploy and wait for source/image convergence;
4. apply the owner-client update using the same loop;
5. verify the prior complete glyph/color marker contract, locale fallback and no new writes.

Never roll back or modify learner data, audio assets, OPFS, volumes, database state or owner content.

If deployment is blocked by disk pressure, authority remains limited to evidence-first removal of unused build cache and demonstrably unused old images. Never remove volumes, running containers, database/OPFS/user data, or active/required rollback images. No cleanup is performed merely because it is allowed.
