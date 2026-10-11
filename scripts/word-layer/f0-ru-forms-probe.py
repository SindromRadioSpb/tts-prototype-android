#!/usr/bin/env python3
"""Word-layer F0 - variant B feasibility: can Russian glosses for Pealim paradigm cells be generated
deterministically (pymorphy3) from the lemma meaning + cell features, with no LLM?
Measures inflectability per paradigm and writes a seeded random sample for manual review.

Usage: python scripts/word-layer/f0-ru-forms-probe.py [--out docs/planning/word-layer/f0]
Needs: pip install pymorphy3 pymorphy3-dicts-ru (probe only; not a runtime dependency).
Canon: docs/planning/WORD_LAYER_RESEARCH_AND_PLAN_2026_10_11.md
"""
import collections
import gzip
import json
import os
import random
import re
import sys

import pymorphy3

M = pymorphy3.MorphAnalyzer()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "docs/planning/word-layer/f0")
d = json.load(gzip.open(os.path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz")))
P = [p for p in d["paradigms"] if not p["lemma"].startswith("Conjugation of")]

PRON = {"1s": "я", "1p": "мы", "2ms": "ты", "2fs": "ты", "2mp": "вы", "2fp": "вы",
        "3ms": "он", "3fs": "она", "3p": "они", "3mp": "они", "3fp": "они"}
POSS = {"1s": "мой", "1p": "наш", "2ms": "твой", "2fs": "твой", "2mp": "ваш", "2fp": "ваш",
        "3ms": "его", "3fs": "её", "3mp": "их", "3fp": "их"}
POSS_NOTE = {"2ms": " (к м.)", "2fs": " (к ж.)", "2mp": " (к м.)", "2fp": " (к ж.)", "3mp": " (м.)", "3fp": " (ж.)"}


def head(meaning):
    """First sense without parentheticals: ('смотреть', 'на')."""
    m = re.split(r"[;,]", re.sub(r"\*?\([^)]*\)\*?", "", meaning or ""))[0].strip()
    m = re.sub(r"\s*\(.*$", "", m)  # unclosed parenthetical «(в идиомах»
    parts = m.split()
    return (parts[0], " ".join(parts[1:])) if parts else ("", "")


def copula_forms(p, w, tail):
    """«быть повреждённым», «стать ясным»: inflect the copula, agree the predicate (instrumental)."""
    words = tail.split()
    pred = [x for x in M.parse(words[0]) if x.tag.POS in ("ADJF", "PRTF") and x.tag.case == "ablt"]
    rest = " ".join(words[1:])
    rest = (" " + rest) if rest else ""
    v = M.parse(w)[0]
    out = {}
    for ck in p["cells"]:
        m = re.match(r"(passive-)?(PERF|IMPF|IMP|AP|INF)-?(\w+)?", ck)
        if not m:
            continue
        passive, T, pn = m.groups()
        pn = pn or ""
        if passive:
            out[ck] = ("grammar", f"{w} {tail} — страдательная форма")
            continue
        g = "femn" if "f" in pn else "masc"
        pl = pn.endswith("p")
        num = {"plur"} if pl else {"sing", g}
        pr = pred[0].inflect({"ablt"} | num) if pred else None
        pw = (pr.word if pr else words[0]) + rest
        if T == "INF":
            out[ck] = ("ok", f"{w} {tail}")
        elif T == "PERF":
            b = v.inflect({"past"} | num)
            out[ck] = ("ok", f"{PRON.get(pn, '')} {b.word} {pw}".strip())
        elif T == "IMPF":
            person = {"1": "1per", "2": "2per", "3": "3per"}[pn[0]]
            if w == "быть":
                b = v.inflect({"futr", person, "plur" if pl else "sing"})
                out[ck] = ("ok", f"{PRON.get(pn, '')} {b.word} {pw}")
            else:
                b = v.inflect({"futr", person, "plur" if pl else "sing"}) or v
                out[ck] = ("ok", f"{PRON.get(pn, '')} {b.word} {pw}")
        elif T == "IMP":
            b = v.inflect({"impr", "excl", "plur" if pl else "sing"})
            out[ck] = ("ok", f"{b.word} {pw}! ({gn(pn)})") if b else ("fail", None)
        elif T == "AP":
            nom = pred[0].inflect({"nomn"} | num) if pred else None
            out[ck] = ("ok", f"{nom.word if nom else words[0]}{rest} ({gn(pn)}; лицо по контексту)")
    return out, "copula"


def phrase_forms(p, a, n, rest):
    rest = (" " + rest) if rest else ""
    out = {}
    for ck in p["cells"]:
        pl = ck.startswith(("p", "mp", "fp"))
        nf = n.inflect({"plur", "nomn"}) if pl else n
        g = n.tag.gender or "masc"
        af = a.inflect({"plur", "nomn"} if pl else {g, "sing", "nomn"})
        if not (nf and af):
            out[ck] = ("fail", None)
            continue
        phrase = f"{af.word} {nf.word}{rest}"
        if ck in ("sc", "pc"):
            out[ck] = ("grammar", f"{phrase} (сопряжённая форма: «… кого/чего»)")
            continue
        m = re.search(r"-P-(\w+)$", ck)
        if m:
            key = m.group(1)
            poss = POSS[key]
            if poss in ("мой", "твой", "наш", "ваш"):
                pa = M.parse(poss)[0].inflect({"plur", "nomn"} if pl else {g, "nomn", "sing"})
                poss = pa.word if pa else poss
            out[ck] = ("ok", f"{poss} {phrase}{POSS_NOTE.get(key, '')}")
            continue
        out[ck] = ("ok", phrase)
    return out, "phrase"


def gn(pn):
    return ("мн." if pn.endswith("p") else "ед.") + (", ж." if "f" in pn else ", м.")


def verb_forms(p):
    w, tail = head(p.get("meaning"))
    if w in ("быть", "стать", "становиться") and tail:
        return copula_forms(p, w, tail)
    pr = [x for x in M.parse(w) if x.tag.POS == "INFN" and x.normal_form == w.lower()]
    if not pr:
        return None, "meaning-not-infinitive"
    v = pr[0]
    aspect = v.tag.aspect  # perf | impf
    tail = (" " + tail) if tail else ""
    out = {}

    def inf(tags):
        r = v.inflect(set(tags))
        return r.word if r else None

    for ck in p["cells"]:
        m = re.match(r"(passive-)?(PERF|IMPF|IMP|AP|INF)-?(\w+)?", ck)
        if not m:
            continue
        passive, T, pn = m.groups()
        pn = pn or ""
        if passive:
            out[ck] = ("grammar", f"{w} — страдательная форма")
            continue
        g = "femn" if "f" in pn else "masc"
        pl = pn.endswith("p")
        if T == "INF":
            out[ck] = ("ok", w + tail)
        elif T == "PERF":
            f = inf({"past", "plur"} if pl else {"past", "sing", g})
            if f and pn == "1s":
                f = f + "(а)" if g == "masc" else f  # Hebrew 1s past is common-gender
            out[ck] = ("ok", f"{PRON.get(pn, '')} {f}{tail}".strip()) if f else ("fail", None)
        elif T == "IMPF":
            person = {"1": "1per", "2": "2per", "3": "3per"}[pn[0]]
            if aspect == "impf":
                b = M.parse("быть")[0].inflect({"futr", person, "plur" if pl else "sing"})
                out[ck] = ("ok", f"{PRON.get(pn, '')} {b.word} {w}{tail}")
            else:
                f = inf({"futr", person, "plur" if pl else "sing"})
                out[ck] = ("ok", f"{PRON.get(pn, '')} {f}{tail}") if f else ("fail", None)
        elif T == "IMP":
            f = inf({"impr", "excl", "plur" if pl else "sing"})
            out[ck] = ("ok", f"{f}{tail}! ({gn(pn)})") if f else ("fail", None)
        elif T == "AP":  # Hebrew present: gender + number, no person
            if aspect == "perf":
                out[ck] = ("grammar", f"{w} — наст. время ({gn(pn)}); сов. вид в русском")
                continue
            f = inf({"pres", "3per", "plur" if pl else "sing"})
            out[ck] = ("ok", f"{f}{tail} ({gn(pn)}; лицо по контексту)") if f else ("fail", None)
    return out, aspect


def noun_forms(p):
    w, tail = head(p.get("meaning"))
    tail = (" " + tail) if tail else ""
    words = (w + tail).split()
    if len(words) >= 2:  # «перочинный нож», «самое лучшее»: agree the adjective with the noun
        a = [x for x in M.parse(words[0]) if x.tag.POS == "ADJF" and x.tag.case == "nomn"]
        nn = [x for x in M.parse(words[1]) if x.tag.POS in ("NOUN", "ADJF") and x.tag.case == "nomn"]
        if a and nn:
            return phrase_forms(p, a[0], nn[0], " ".join(words[2:]))
    pr = [x for x in M.parse(w) if x.tag.POS in ("NOUN", "ADJF") and x.normal_form == w.lower() and x.tag.case == "nomn"]
    if not pr:
        return None, "meaning-not-noun"
    n = pr[0]
    out = {}
    for ck in p["cells"]:
        pl = ck.startswith(("p", "mp", "fp"))
        if n.tag.POS == "ADJF":
            g = "femn" if ck.startswith("f") else "masc"
            f = n.inflect({"plur", "nomn"} if pl else {"sing", "nomn", g})
            out[ck] = ("ok", f.word + tail) if f else ("fail", None)
            continue
        f = n.inflect({"plur", "nomn"}) if pl else n
        if not f:
            out[ck] = ("fail", None)
            continue
        if ck in ("sc", "pc"):
            out[ck] = ("grammar", f"{f.word}{tail} (сопряжённая форма: «… кого/чего»)")
            continue
        m = re.search(r"-P-(\w+)$", ck)
        if m:
            key = m.group(1)
            poss = POSS[key]
            if poss in ("мой", "твой", "наш", "ваш"):
                g = n.tag.gender or "masc"
                pa = M.parse(poss)[0].inflect({"plur", "nomn"} if pl else {g, "nomn", "sing"})
                poss = pa.word if pa else poss
            out[ck] = ("ok", f"{poss} {f.word}{tail}{POSS_NOTE.get(key, '')}")
            continue
        out[ck] = ("ok", f.word + tail)
    return out, "adj" if n.tag.POS == "ADJF" else "noun"


stats, cells, asp, rows = collections.Counter(), collections.Counter(), collections.Counter(), []
for p in P:
    if p["kind"] == "verb":
        out, info = verb_forms(p)
    elif p["kind"] == "noun" and p["pos"] in ("noun", "adjective") and any(k in p["cells"] for k in ("s", "ms-a")):
        out, info = noun_forms(p)
    else:
        continue
    key = p["kind"] + ("/" + p["pos"] if p["kind"] == "noun" else "")
    stats[key, "paradigms"] += 1
    if out is None:
        stats[key, info] += 1
        continue
    if p["kind"] == "verb":
        asp[info] += 1
    st = collections.Counter(v[0] for v in out.values())
    for k, n in st.items():
        cells[key, k] += n
    if st["fail"] == 0:
        stats[key, "all-cells-generated"] += 1
    for ck, (s, txt) in out.items():
        rows.append((p["lemma"], (p.get("meaning") or "")[:40], ck, s, txt))

os.makedirs(OUT, exist_ok=True)
res = {"paradigms": {f"{a}|{b}": n for (a, b), n in sorted(stats.items())},
       "cells": {f"{a}|{b}": n for (a, b), n in sorted(cells.items())},
       "verb_aspect": dict(asp)}
with open(os.path.join(OUT, "ru-forms-metrics.json"), "w", encoding="utf8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
random.seed(20261011)
smp = random.sample(rows, 120)
with open(os.path.join(OUT, "ru-forms-sample.md"), "w", encoding="utf8", newline="\n") as f:
    f.write("| # | лемма | значение (Pealim) | клетка | статус | русская форма | вердикт |\n|---|---|---|---|---|---|---|\n")
    for i, (l, m, ck, s, t) in enumerate(smp, 1):
        f.write(f"| {i} | {l} | {m} | {ck} | {s} | {t or ''} |  |\n")
print(json.dumps(res, ensure_ascii=False, indent=1))
