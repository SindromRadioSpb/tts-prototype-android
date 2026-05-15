// scripts/vendor/build-d3-graph.mjs — regenerate public/vendor/d3-graph.min.js
//
// Bundles exactly the d3-force + d3-zoom + d3-selection symbols the
// Knowledge Graph renderer needs into ONE self-contained IIFE
// (window.d3graph). esbuild + d3 sources are devDependencies — this
// runs at build/regeneration time only; the OUTPUT is vendored.
//
// Usage:
//   npm run vendor:build:graph
//
// After running, update the SHA-256 in public/vendor/README.md and
// (if content changed) bump GRAPH_CACHE_VERSION in public/sw.js.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRY = path.join(ROOT, "vendor-src", "d3-graph-entry.js");
const OUT = path.join(ROOT, "public", "vendor", "d3-graph.min.js");

await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "d3graphBundle",
  target: ["es2019"],
  legalComments: "none",
  outfile: OUT,
});

const sha = createHash("sha256").update(readFileSync(OUT)).digest("hex");
console.log(`[vendor:build:graph] wrote ${path.relative(ROOT, OUT)}`);
console.log(`[vendor:build:graph] sha256: ${sha}`);
console.log("[vendor:build:graph] → update public/vendor/README.md if changed,");
console.log("[vendor:build:graph]   and bump GRAPH_CACHE_VERSION in public/sw.js.");
