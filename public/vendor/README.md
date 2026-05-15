# public/vendor — vendored third-party bundles

This directory holds pinned, minified, third-party JavaScript bundles
served directly to the browser. They are **vendored** (checked into
the repo) rather than pulled at install time, so the production deploy
is reproducible from the git tree alone.

## v3.3.6 entries

The Knowledge Graph feature lazy-loads two d3 bundles. They are loaded
only on first user intent (when `window.LinguistProGraph.open()` is
called); they are NOT in the eager bundle of `index.html`, and they
are NOT included in the Service Worker precache list.

### `d3-force.min.js`

| Field | Value |
|---|---|
| Package | `d3-force` |
| Version | `3.0.0` |
| License | ISC |
| Source | https://cdn.jsdelivr.net/npm/d3-force@3.0.0/dist/d3-force.min.js |
| Size | ~13 KB minified, ~5 KB gzipped |
| Globals exposed | extends `window.d3` namespace; provides `d3.forceSimulation`, `d3.forceManyBody`, `d3.forceLink`, `d3.forceCenter`, `d3.forceCollide` |

### `d3-zoom.min.js`

| Field | Value |
|---|---|
| Package | `d3-zoom` |
| Version | `3.0.0` |
| License | ISC + BSD-3-Clause |
| Source | https://cdn.jsdelivr.net/npm/d3-zoom@3.0.0/dist/d3-zoom.min.js |
| Size | ~22 KB minified, ~9 KB gzipped |
| Globals exposed | extends `window.d3` namespace; provides `d3.zoom`, `d3.zoomIdentity`, `d3.zoomTransform` |

## Why both as UMD globals

These are UMD bundles. Loaded via `<script>` tag in dependency order
(d3-force first, then d3-zoom), they attach `d3.*` functions to the
global. The render module (`/js/notes-graph-render.js`) then reads
`window.d3.forceSimulation` etc. directly.

No bundler step. No `npm install d3` in the runtime path. The
`package.json` lists neither package as a runtime dependency — they
exist as bundled artifacts in this directory and nowhere else.

## How to regenerate

When d3 ships a patch release that we want to pick up:

```bash
# From the repo root, with curl + sha256sum available:
curl -sSfL https://cdn.jsdelivr.net/npm/d3-force@3.0.0/dist/d3-force.min.js \
    -o public/vendor/d3-force.min.js
curl -sSfL https://cdn.jsdelivr.net/npm/d3-zoom@3.0.0/dist/d3-zoom.min.js \
    -o public/vendor/d3-zoom.min.js

# Verify checksums:
sha256sum public/vendor/d3-force.min.js public/vendor/d3-zoom.min.js
```

If the version is bumped, ALSO bump `GRAPH_CACHE_VERSION` in
`public/sw.js` (see §H of `docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md`
"Pre-C0 Blind Spots Closed") so cached chunks evict on next deploy.

## SHA-256 fingerprints (filled in by C1)

```
d3-force.min.js  sha256:  <filled in by C1>
d3-zoom.min.js   sha256:  <filled in by C1>
```

These hashes are committed alongside the binaries so any drift is
flagged by `npm run smoke:graph:lazyload` (it reads this README and
re-hashes the served files).

## License files

Both packages are licensed under permissive terms (ISC, BSD-3) which
explicitly allow redistribution of minified bundles with attribution.
Attribution lives in this file (above) and in the source map header
of each `.min.js` (preserved by the d3 minification pipeline).
