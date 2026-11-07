/* Atlas search: same implementation in Node and browser. Russian stemming follows
 * Snowball Russian (https://snowballstem.org/algorithms/russian/stemmer.html).
 * Original implementation below; Snowball algorithm distributed under BSD-3-Clause. */
(function (root) {
  "use strict";
  var F =
    typeof module === "object" && module.exports
      ? require("./corpus-fts.js")
      : root.CorpusFTS;
  function stemRu(w) {
    w = w.toLowerCase().replace(/ё/g, "е");
    var m = /^(.*?[аеиоуыэюя])(.*)$/.exec(w);
    if (!m) return w;
    var pre = m[1],
      r = m[2],
      r1 = w.search(/[аеиоуыэюя][^аеиоуыэюя]/) + 2,
      r2 = w.slice(r1).search(/[аеиоуыэюя][^аеиоуыэюя]/);
    r2 = r2 < 0 ? w.length : r1 + r2 + 2;
    var old = r;
    r = r.replace(
      /(?:ив|ивши|ившись|ыв|ывши|ывшись|(?<=[ая])в|(?<=[ая])вши|(?<=[ая])вшись)$/,
      "",
    );
    if (r === old) {
      r = r.replace(/с[яь]$/, "");
      old = r;
      r = r.replace(
        /(?:ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/,
        "",
      );
      if (r !== old)
        r = r.replace(
          /(?:ивш|ывш|ующ|(?<=[ая])ем|(?<=[ая])нн|(?<=[ая])вш|(?<=[ая])ющ|(?<=[ая])щ)$/,
          "",
        );
      else {
        old = r;
        r = r.replace(
          /(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю|(?<=[ая])ла|(?<=[ая])на|(?<=[ая])ете|(?<=[ая])йте|(?<=[ая])ли|(?<=[ая])й|(?<=[ая])л|(?<=[ая])ем|(?<=[ая])н|(?<=[ая])ло|(?<=[ая])но|(?<=[ая])ет|(?<=[ая])ют|(?<=[ая])ны|(?<=[ая])ть|(?<=[ая])ешь|(?<=[ая])нно)$/,
          "",
        );
        if (old === r)
          r = r.replace(
            /(?:иями|ями|ами|ией|иям|ием|иях|ев|ов|ие|ье|еи|ии|ей|ой|ий|ям|ем|ам|ом|ах|ях|ию|ью|ия|ья|а|е|и|й|о|у|ы|ь|ю|я)$/,
            "",
          );
      }
    }
    r = r.replace(/и$/, "");
    w = pre + r;
    var d = /(ость|ост)$/.exec(w);
    if (d && d.index >= r2) w = w.slice(0, d.index);
    if (/нн$/.test(w)) return w.slice(0, -1);
    if (/ь$/.test(w)) return w.slice(0, -1);
    return w.replace(/ейше?$/, "").replace(/нн$/, "н");
  }
  function normalize(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/[֑-ׇ]/g, "")
      .replace(/[׳’']/g, "'")
      .replace(/[״“”]/g, '"')
      .replace(/־/g, " ")
      .toLowerCase()
      .replace(/ё/g, "е");
  }
  function tokens(s) {
    return (
      normalize(s).match(/[א-ת]+(?:["'][א-ת]+)*|[а-я]+|[a-z0-9]+/g) || []
    ).map(function (t) {
      return /[א-ת]/.test(t) ? F.normalizeToken(t) : t;
    });
  }
  var greek = {
    Delta: "Δ",
    Sigma: "Σ",
    sigma: "σ",
    сигма: "σ",
    tau: "τ",
    тау: "τ",
    alpha: "α",
    альфа: "α",
    beta: "β",
    бета: "β",
    gamma: "γ",
    гамма: "γ",
    delta: "δ",
    дельта: "δ",
    phi: "φ",
    varphi: "φ",
    фи: "φ",
    pi: "π",
    пи: "π",
    omega: "ω",
    омега: "ω",
    eta: "η",
    эта: "η",
    theta: "θ",
    тета: "θ",
    lambda: "λ",
    лямбда: "λ",
    mu: "μ",
    мю: "μ",
    nu: "ν",
    xi: "ξ",
    rho: "ρ",
    ро: "ρ",
    epsilon: "ε",
    varepsilon: "ε",
  };
  function symbolKey(s) {
    return String(s || "")
      .replace(/гзира/g, "גזירה")
      .replace(/\\(?:left|right)/g, "")
      .replace(/[\[\]]/g, "")
      .replace(/\\prime|′|’/g, "'")
      .replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g, "$1")
      .replace(/\\?([a-zа-я]+)(?=[_\s{]|$)/gi, function (a, b) {
        return greek[b] || a;
      })
      .replace(/[₀-₉]/g, function (c) {
        return String("₀₁₂₃₄₅₆₇₈₉".indexOf(c));
      })
      .replace(/ϕ/g, "φ")
      .replace(/[\\{}_\s]/g, "");
  }
  var units = [
    ["N·mm", "N*mm", "Н·мм", "Нмм"],
    ["rpm", "об/мин", "1/min", "min⁻¹"],
    ["mm²", "mm^2", "мм²"],
    ["mm", "мм", 'מ"מ'],
    ["N/mm", "Н/мм"],
    ["MPa", "МПа"],
    ["N", "Н", "ניוטון"],
  ];
  function symbols(latex) {
    var text = String(latex || "").replace(
      /\\(?:text|mathrm)\{([^}]*)\}/g,
      "$1",
    );
    return (
      text.match(
        /\\[A-Za-z]+(?:_\{[^}]+\}|_[A-Za-z0-9א-ת]+)?|[A-Za-zα-ωΑ-Ω](?:_\{[^}]+\}|_[A-Za-z0-9א-ת]+)?/g,
      ) || []
    ).filter((x) => x[0] !== "\\" || greek[x.slice(1).split("_")[0]]);
  }
  function unitKey(s, lexicon) {
    s = String(s || "").replace(/\s/g, "");
    for (var g of (lexicon && lexicon.units) || units)
      if (g.includes(s)) return g[0];
    return s;
  }
  // A result card shows the start of the object: whole words, «…» when cut. A 26-character cut left most
  // cards on half a word («допускаемое напряжение смя»).
  var PREVIEW = 110;
  function preview(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= PREVIEW) return s;
    var cut = s.slice(0, PREVIEW),
      space = cut.lastIndexOf(" ");
    if (space > PREVIEW * 0.6) cut = cut.slice(0, space);
    return cut.replace(/[\s,;:·–—-]+$/, "") + "…";
  }
  function buildIndex(sections, lexicon) {
    var full = [],
      weights = [],
      details = {},
      docs = [],
      post = Object.create(null),
      terms = Object.create(null),
      R =
        typeof module === "object" && module.exports
          ? require("./atlas-reader.js")
          : root.AtlasReader,
      clean = R.factory({}).cleanMeta;
    function add(kind, sid, page, ref, he, ru, extra) {
      if (!ref) return;
      he = clean(he);
      ru = clean(ru);
      var n = docs.length;
      full.push([
        tokens(he).join(" "),
        tokens(ru).join(" "),
        tokens(extra || "").join(" "),
      ]);
      weights.push(1);
      docs.push([kind, sid, page, ref, preview(he), ru && preview(ru)]);
      var keys = new Set();
      tokens([he, ru, extra || ""].join(" ")).forEach(function (t) {
        keys.add(t);
        if (/[а-я]/.test(t)) keys.add("~" + stemRu(t));
      });
      if (kind === "symbol" || kind === "formula") {
        String(extra || "")
          .split("|")
          .forEach(function (x) {
            if (x && x.length < 30) {
              keys.add("@" + symbolKey(x));
              keys.add("#" + unitKey(x, lexicon));
            }
          });
      }
      keys.forEach(function (k) {
        (post[k] || (post[k] = [])).push(n);
      });
    }
    sections.forEach(function (s) {
      (s.pages || []).forEach(function (p) {
        (p.items || []).forEach(function (i) {
          add(
            i.type,
            s.id,
            p.page,
            i.id,
            i.he ||
              (i.vars || [])
                .map((v) => v.he)
                .filter(Boolean)
                .join(" · "),
            i.ru ||
              (i.vars || [])
                .map((v) => v.ru)
                .filter(Boolean)
                .join(" · "),
            [i.translit, i.translit_ru, i.result_var]
              .concat(symbols(i.latex))
              .concat(
                (i.vars || []).flatMap((v) => [v.he, v.ru, v.latex, v.unit]),
              )
              .join("|"),
          );
          weights[weights.length - 1] =
            i.kind === "heading" ? 3 : i.kind === "caption" ? 0.5 : 1;
          if (i.type === "formula")
            details[docs.length - 1] = {
              symbols: symbols(i.latex)
                .map(symbolKey)
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 8)
                .join(" · "),
            };
          (i.vars || []).forEach(function (v) {
            add(
              "symbol",
              s.id,
              p.page,
              v.ref || i.id,
              v.he || "",
              v.ru,
              [v.latex, v.unit].join("|"),
            );
            details[docs.length - 1] = {
              target: i.id,
              unit: v.unit || "",
              symbol: v.latex || "",
            };
          });
          (i.terms || []).forEach(function (t) {
            t = t.split("#")[0];
            if (!terms[t]) terms[t] = [];
            terms[t].push([s.id, p.page, i.id]);
          });
        });
        (p.tables || []).forEach(function (t) {
          add(
            "table",
            s.id,
            p.page,
            t.id,
            (t.cells || []).map((c) => c.he || "").join(" "),
            (t.cells || []).map((c) => clean(c.ru)).join(" "),
          );
          // Table definitions have independent, rendered cell refs in 97001.
          // A glossary entry must not disappear from search just because its
          // only definition is in a table instead of a prose item.
          if (['a97001','a97001rc32'].includes(s.atlas_id)) {
            (t.cells || []).forEach(function (cell) {
              (cell.terms || []).forEach(function (ref) {
                var id = String(ref).split('#')[0];
                (terms[id] || (terms[id] = [])).push([s.id, p.page, cell.id || t.id + ':cell:' + cell.row + ':' + cell.col]);
              });
            });
            (t.title_terms || []).forEach(function (ref) {
              var id = String(ref).split('#')[0];
              (terms[id] || (terms[id] = [])).push([s.id, p.page, t.id + ':title']);
            });
          }
        });
        // A cell coordinate is presentation metadata; table objects remain the search unit.
        (p.tables || []).forEach(function (t) {
          var n = docs.findIndex((d) => d[0] === "table" && d[3] === t.id);
          if (n >= 0)
            details[n] = {
              cells: (t.cells || []).map((c) => [
                c.row,
                c.col,
                tokens(clean(c.he) + " " + clean(c.ru)).join(" "),
              ]),
            };
        });
        (p.figures || []).forEach(function (f) {
          add(
            "figure",
            s.id,
            p.page,
            f.id,
            [f.caption_he]
              .concat((f.regions || []).map((r) => r.label_he))
              .join(" "),
            [clean(f.caption_ru)]
              .concat((f.regions || []).map((r) => clean(r.label_ru)))
              .join(" "),
          );
        });
        (p.errata || []).forEach(function (e) {
          add(
            "erratum",
            s.id,
            p.page,
            e.target || e.id,
            e.as_printed,
            e.explanation_ru,
            e.proposed,
          );
        });
        (p.examples || []).forEach(function (e) {
          add(
            "example",
            s.id,
            p.page,
            e.id,
            e.title_he,
            e.title_ru,
            (e.steps || []).map((x) => [x.he, x.ru].join(" ")).join(" "),
          );
        });
      });
    });
    var seen = new Set();
    sections.forEach(function (s) {
      Object.keys(s.terms || {}).forEach(function (id) {
        if (seen.has(id)) return;
        seen.add(id);
        var t = s.terms[id],
          places = terms[id] || [];
        if (!places.length) return;
        var a = places[0];
        add(
          "term",
          a[0],
          a[1],
          a[2],
          t.lemma_he,
          (t.senses || []).map((x) => x.ru).join("; "),
          [t.translit, t.translit_ru].join(" "),
        );
        docs[docs.length - 1].push(places);
        details[docs.length - 1] = {
          niqqud: t.niqqud || "",
          translit: t.translit || "",
          translit_ru: t.translit_ru || "",
          lemma: t.lemma_he,
          translation: (t.senses || []).map((x) => x.ru).join("; "),
        };
      });
    });
    var caseKeys = {};
    Object.keys(post)
      .filter((k) => k[0] === "@")
      .forEach((k) => {
        var v = k.slice(1),
          l = v.toLowerCase();
        (caseKeys[l] || (caseKeys[l] = [])).push(v);
      });
    return {
      schema: "linguistpro.atlas-search.1",
      atlas_id: (sections[0] || {}).atlas_id || 'a97002',
      lexicon: lexicon || null,
      docs: docs,
      post: post,
      full: full,
      weights: weights,
      details: details,
      caseKeys: caseKeys,
    };
  }
  function candidates(ix, t) {
    var out = [[t, 3]];
    if (/[а-я]/.test(t)) out.push(["~" + stemRu(t), 2]);
    if (/[א-ת]/.test(t))
      for (var i = 1; i <= 3 && i < t.length - 1; i++) {
        if (!/^[והבכלמש]+$/.test(t.slice(0, i))) break;
        var x = t.slice(i);
        if (ix.post[x]) out.push([x, 2]);
      }
    return out;
  }
  var groups = [
    "term",
    "symbol",
    "formula",
    "block",
    "table",
    "figure",
    "example",
    "erratum",
  ];
  function bestCell(detail, ts) {
    if (!detail.cells) return null;
    if (!detail._words)
      Object.defineProperty(detail, "_words", {
        value: detail.cells.map(function (c) {
          var set = new Set();
          c[2].split(" ").forEach(function (w) {
            set.add(w);
            if (/[а-я]/.test(w)) set.add("~" + stemRu(w));
          });
          return set;
        }),
      });
    var best = null;
    detail.cells.forEach(function (c, i) {
      var words = detail._words[i],
        score = 0;
      ts.forEach(function (t) {
        if (words.has(t) || words.has("~" + stemRu(t))) score++;
      });
      if (score && (!best || score > best.score))
        best = { row: c[0], col: c[1], score: score };
    });
    return best;
  }
  function query(ix, q, opts) {
    opts = opts || {};
    q = String(q || "").trim();
    if (!q) return [];
    var ts = tokens(q),
      score = new Map();
    var sym = symbolKey(q),
      unit = unitKey(q, ix.lexicon),
      special = [
        ["@" + sym, 4],
        ["#" + unit, 4],
      ];
    ((ix.lexicon && ix.lexicon.related) || []).forEach(function (pair) {
      if (pair.includes(unit))
        pair
          .filter((u) => u !== unit)
          .forEach((u) => special.push(["#" + u, 0.5]));
    });
    if (ix.caseKeys && ix.caseKeys[sym.toLowerCase()])
      ix.caseKeys[sym.toLowerCase()].forEach((k) => {
        if (k !== sym) special.push(["@" + k, 1]);
      });
    function collect(keys, channel) {
      var one = new Map();
      keys.forEach(function (k) {
        var list = ix.post[k[0]] || [],
          idf = Math.log(1 + ix.docs.length / (list.length || 1));
        list.forEach(function (n) {
          var v = one.get(n);
          if (!v || k[1] > v[0]) one.set(n, [k[1], idf]);
        });
      });
      one.forEach(function (v, n) {
        var a = score.get(n) || {
          matched: 0,
          quality: 3,
          tfidf: 0,
          special: 0,
        };
        if (channel) {
          a.special = Math.max(a.special, v[0]);
        } else {
          a.matched++;
          a.quality = Math.min(a.quality, v[0]);
        }
        a.tfidf += v[1];
        score.set(n, a);
      });
    }
    var phrase = /^".*"$/.test(q);
    // A notation query (one word that names a symbol or a unit: «D», «τ_S», «d₁», «N/mm²») is answered by
    // the notation channel. Its single letters are not words: «d» of «d₁» must not match every «d» and «D»
    // of the book as an exact hit. Units with «/ · ^ ²» are matched as units only; letters of a symbol
    // still find prose that writes it in one piece («Fy = F · cos α» for «F_y»).
    var notation =
      !phrase &&
      !/\s/.test(q) &&
      (/[\/·*^²³⁻]/.test(q) ||
        special.some(function (k) {
          return ix.post[k[0]] && ix.post[k[0]].length;
        }));
    var words = ts;
    if (notation) {
      // «σ_Lc» is one symbol: its subscript «lc» alone would match d_lc, F_lc, L_lc as «exact».
      words = /[\/·*^²³⁻_\\{}₀-₉α-ωΑ-Ωϕ′']/.test(q)
        ? []
        : ts.filter(function (t) {
            return t.length > 1;
          });
      var compact = sym.toLowerCase();
      if (!words.length && /^[a-z0-9]{2,}$/.test(compact) && ix.post[compact])
        words = [compact];
    }
    words.forEach((t) => collect(candidates(ix, t)));
    collect(special, true);
    if (phrase && !ix.full) throw Error("PHRASE_INDEX_UNAVAILABLE");
    var hits = Array.from(score)
      .filter(function (e) {
        var d = ix.docs[e[0]];
        return (
          (!opts.sid || opts.scope !== "section" || d[1] === opts.sid) &&
          (!phrase ||
            (ix.full[e[0]] || []).some((f) =>
              (" " + f + " ").includes(" " + ts.join(" ") + " "),
            ))
        );
      })
      .map(function (e) {
        var d = ix.docs[e[0]],
          v = e[1],
          detail = (ix.details || {})[e[0]] || {};
        var quality =
          v.special === 4
            ? 4
            : v.special === 1
              ? 3.5
              : v.special === 0.5
                ? 2.5
                : words.length && v.matched === words.length
                  ? v.quality
                  : 0;
        return {
          kind: d[0],
          sid: d[1],
          page: d[2],
          ref: d[3],
          he: d[4],
          ru: d[5],
          places: d[6] || null,
          detail: detail,
          cell: opts.skipCells ? null : bestCell(detail, ts),
          score: v.tfidf,
          matched: v.matched,
          quality: quality,
          weight:
            d[0] === "term"
              ? 1 +
                1 /
                  Math.max(
                    1,
                    Math.min(
                      tokens(detail.lemma).length || 100,
                      tokens(detail.translation).length || 100,
                    ),
                  )
              : (ix.weights || [])[e[0]] || 1,
          match:
            quality === 3.5
              ? "case"
              : quality === 2.5
                ? "related"
                : quality === 2
                  ? "form"
                  : quality === 0
                    ? "partial"
                    : "exact",
          order: e[0],
        };
      })
      .sort(function (a, b) {
        return (
          groups.indexOf(a.kind) - groups.indexOf(b.kind) ||
          b.quality - a.quality ||
          b.weight - a.weight ||
          b.score - a.score ||
          a.page - b.page ||
          a.order - b.order
        );
      });
    // All words of the query first: «сила трения» must not bury its 12 paragraphs under every «сила».
    // Objects with only some of the words are shown only when nothing holds them all. The condition
    // navigator asks for them explicitly: a long condition rarely sits in one object.
    if (!opts.partial && hits.some((r) => r.quality > 0))
      hits = hits.filter((r) => r.quality > 0);
    // One row of a symbol table serves several formulas («p248:st1:s01» five times): every copy opens the
    // same row, so the list shows it once (the best-ranked copy).
    var seenRef = new Set();
    return hits.filter(function (r) {
      var key = r.kind + "\u0000" + r.ref;
      if (seenRef.has(key)) return false;
      seenRef.add(key);
      return true;
    });
  }
  function fragment(ix, text) {
    var ts = tokens(text),
      scores = new Map();
    ix.docs.forEach(function (d) {
      if (d[0] !== "term") return;
      var name = ((ix.details || {})[ix.docs.indexOf(d)] || {}).lemma || d[4];
      var tt = tokens(name);
      if (
        !tt.length ||
        !tt.every((t) =>
          ts.some((x) => candidates(ix, x).some((k) => k[0] === t)),
        )
      )
        return;
      (d[6] || []).forEach(function (p) {
        var k = p[0] + ":" + p[1],
          r = scores.get(k) || {
            kind: "block",
            sid: p[0],
            page: p[1],
            ref: p[2],
            he: "",
            ru: "",
            terms: [],
            score: 0,
          };
        if (!r.terms.includes(name)) {
          r.terms.push(name);
          if (!r.termTranslations) r.termTranslations = [];
          r.termTranslations.push(
            ((ix.details || {})[ix.docs.indexOf(d)] || {}).translation || d[5],
          );
          r.score += Math.log(1 + ix.docs.length / (d[6].length || 1));
          r.he = r.terms.join(" · ");
        }
        scores.set(k, r);
      });
    });
    // Conditions also contain inflected terms absent from the lemma registry. Shared
    // text postings supply page coverage, while term evidence remains visible.
    query(ix, text, { skipCells: true, partial: true }).forEach(function (hit) {
      if (hit.kind !== "block" && hit.kind !== "formula") return;
      var k = hit.sid + ":" + hit.page;
      var r = scores.get(k) || {
        kind: "block",
        sid: hit.sid,
        page: hit.page,
        ref: hit.ref,
        he: hit.he,
        ru: hit.ru,
        terms: [],
        score: 0,
      };
      var lexical = hit.matched * hit.matched + hit.score;
      if (!r.lexical || lexical > r.lexical) {
        r.lexical = lexical;
        r.ref = hit.ref;
        r.ru = hit.ru;
      }
      scores.set(k, r);
    });
    scores.forEach(function (r) {
      r.score += r.lexical || 0;
    });
    var pageFormulas = new Map();
    ix.docs.forEach(function (d, n) {
      if (d[0] !== "formula") return;
      var key = d[1] + ":" + d[2],
        list = pageFormulas.get(key) || [];
      if (list.length < 3)
        list.push({
          sid: d[1],
          page: d[2],
          ref: d[3],
          symbols: ((ix.details || {})[n] || {}).symbols || "",
        });
      pageFormulas.set(key, list);
    });
    scores.forEach(function (r) {
      r.formulas = pageFormulas.get(r.sid + ":" + r.page) || [];
      if (r.termTranslations && r.termTranslations.length)
        r.ru = r.termTranslations.join(" · ");
    });
    return Array.from(scores.values()).sort(
      (a, b) => b.score - a.score || a.page - b.page,
    );
  }
  function pack(ix) {
    var ids = [];
    var atlasId = ix.atlas_id || 'a97002';
    ix.docs = ix.docs.map(function (d) {
      var n = ids.indexOf(d[1]);
      if (n < 0) {
        n = ids.length;
        ids.push(d[1]);
      }
      var row = [
        groups.indexOf(d[0]),
        n,
        d[2],
        d[3].startsWith(atlasId + ":p" + d[2] + ":")
          ? d[3].slice((atlasId + ":p" + d[2] + ":").length)
          : "=" + d[3],
        d[4],
        d[5],
      ];
      if (d[6])
        row.push(
          d[6]
            .map(function (p) {
              var si = ids.indexOf(p[0]);
              if (si < 0) {
                si = ids.length;
                ids.push(p[0]);
              }
              return (
                si.toString(36) +
                "," +
                p[1].toString(36) +
                "," +
                (p[2].startsWith(atlasId + ":p" + p[1] + ":")
                  ? p[2].slice((atlasId + ":p" + p[1] + ":").length)
                  : "=" + p[2])
              );
            })
            .join(";"),
        );
      return row;
    });
    ix.sids = ids;
    var pool = [],
      seen = new Map(),
      keys = Object.keys(ix.post).sort(),
      prev = "";
    ix.postIds = Object.create(null);
    keys.forEach(function (k) {
      var last = 0,
        v = ix.post[k]
          .map(function (n) {
            var delta = n - last;
            last = n;
            return numberChar(delta);
          })
          .join(""),
        id = seen.get(v);
      if (id === undefined) {
        id = pool.length;
        pool.push(v);
        seen.set(v, id);
      }
      ix.postIds[k] = id;
    });
    ix.pool = pool;
    delete ix.post;

    ix.packed = true;
    return ix;
  }
  // One UTF-16 code unit per bounded integer: no per-digit branches on mobile.
  function numberChar(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xd7cf)
      throw Error("SEARCH_INTEGER_RANGE");
    return String.fromCharCode(48 + value);
  }
  function numbers(values) {
    return values.map(numberChar).join("");
  }
  function packPhrases(full) {
    var words = [],
      map = new Map();
    return {
      words: words,
      rows: full.map((fields) =>
        fields.map((text) =>
          numbers(
            text
              .split(" ")
              .filter(Boolean)
              .map((word) => {
                if (!map.has(word)) {
                  map.set(word, words.length);
                  words.push(word);
                }
                return map.get(word);
              }),
          ),
        ),
      ),
    };
  }
  function unpackPhrases(data) {
    return data.rows.map((fields) =>
      fields.map((text) =>
        decode(text, false)
          .map((n) => data.words[n])
          .join(" "),
      ),
    );
  }
  function decode(s, cumulative) {
    var out = new Array(s.length),
      n = 0;
    for (var i = 0; i < s.length; i++) {
      var value = s.charCodeAt(i) - 48;
      n += value;
      out[i] = cumulative === false ? value : n;
    }
    return out;
  }
  function unpack(ix) {
    if (!ix.packed) return ix;
    var atlasId = ix.atlas_id || 'a97002';
    ix.docs = ix.docs.map(function (d,index) {
      return [
        groups[d[0]],
        ix.sids[d[1]],
        d[2],
        d[3][0] === "=" ? d[3].slice(1) : atlasId + ":p" + d[2] + ":" + d[3],
        ix.previews ? ix.previews[index][0] : d[4],
        ix.previews ? ix.previews[index][1] : d[5],
        d[6]
          ? d[6].split(";").map(function (p) {
              var a = p.split(","),
                page = parseInt(a[1], 36);
              return [
                ix.sids[parseInt(a[0], 36)],
                page,
                a[2][0] === "="
                  ? a[2].slice(1)
                  : atlasId + ":p" + page + ":" + a[2],
              ];
            })
          : null,
      ];
    });
    // Decode only posting lists touched by a query. Loading the book never walks
    // all 33K dictionary entries on the UI thread.
    var ids = ix.postIds,
      pool = ix.pool,
      decoded = [];
    Object.setPrototypeOf(ids, null);
    ix.post = new Proxy(ids, {
      get: function (target, key) {
        var id = target[key];
        if (typeof id !== "number") return undefined;
        if (!decoded[id]) decoded[id] = decode(pool[id]);
        return decoded[id];
      },
    });
    delete ix.postIds;
    delete ix.previews;
    delete ix.pool;
    ix.packed = false;
    return ix;
  }
  var api = {
    packPhrases: packPhrases,
    unpackPhrases: unpackPhrases,
    pack: pack,
    unpack: unpack,
    normalize: normalize,
    tokens: tokens,
    stemRu: stemRu,
    symbolKey: symbolKey,
    symbols: symbols,
    unitKey: unitKey,
    greek: greek,
    buildIndex: buildIndex,
    query: query,
    fragment: fragment,
  };
  api.editionContract = 'atlas-97001-structure-4';
  root.AtlasSearch = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window === "object" ? window : globalThis);
