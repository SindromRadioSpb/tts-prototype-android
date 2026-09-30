# Sukkot and world catalog — 2026-10-01

Base: `46c0d3f363bea9c59a05b85667aa64ea2c0cde90` (3.11.711).
Source: owner-supplied `Sukkot-World-Engine-v2-source.zip`, Sukkot 0.1.0.
Release target: 3.11.712. Elections remains the default; Sukkot is an additional choice.

## Included

- Runtime pack: `public/worlds/sukkot/` (manifest, atlas, 33 PNGs).
- Editable art: `art/worlds/sukkot/*.px`; reused original assets retain their provenance in the Elections art sources.
- New art authoring: `scripts/worlds/author-sukkot-px.py`.
- Manifest authoring: `scripts/worlds/build-sukkot-manifest.py`, using [scene copy and cultural references](sukkot-scene-copy.json).
- The existing renderer and Elections pack are unchanged. The supplied engine patch adds Sukkot metadata, surface-specific previews and stale-load cancellation.
- Demo HTML/adapters and the cloud agent's DOM fixture are not application dependencies.

Rebuild: `python scripts/worlds/author-sukkot-px.py`, `python scripts/worlds/build-sukkot-manifest.py`, then `node scripts/worlds/build-world-art.js sukkot`.
Verify without rewriting assets: `node scripts/worlds/build-world-art.js sukkot --check`.

## Catalog integration contract

Each trusted `REGISTRY` entry specifies `base`, pinned `pack`, localized `names`, `note`/`badge` (or existing translation keys), `greeting`, optional `routeLabel`, `previewLocation`, and `category`.
Supported categories: `israel`, `pixel`, `events`, `current-events`, `literature`; missing or unknown categories appear under `other`.
Only categories with installed, non-retired worlds are shown. Classic remains the first choice.

Preview canvases reserve their height before loading. Manifest, atlas and images are requested only once the canvas intersects the picker viewport. Offscreen previews stop scheduling animation frames; visible previews resume. Hidden documents, reduced motion and dialog close also stop animation. Observers and listeners are removed on close, including picker replacement. A geometry/scroll fallback covers browsers without IntersectionObserver.

Future world packages should add registry metadata and data/art, not independent catalog engines. All world code participates in the service worker's versioned precache and shell-integrity contract. Pack art remains runtime-cached on demand.

## Verification

The cloud package's 20-test/CPU-canvas report is upstream evidence, not browser or production acceptance.
Integration checks: `node --test tests/worldEngine.test.js tests/sukkotWorld.test.js`, `npm test`, `node scripts/api-smoke.js`, `node tests/i18n.smoke.js`.
Browser smoke: `node scripts/worlds/sukkot-browser-smoke.js` starts a disposable server and isolated browser profiles. `AUDIT_BASE` selects an existing server; `AUDIT_OUT` selects the evidence directory. It exercises real app surfaces, picker selection and persistence, lighting, motion, Classic, a synthetic large catalog, both visibility-observer paths and stale-load cancellation. Synthetic worlds exist only in that browser context.
Screenshots and test reports are automated browser evidence, not physical-device or owner acceptance.

Local acceptance on 2026-10-01: 2320/2320 unit tests; API smoke OK; i18n 233/233; browser smoke 22/22 across RU/HE/EN, 380/768/1280 px including dark appearance; service-worker update smoke A/E 6/6 (all three surfaces, normal and mixed-release rollout). Final integrity parity tests pass with world assets included. Browser evidence: `docs/research/linguistpro-worlds/2026-10-01-sukkot/`.
