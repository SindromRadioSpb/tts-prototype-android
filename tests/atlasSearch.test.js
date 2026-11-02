"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const S = require("../public/js/atlas-search.js");
test("notation equivalence and significant case", () => {
  for (const x of ["σ_Lc", "σLc", "sigma_Lc", "сигма Lc"])
    assert.equal(S.symbolKey(x), S.symbolKey("\\sigma_{Lc}"));
  assert.equal(S.symbolKey("d₁"), S.symbolKey("d1"));
  assert.notEqual(S.symbolKey("D"), S.symbolKey("d"));
  assert.equal(S.unitKey("Н·мм"), S.unitKey("N*mm"));
  assert.equal(S.unitKey("об/мин"), S.unitKey("rpm"));
});
test("Russian Snowball inflections", () => {
  for (const w of ["пружинами", "пружины", "пружин"])
    assert.equal(S.stemRu(w), S.stemRu("пружина"));
});
const sections = [
  {
    id: "s1",
    terms: {
      t: { lemma_he: "קפיץ", translit: "kfits", senses: [{ ru: "пружина" }] },
    },
    pages: [
      {
        page: 131,
        items: [
          {
            id: "b1",
            type: "block",
            he: "קפיץ",
            ru: "Пружина стальная",
            terms: ["t#spring"],
            editor: "secretneedle",
          },
        ],
      },
    ],
  },
];
test("shared normalization, proclitics, translit, exclusion and stable ranking", () => {
  const ix = S.buildIndex(sections);
  for (const q of ["והקפיץ", "בקפיץ", "пружинами", "kfits"])
    assert.ok(
      S.query(ix, q).some((r) => r.page === 131),
      q,
    );
  assert.equal(S.query(ix, "secretneedle").length, 0);
  assert.deepEqual(S.query(ix, "пружина"), S.query(ix, "пружина"));
});
test("quoted phrase preserves order", () => {
  const ix = S.buildIndex(sections);
  assert.ok(S.query(ix, '"пружина стальная"').length);
  assert.equal(S.query(ix, '"стальная пружина"').length, 0);
});

test("packed index round trip preserves every posting and target", () => {
  const a = S.buildIndex(sections),
    b = S.unpack(JSON.parse(JSON.stringify(S.pack(S.buildIndex(sections)))));
  assert.deepEqual(
    b.docs,
    a.docs.map((d) => d.concat(d.length === 6 ? [null] : [])),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(b.post)),
    JSON.parse(JSON.stringify(a.post)),
  );
  assert.deepEqual(S.query(b, "пружина"), S.query(a, "пружина"));
});

