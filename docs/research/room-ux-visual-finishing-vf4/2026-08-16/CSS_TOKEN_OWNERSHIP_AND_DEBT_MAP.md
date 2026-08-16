# CSS token ownership and debt map

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; origin converged
> Dirty status at research start: 34 unrelated pre-existing entries; no CSS/runtime target changed
> Research-baseline production/client: release and owner client `3.11.398`
> Post-approval release: implementation `8dda777d`; production and updated actual owner client `3.11.399`
> Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`
> Limitations: counts are source topology, not proof that each declaration is reachable or defective; no dead-code deletion experiment was authorized.

## Current topology

| Owner | Inline `style=` | `!important` | custom-property definitions | `:focus-visible` occurrences | reduced-motion blocks | forced-colors blocks |
|---|---:|---:|---:|---:|---:|---:|
| `public/css/visual-foundations.css` | 0 | 0 | 225 | 2 | 1 | 1 |
| `public/library.html` embedded/late CSS | 1 | 20 | 47 | 87 | 12 | 2 |
| `public/index.html` | 446 | 347 | 164 | 37 | 20 | 1 |
| `public/css/reader-core.css` | 0 | 48 | 67 | 6 | 1 | 1 |
| `public/css/reader-morph.css` | 0 | 1 | 53 | 14 | 3 | 1 |

The large Studio counts are real debt, but current production is stable and the user-visible qualifying defect is much smaller than a cleanup.

## Ownership layers

| Layer | Owns | Must not own |
|---|---|---|
| `visual-foundations.css` | global palette/type/focus/motion/state roles, system-color fallbacks, compatibility aliases | Reader audio readiness, Studio mode truth, learner state |
| `reader-core.css` | shared bilingual-table geometry and Reader row presentation | audio asset/profile truth or persistence |
| `library.html` late CSS | Room layout and surface-local overrides | generic Studio controls or new shared truth |
| `index.html` CSS | Classic/IDE shell and Studio-local table overrides | a second semantic definition of audio readiness |
| `reader-morph.css` | Morph word/sheet/provenance presentation | row-audio or generic shell behavior |

Compatibility aliases remain intentional for one migration horizon. Foundations/Room/Morph generic aliases and foundations/Studio theme aliases are not duplicate truth owners.

## Qualifying ownership defect

Row audio is one behavioral truth but two presentation implementations:

```text
existing audio truth
  ├─ Room: reader-core.js painter + reader-core.css
  └─ Studio: index.html painter + duplicate marker CSS
```

The current split produces three parity failures:

- Room forced-colors collapses all states by explicit rule.
- Studio marker semantics remain `aria-hidden`.
- Studio reduced motion does not suppress the working pulse.

The future correction must not create a third generic status component. `reader-core.css` remains the shared base; `index.html` may keep only the minimum Studio selector needed by current Classic/IDE specificity. Behavior/state derivation remains where it is.

## Specificity strategy

If approved:

1. add one state-signature contract to the existing `.row-audio-ind.state-*` rules;
2. place forced-colors and reduced-motion equivalents next to the existing shared block;
3. update Studio's existing qualified selectors only where Classic/IDE specificity requires parity;
4. do not add global `button`, `[style*=]`, universal component or blanket `!important` rules;
5. do not remove compatibility aliases or legacy declarations in the same slice;
6. use existing custom properties/system colors; no new theme program;
7. keep table geometry, marker box and row action target dimensions unchanged.

Any new `!important` must be rejected unless a red test demonstrates an unavoidable existing cascade owner and the selector is narrower than the current rule. The expected implementation should need none.

## Option D — CSS debt only

`CSS_DEBT_ONLY` is `NO_GO`.

- No current owner-visible failure is caused by the raw count of 446 Studio inline styles or 347 `!important` declarations.
- Broad cleanup reaches shell, table, media, import, provider, modal and mobile modes.
- The blast radius is much larger than leaving the debt.
- Static rollback would be possible, but detecting every visual regression across the monolith would be expensive.
- The two currently failing visual tests are stale documentation anchors, not evidence that CSS cleanup improves users.

Debt observations remain in this artifact and the pre-existing backlog; they are not an implementation-shaped plan.

## CSS allowlist for the proposed successor

Only these current CSS ownership locations may change:

```text
public/css/reader-core.css
public/index.html   # existing row-audio / row-TTS selectors only
```

`public/css/visual-foundations.css`, `public/library.html` embedded component CSS, `reader-morph.css`, the sprite and all other surface sheets are excluded from presentation-rule edits. `library.html` may later change release/version references only.
