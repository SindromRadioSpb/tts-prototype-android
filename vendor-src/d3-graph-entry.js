// vendor-src/d3-graph-entry.js — esbuild entry for the vendored
// Knowledge Graph d3 bundle (v3.3.6).
//
// The standalone `d3-force` / `d3-zoom` dist bundles are NOT
// self-contained — they expect the rest of the d3 micro-package
// ecosystem (d3-quadtree, d3-dispatch, d3-timer, d3-selection,
// d3-drag, d3-interpolate, d3-transition, d3-color, d3-ease) to be
// present. Rather than vendoring 11 separate files in a fragile load
// order, we esbuild exactly the symbols the renderer needs into ONE
// self-contained IIFE that exposes a minimal `window.d3graph`.
//
// Output: public/vendor/d3-graph.min.js  (global: window.d3graph)
//
// Regeneration command is documented in public/vendor/README.md.
// Keep this export surface in sync with public/js/notes-graph-render.js.

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from "d3-force";

import {
  zoom,
  zoomIdentity,
  zoomTransform,
} from "d3-zoom";

import { select, selectAll } from "d3-selection";

// Minimal, explicit surface — only what notes-graph-render.js consumes.
// Exposed as a single global so the loader shim can load ONE chunk.
const d3graph = {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  zoom,
  zoomIdentity,
  zoomTransform,
  select,
  selectAll,
};

if (typeof window !== "undefined") {
  window.d3graph = d3graph;
}

export default d3graph;
