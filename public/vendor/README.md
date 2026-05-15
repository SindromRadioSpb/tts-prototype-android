# public/vendor — vendored third-party bundles

This directory holds pinned, minified, third-party JavaScript bundles
served directly to the browser. They are **vendored** (checked into
the repo) rather than pulled at install time, so the production deploy
is reproducible from the git tree alone.

## v3.3.6 entry: `d3-graph.min.js`

The Knowledge Graph feature lazy-loads ONE d3 bundle. It is loaded
only on first user intent (`window.LinguistProGraph.open()`); it is
NOT in the eager bundle of `index.html`, and it is NOT in the Service
Worker precache list (it lives in the versioned `GRAPH_CACHE` bucket
added in C8).

### Why a single esbuild bundle, not two jsdelivr files

The original plan assumed `d3-force@3/dist/d3-force.min.js` and
`d3-zoom@3/dist/d3-zoom.min.js` were self-contained UMD files. They
are **not**. Each standalone d3 micro-package expects the rest of the
d3 ecosystem to be present on `window.d3`:

- `d3-force` needs `d3-quadtree`, `d3-dispatch`, `d3-timer`
- `d3-zoom` needs `d3-selection`, `d3-drag`, `d3-interpolate`,
  `d3-transition`, `d3-color`, `d3-ease`

Vendoring 11 micro-files in a fragile load order is brittle. Instead
we esbuild **exactly the symbols the renderer needs** into a single
self-contained IIFE that exposes a minimal `window.d3graph`:

```
forceSimulation, forceManyBody, forceLink, forceCenter,
forceCollide, forceX, forceY,            (from d3-force + deps)
zoom, zoomIdentity, zoomTransform,        (from d3-zoom + deps)
select, selectAll                         (from d3-selection)
```

| Field | Value |
|---|---|
| Output file | `public/vendor/d3-graph.min.js` |
| Global exposed | `window.d3graph` |
| Source packages | `d3-force@3.0.0`, `d3-zoom@3.0.0` (+ transitive d3 deps) |
| Bundler | `esbuild@0.21.5` (IIFE, minify, target es2019) |
| Size | ~61 KB minified, ~20.8 KB gzipped |
| License | ISC + BSD-3-Clause (d3 ecosystem; redistribution of minified bundles permitted with attribution) |
| SHA-256 | `6a639ae7595aabb86ada101897fedbfe1ef4fc9772d0f00631f69484a8efe38f` |

The SHA-256 is committed alongside the binary. `npm run
smoke:graph:lazyload` re-hashes the served file and fails on drift.

## How to regenerate

When d3 ships a patch we want to pick up:

```bash
# From repo root. esbuild + d3 sources are devDependencies in
# package.json (build-time only — NOT in the runtime path).
npm install
npm run vendor:build:graph        # runs scripts/vendor/build-d3-graph.mjs
sha256sum public/vendor/d3-graph.min.js   # update the hash above + below
```

`vendor:build:graph` bundles `vendor-src/d3-graph-entry.js` →
`public/vendor/d3-graph.min.js`. Keep the entry's export surface in
sync with `public/js/notes-graph-render.js` consumption.

If the bundle content changes, ALSO bump `GRAPH_CACHE_VERSION` in
`public/sw.js` (see §H of
`docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md` "Pre-C0 Blind Spots
Closed") so cached chunks evict on next deploy.

## SHA-256 fingerprint (authoritative)

```
d3-graph.min.js  sha256:6a639ae7595aabb86ada101897fedbfe1ef4fc9772d0f00631f69484a8efe38f
```

## License / attribution

d3 modules are ISC / BSD-3-Clause (Mike Bostock + contributors).
These licenses explicitly allow redistribution of minified bundles
with attribution. Attribution: https://d3js.org , © Mike Bostock.
The bundled source maps are stripped (`legalComments: 'none'`) for
size; the upstream license text is reproduced here as the canonical
attribution for the vendored artifact.
