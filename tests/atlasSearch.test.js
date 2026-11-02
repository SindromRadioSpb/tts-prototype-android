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
    ])
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
      b = S.unpack(JSON.parse(fs.readFileSync(path.join(dir, "search.json"))));
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