test("phrase uses full field, never crosses the source/translation boundary", () => {
  const ix = S.buildIndex([
    {
      id: "s",
      pages: [
        {
          page: 1,
          items: [
            {
              id: "a97002:p1:b1",
              type: "block",
              he: "קפיץ",
              ru: "вводный ".repeat(40) + "жёсткость пружины",
            },
            {
              id: "a97002:p1:b2",
              type: "block",
              he: "пружина",
              ru: "стальная",
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(S.query(ix, '"жёсткость пружины"')[0].ref, "a97002:p1:b1");
  assert.equal(S.query(ix, '"пружина стальная"').length, 0);
  assert.deepEqual(
    S.unpackPhrases(JSON.parse(JSON.stringify(S.packPhrases(ix.full)))),
    ix.full,
  );
});
test("symbol case fallback and section filtering remain explicit", () => {
  const ix = S.buildIndex([
    {
      id: "s",
      pages: [
        {
          page: 1,
          items: [
            {
              id: "a97002:p1:f1",
              type: "formula",
              latex: "D=d",
              vars: [
                { latex: "D", ref: "a97002:p1:v1" },
                { latex: "d", ref: "a97002:p1:v2" },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const hits = S.query(ix, "D").filter((x) => x.kind === "symbol");
  assert.equal(hits[0].ref, "a97002:p1:v1");
  assert.equal(hits[1].match, "case");
  assert.equal(S.query(ix, "D", { sid: "other", scope: "section" }).length, 0);
});
test("Snowball published vocabulary examples", () => {
  for (const [word, stem] of [
    ["важнейшими", "важн"],
    ["важность", "важност"],
    ["павлиньи", "павлин"],
    ["палился", "пал"],
    ["падающего", "пада"],
    ["вагонами", "вагон"],
  ])
    assert.equal(S.stemRu(word), stem, word);
});
test("browser and build use identical normalization and queries", () => {
  const vm = require("node:vm"),
    fs = require("fs"),
    context = vm.createContext({ console });
  context.window = context;
  for (const f of ["corpus-fts", "atlas-reader", "atlas-search"])
    vm.runInContext(
      fs.readFileSync(
        require("node:path").join(__dirname, "../public/js/" + f + ".js"),
        "utf8",
      ),
      context,
    );
  const browser = context.AtlasSearch,
    ix = S.buildIndex(sections),
    packed = JSON.stringify(S.pack(ix));
  const a = S.unpack(JSON.parse(packed)),
    b = browser.unpack(JSON.parse(packed));
  for (const q of ["והקפיץ", "пружинами", "kfits"])
    assert.equal(
      JSON.stringify(S.query(a, q)),
      JSON.stringify(browser.query(b, q)),
    );
});
test(
  "real corpus bundle stays within budget and preserves postings and phrase text",
  {
    skip: !require("node:fs").existsSync(
      require("node:path").join(__dirname, "../data/atlas/a97002/search.json"),
    ),
  },
  () => {
    const fs = require("fs"),
      path = require("path"),
      dir = path.join(__dirname, "../data/atlas/a97002");
    for (const file of [
      "search.json",
      "search-details.json",
      "search-phrases.json",
      "search-previews.json",
    ])
      if (fs.existsSync(path.join(dir, file)))
        assert.ok(fs.statSync(path.join(dir, file)).size <= 1500000, file);
    const sections = fs
      .readdirSync(path.join(dir, "sections"))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => JSON.parse(fs.readFileSync(path.join(dir, "sections", n))));
    const a = S.buildIndex(
        sections,
        require("../atlas/a97002/notation-lexicon.json"),
      ),
      raw=JSON.parse(fs.readFileSync(path.join(dir,'search.json'))),
      metadata=JSON.parse(fs.readFileSync(path.join(dir,'search-details.json'))),
      previewFile=path.join(dir,'search-previews.json'),
      b = S.unpack(Object.assign(raw,{previews:fs.existsSync(previewFile)?JSON.parse(fs.readFileSync(previewFile)).previews:metadata.previews}));
    assert.equal(b.docs.length,a.docs.length);a.docs.forEach((doc,n)=>assert.equal(JSON.stringify(b.docs[n]),JSON.stringify(doc.concat(doc.length===6?[null]:[])),'preview/target '+n));
    assert.deepEqual(
      JSON.parse(JSON.stringify(a.post)),
      JSON.parse(JSON.stringify(b.post)),
    );
  },
);

test("allowable stress brackets and case fallback outrank unrelated subscript tokens", () => {
  const ix = S.buildIndex([
    {
      id: "s",
      pages: [
        {
          page: 1,
          items: [
            {
              id: "f",
              type: "formula",
              latex: "[\\sigma_{lc}]",
              vars: [
                { latex: "[\\sigma_{lc}]", ref: "v1" },
                { latex: "d_{lc}", ref: "v2" },
              ],
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(
    S.query(ix, "σ_Lc").filter((r) => r.kind === "symbol")[0].ref,
    "v1",
  );
});

test('separate preview metadata restores labels in a compact shipped index',()=>{
 const source=S.buildIndex(sections),previews=source.docs.map(d=>[d[4],d[5]]);source.docs.forEach(d=>{d[4]='';d[5]='';});
 const shipped=JSON.parse(JSON.stringify(S.pack(source)));shipped.previews=previews;const restored=S.unpack(shipped);
 assert.equal(restored.docs[0][4],'קפיץ');assert.equal(restored.docs[0][5],'Пружина стальная');assert.equal(S.query(restored,'пружина').find(r=>r.kind==='block').ru,'Пружина стальная');
});

// Acceptance 2026-11-02: what the first screen shows, not only the top five.
const acceptanceBook = [
  {
    id: "s",
    pages: [
      {
        page: 1,
        items: [
          { id: "a97002:p1:b1", type: "block", he: "", ru: "Сила трения в соединении" },
          { id: "a97002:p1:b2", type: "block", he: "", ru: "Сила действует на болт" },
          { id: "a97002:p1:b3", type: "block", he: "", ru: "Составляющая Fy = F · sin α" },
          {
            id: "a97002:p1:f1",
            type: "formula",
            latex: "F_{lc}=d_{lc}\\cdot[\\sigma_{lc}]\\cdot d_1",
            vars: [
              { latex: "[\\sigma_{lc}]", ru: "Допускаемое напряжение смятия", unit: "MPa", ref: "a97002:p1:f1#s" },
              { latex: "d_{lc}", ru: "Диаметр по смятию", unit: "mm", ref: "a97002:p1:f1#d" },
              { latex: "F_{lc}", ru: "Сила по смятию", unit: "N", ref: "a97002:p1:f1#F" },
              { latex: "d_1", ru: "Внутренний диаметр", unit: "mm", ref: "a97002:p1:f1#d1" },
            ],
          },
          {
            id: "a97002:p1:f2",
            type: "formula",
            latex: "F_y=F\\cdot\\sin\\alpha",
            vars: [
              { latex: "F_y", ru: "Составляющая по оси y", unit: "N", ref: "a97002:p1:f2#Fy" },
              { latex: "M_t", ru: "Крутящий момент", unit: "N·mm", ref: "a97002:p1:f2#M" },
              { latex: "q", ru: "Погонная нагрузка", unit: "N/mm", ref: "a97002:p1:f2#q" },
            ],
          },
        ],
      },
    ],
  },
];
test("all words first: a two-word query does not bury its matches under one-word hits", () => {
  const ix = S.buildIndex(acceptanceBook);
  const hits = S.query(ix, "сила трения");
  assert.deepEqual(hits.map((r) => r.ref), ["a97002:p1:b1"]);
  // nothing holds both words → one-word hits are still offered, marked partial
  const loose = S.query(ix, "сила болта трения");
  assert.ok(loose.length && loose.every((r) => r.match === "partial"));
});
test("a symbol is one notation: its letters and subscript are not exact words", () => {
  const ix = S.buildIndex(acceptanceBook);
  const sigma = S.query(ix, "σ_Lc");
  assert.ok(sigma.length);
  assert.ok(sigma.every((r) => r.ref === "a97002:p1:f1#s" || r.ref === "a97002:p1:f1"), sigma.map((r) => r.ref).join());
  assert.ok(!S.query(ix, "d₁").some((r) => /#d$|#F$/.test(r.ref)));
  // a symbol written in one piece in prose is still found for «F_y»
  const fy = S.query(ix, "F_y").map((r) => r.ref);
  assert.ok(fy.includes("a97002:p1:f2#Fy") && fy.includes("a97002:p1:b3"));
});
test("a unit query is answered by units, not by its letters", () => {
  const ix = S.buildIndex(acceptanceBook);
  assert.deepEqual(
    S.query(ix, "N/mm").filter((r) => r.kind === "symbol").map((r) => r.ref),
    ["a97002:p1:f2#q"],
  );
  assert.ok(!S.query(ix, "N/mm²").some((r) => r.match === "exact"));
});
test("the condition navigator still sees partial overlaps", () => {
  const ix = S.buildIndex(acceptanceBook);
  assert.ok(S.query(ix, "сила болта трения", { partial: true }).some((r) => r.ref === "a97002:p1:b2"));
});
test("a symbol-table row shared by several formulas is listed once", () => {
  const row = { latex: "\\eta", ru: "КПД передачи", ref: "a97002:p1:st1:s01" };
  const ix = S.buildIndex([{ id: "s", pages: [{ page: 1, items: [
    { id: "a97002:p1:f1", type: "formula", latex: "\\eta=a", vars: [row] },
    { id: "a97002:p1:f2", type: "formula", latex: "\\eta=b", vars: [row] },
  ] }] }]);
  const symbols = S.query(ix, "η").filter((r) => r.kind === "symbol");
  assert.equal(symbols.length, 1);
  assert.equal(S.query(ix, "η").filter((r) => r.kind === "formula").length, 2);
});
