"use strict";
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const S = require("../../public/js/atlas-search.js");
const dir = path.resolve(process.argv[2] || "data/atlas/a97002");
const names = fs
  .readdirSync(path.join(dir, "sections"))
  .filter((x) => x.endsWith(".json"))
  .sort();
const hashes = {},
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sections = names.map((n) => {
  const b = fs.readFileSync(path.join(dir, "sections", n));
  const s = JSON.parse(b);
  hashes[s.id] = sha(b);
  return s;
});
const ix = S.buildIndex(
  sections,
  require("../../atlas/a97002/notation-lexicon.json"),
);
ix.sections_sha256 = hashes;
const known = new Set(ix.lexicon.knownCommands);
const commands = {};
for (const section of sections)
  for (const page of section.pages)
    for (const item of page.items || [])
      for (const command of (item.latex || "").match(/\\[A-Za-z]+/g) || [])
        commands[command.slice(1)] = (commands[command.slice(1)] || 0) + 1;
const unknownCommands = Object.keys(commands).filter((c) => !known.has(c));
const previews = ix.docs.map((d) => [d[4], d[5]]);
ix.docs.forEach((d) => {
  d[4] = "";
  d[5] = "";
});
const full = ix.full,
  details = ix.details;
delete ix.full;
delete ix.details;
// Full phrase fields cannot be truncated. A separately loaded dictionary shard keeps normal searches small.
const payloads = {
  "search-phrases.json": JSON.stringify(S.packPhrases(full)),
  "search-details.json": JSON.stringify({ details, previews }),
};
ix.shards = {};
for (const [name, data] of Object.entries(payloads))
  ix.shards[name] = sha(data);
S.pack(ix);
payloads["search.json"] = JSON.stringify(ix);
for (const [name, data] of Object.entries(payloads))
  if (Buffer.byteLength(data) > 1500000)
    throw Error(
      "Index budget exceeded: " + name + " " + Buffer.byteLength(data),
    );
// Validate round trip before replacing the local bundle. Section files are read-only.
const t = performance.now();
S.unpack(JSON.parse(payloads["search.json"]));
const parseMs = performance.now() - t;
if (
  JSON.stringify(
    S.unpackPhrases(JSON.parse(payloads["search-phrases.json"])),
  ) !== JSON.stringify(full)
)
  throw Error("Phrase roundtrip failed");
for (const [name, data] of Object.entries(payloads))
  fs.writeFileSync(path.join(dir, name + ".tmp"), data);
for (const name of Object.keys(payloads))
  fs.renameSync(path.join(dir, name + ".tmp"), path.join(dir, name));
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json")));
index.sections_sha256 = hashes;
index.search_sha256 = sha(payloads["search.json"]);
fs.writeFileSync(path.join(dir, "index.json.tmp"), JSON.stringify(index));
fs.renameSync(path.join(dir, "index.json.tmp"), path.join(dir, "index.json"));
ix.previews = previews;
S.unpack(ix);
ix.full = full;
ix.details = details;
const times = [];
for (let n = 0; n < 200; n++) {
  const a = performance.now();
  S.query(ix, ["пружинами", "בקפיץ", "rpm", "σ_Lc"][n % 4]);
  times.push(performance.now() - a);
}
times.sort((a, b) => a - b);
const gold = JSON.parse(
  fs.readFileSync(path.join(__dirname, "search-gold.a97002.json")),
);
const fragmentTimes = gold.queries
  .filter((q) => q.kind === "fragment")
  .map((q) => {
    const t = performance.now();
    S.fragment(ix, q.q);
    return performance.now() - t;
  });
console.log(
  JSON.stringify(
    {
      bytes: Object.fromEntries(
        Object.entries(payloads).map(([n, s]) => [n, Buffer.byteLength(s)]),
      ),
      objects: ix.docs.length,
      tokens: Object.keys(ix.post).length,
      parse_ms: parseMs,
      p95_ms: times[189],
      fragment_max_ms: Math.max(...fragmentTimes),
      missingRefs: ix.docs.filter((d) => !d[3]).length,
      unknownCommands,
      commandCounts: commands,
    },
    null,
    2,
  ),
);
