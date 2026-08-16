# Accessibility, motion, RTL and reflow gap audit

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote origin converged
> Dirty status: 34 pre-existing unrelated entries; runtime/release targets untouched
> Production/client: release and actual owner client `3.11.398`
> Evidence: `CODE_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `EXTERNAL_PRIMARY`
> Limitations: DOM/ARIA/computed-style proof is not a screen-reader speech session; 380×844 is automation, not a physical phone; actual 200% reflow remains unrun here.

## Qualifying findings

### A1 — Studio row-audio truth is visual-only

Current owner Studio rendered 42 `.row-audio-ind` nodes with meaningful existing state—29 ready, 13 profile mismatch. Every node retained `aria-hidden="true"` from the table builder; none had a role or accessible name.

The Studio painter changes class and `title` only. The same state in Room uses `role="img"` plus a localized `aria-label`, proving the product already has a safer presentation contract without changing audio truth.

**Impact:** a keyboard/AT user cannot discover whether the row's audio is ready or mismatched. A pointer tooltip is not an equivalent persistent or programmatic state channel.

### A2 — state is conveyed by color and collapses under forced colors

Normal-mode readiness markers are the same 10×10 circular geometry and differ primarily by fill/border hue. In Room's forced-colors rule, `ok`, `missing`, `mismatch`, `too-long` and `working` are all assigned the same filled `CanvasText` circle.

Studio has no equivalent non-color mapping. Exact production automation found:

- `ok` and `mismatch` share one computed non-color signature;
- `too-long` and `working` share another;
- all keep the same size, circular radius and solid border.

W3C WCAG 2.2 SC 1.4.1 requires a visible alternative when color distinguishes information; an AT-only name does not satisfy the sighted non-color need:

- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

**Impact:** sighted high-contrast/color-limited users cannot distinguish readiness truth that affects whether audio can be played/rebuilt.

### A3 — Studio keeps the working pulse under reduced motion

`reader-core.css` removes `v3AudioPrefetchPulse` under reduced motion. Studio duplicates the marker CSS in `index.html` but its reduced-motion coverage does not reach the working marker.

In both isolated RU and HE production contexts:

```text
matchMedia('(prefers-reduced-motion: reduce)').matches = true
computed animation-name = v3AudioPrefetchPulse
```

The requested user preference is therefore not equivalent across the shared component family.

### A4 — row-TTS names are wrong-language and stale

`buildBilingualTableHtml(rows, { t })` uses the supplied translation function for column headings but hardcodes:

```text
title="Озвучить эту строку"
aria-label="Озвучить строку"
```

The exact production module returned those Russian strings for both EN and HE probes. `attachRowAudio` receives a localized `t` callback from Room but never uses it.

During interaction:

| State | Visible glyph / behavior | Programmatic attributes |
|---|---|---|
| idle | `▶`, action plays | Russian “Speak row” |
| loading | `…`, disabled, `aria-busy=true` | name remains Russian “Speak row” |
| playing | `■`, pressing stops | name remains Russian “Speak row” |
| error | `!`, next press retries | name remains Russian “Speak row”; title may be raw error |

Studio duplicate playback paths exhibit the same action/name divergence. W3C's Name, Role, Value guidance requires scripted components to expose up-to-date names/states, and failure technique F20 describes stale text alternatives when non-text content/function changes:

- https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
- https://www.w3.org/WAI/WCAG22/Techniques/failures/F20.html
- https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html

**Impact:** the HE/EN interface announces a Russian action, and while playing it offers “Speak row” when the real action is stop.

## Negative findings

| Contract | Current evidence | Disposition |
|---|---|---|
| Room/Studio page overflow | owner desktop and isolated 380 RU/HE: none | no layout successor |
| shell control names | 0 unnamed visible controls in owner Room and Studio; isolated Room also 0 | closed |
| shell focus | VF0–VF3 contracts and current tests intact | closed; future regression gate only |
| Room reduced motion | sampled transitions `0s`; Reader audio pulse suppressed | no broad motion lane |
| offline/reconnect | localized, bounded, no overflow or write in isolated warm simulation | closed |
| sprite/fallback | hydrated and named; 0 visible fallback | closed |
| remaining emoji | visible samples paired with text or decorative/content | backlog, not defect |
| actual 200% / AT | not run | evidence gap, not scope generator |

## Recommended future contract

The smallest coherent correction is **row-audio state parity**:

1. Preserve the existing readiness states and canonical audio writers unchanged.
2. Give each marker state a redundant non-color signature in normal and forced-colors modes:
   - `ok`: filled circle;
   - `missing`: hollow circle;
   - `mismatch`: dashed/half-marked circle;
   - `too-long`: square or crossed marker;
   - `working`: double ring, with motion only under `no-preference`.
3. Expose the existing localized readiness name consistently in Room and Studio without making the marker focusable.
4. Localize row-TTS idle/loading/stop/retry names in RU/EN/HE.
5. When the available action changes, update the accessible name/title/state in the same function that changes glyph/class; do not announce implementation/provider details.
6. Under reduced motion, the working end state remains distinguishable without pulse.
7. Preserve current focus order, target geometry, table widths, RTL column order and sticky/overlay behavior.

The exact shape choice is implementation detail, but five state signatures must remain distinguishable without hue in forced colors. No new icon sprite or typography work is justified.

## Scope exclusions discovered during the audit

The shared builder also contains Russian note/edit/resizer labels in EN/HE. That is recorded as an independent accessibility backlog observation. Folding every action-column control into VF4 would turn one evidence-backed audio-state correction into a broader component rewrite. It is explicitly excluded unless the owner counter-decides F3.
