"use strict";
const fs = require("fs"),
  path = require("path");
const S = require("../../public/js/atlas-search");
const dir = process.argv[2] || "data/atlas/a97002";
const raw = JSON.parse(fs.readFileSync(path.join(dir, "search.json"))),
  details = JSON.parse(fs.readFileSync(path.join(dir, "search-details.json")));
const previewFile = path.join(dir, "search-previews.json");
raw.previews = fs.existsSync(previewFile)
  ? JSON.parse(fs.readFileSync(previewFile)).previews
  : details.previews;
const ix = S.unpack(raw);
ix.details = details.details || details;
ix.full = S.unpackPhrases(
  JSON.parse(fs.readFileSync(path.join(dir, "search-phrases.json"))),
);
const gold = JSON.parse(
  fs.readFileSync(path.join(__dirname, "search-gold.a97002.json")),
);
if (gold.queries.some((g) => !g.expected.length))
  throw Error("Gold query has no expected source");
const rows = gold.queries.map((g) => {
  const results =
    g.kind === "fragment" ? S.fragment(ix, g.q) : S.query(ix, g.q);
  const rank =
    results.findIndex((r) =>
      g.expected.some(
        (e) =>
          r.ref === e.ref ||
          (r.places &&
            r.places.some(
              (p) =>
                p[0] === e.sid && p[1] === e.page && (!e.ref || p[2] === e.ref),
            )) ||
          (!e.ref && e.sid === r.sid && e.page === r.page),
      ),
    ) + 1;
  return {
    id: g.id,
    q: g.q,
    kind: g.kind,
    rank,
    top5: results
      .slice(0, 5)
      .map((r) => ({ kind: r.kind, page: r.page, ref: r.ref })),
  };
});
const summary = {};
for (const kind of ["exact", "fragment"]) {
  const list = rows.filter((r) => r.kind === kind);
  summary[kind] = {
    count: list.length,
    recall_at_5:
      list.filter((r) => r.rank > 0 && r.rank <= 5).length / list.length,
    MRR: list.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / list.length,
  };
}
const report = {
  summary,
  misses: rows.filter((r) => r.rank === 0 || r.rank > 5),
  rows,
};
console.log(JSON.stringify(report, null, 2));
if (summary.exact.recall_at_5 !== 1 || summary.fragment.recall_at_5 < 0.9)
  process.exitCode = 1;
