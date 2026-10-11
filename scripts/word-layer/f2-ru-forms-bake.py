#!/usr/bin/env python3
"""Word-layer F2 - offline bake of Russian translations for Pealim paradigm cells (variant B).

Deterministic, no LLM: the first sense of the Pealim meaning is inflected by pymorphy3 to the
person / tense / gender / number of each cell («писать» + PERF-3fs -> «она писала»).
Cells whose Russian counterpart is not derivable from Hebrew features get NO form (passive of an
imperfective verb, present of a perfective verb, prepositions with suffixes...): the app then shows
the lemma meaning + the grammar hint, exactly as in F1. Silence beats a wrong form (R1/R10).

Two outputs, two independent paths:
  * SHIPPED  public/data/inflection/ru-forms-v1.json.gz — COMPACT word forms per paradigm
    (≈7x smaller than full phrases); public/js/ru-forms.js composes the phrase («она» + «писала»).
  * ORACLE   the full phrase of every cell, built here directly (no compact step). The JS composer
    must reproduce it exactly: tests/fixtures/word-layer/ru-forms-oracle-sample.json (seeded slice,
    committed) and --oracle <file> (everything, for a full parity run outside the repo).

Usage:  python scripts/word-layer/f2-ru-forms-bake.py [--sample <dir>] [--oracle <file.json>]
Needs:  pip install pymorphy3 pymorphy3-dicts-ru   (bake-time only; never a runtime dependency)
Spec:   docs/planning/word-layer/F2_SPEC_2026_10_11.md (supersedes the F0 probe f0-ru-forms-probe.py)
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
SRC_MODEL = "pealim-infl-v12"
MODEL = "ru-forms-v1"
SRC = os.path.join(ROOT, "public/data/inflection", SRC_MODEL + ".json.gz")
OUT = os.path.join(ROOT, "public/data/inflection", MODEL + ".json.gz")
FIXTURE = os.path.join(ROOT, "tests/fixtures/word-layer/ru-forms-oracle-sample.json")

PRON = {"1s": "я", "1p": "мы", "2ms": "ты", "2fs": "ты", "2mp": "вы", "2fp": "вы",
        "3ms": "он", "3fs": "она", "3p": "они", "3mp": "они", "3fp": "они"}
POSS = {"1s": "мой", "1p": "наш", "2ms": "твой", "2fs": "твой", "2mp": "ваш", "2fp": "ваш",
        "3ms": "его", "3fs": "её", "3mp": "их", "3fp": "их"}
AGREEING_POSS = ("мой", "твой", "наш", "ваш")
COPULAS = ("быть", "стать", "становиться")
PLACEHOLDER_RE = re.compile(r"^(?:что|чего|чему|чем|кого|кому|ком|кем|где|куда|когда|как|какой)-(?:либо|нибудь|л\.?)$")
CELL_RE = re.compile(r"^(passive-)?(PERF|IMPF|IMP|AP|INF)-?(\w+)?$")
GN4 = ("ms", "fs", "mp", "fp")   # present (participle) cells: gender x number, no person
PERSON6 = ["1s", "2s", "3s", "1p", "2p", "3p"]   # order of the compact future arrays


def first_sense(meaning):
    """First sense of a Pealim meaning, as WordGloss.shortGloss picks it: the first ';'-sense that
    still has words once parentheticals are out, then its first ','-item. -> list of words."""
    for sense in str(meaning or "").replace("*", "").split(";"):
        m = re.sub(r"\([^)]*\)", " ", sense)
        m = re.sub(r"\s*\(.*$", "", m).split(",")[0].strip()
        if m:
            # «ждать чего-либо» → «ждите!»: the placeholder object is dictionary notation, not Russian
            words = [x for x in m.split() if not PLACEHOLDER_RE.match(x)]
            return words or m.split()
    return []


def w_(p):
    return p.word if p else ""


def num_tags(pn):
    return {"plur"} if pn.endswith("p") else {"sing", "femn" if "f" in pn else "masc"}


def gnum(pn):
    """index into [masc sg, femn sg, plural] arrays"""
    return 2 if pn.endswith("p") else (1 if "f" in pn else 0)


def p6(pn):
    """index into the 6-person arrays (1s 2s 3s 1p 2p 3p)"""
    return PERSON6.index(pn[0] + ("p" if pn.endswith("p") else "s"))


def fut6(v):
    return [w_(v.inflect({"futr", {"1": "1per", "2": "2per", "3": "3per"}[k[0]], "plur" if k[1] == "p" else "sing"})) for k in PERSON6]


def gn3(parse, extra):
    return [w_(parse.inflect(extra | {"sing", "masc"})), w_(parse.inflect(extra | {"sing", "femn"})), w_(parse.inflect(extra | {"plur"}))]


def tail_(t):
    return (" " + t) if t else ""


BYT = M.parse("быть")[0]
BUDU = fut6(BYT)
BYL = gn3(BYT, {"past"})
COPULA_FORMS = {}
for _c in COPULAS:
    _v = [x for x in M.parse(_c) if x.tag.POS == "INFN"][0]
    COPULA_FORMS[_c] = {"P": gn3(_v, {"past"}), "F": fut6(_v) if (_v.tag.aspect == "perf" or _c == "быть") else [b + " " + _c for b in BUDU],
                        "I": [w_(_v.inflect({"impr", "excl", "sing"})), w_(_v.inflect({"impr", "excl", "plur"}))]}


# ══ ORACLE: full phrase per cell, built directly ═══════════════════════════════════════════════
def verb_cell(v, vperf, w, tail, aspect, passive, T, pn):
    t = tail_(tail)
    if passive:   # only from a PERFECTIVE reading: «рассказать» -> «рассказан» (imperfective «писан» misleads)
        if vperf is None or T not in ("PERF", "IMPF", "AP"):
            return None
        if T == "AP":
            f = vperf.inflect({"PRTF", "pssv", "past", "nomn"} | num_tags(pn))
            return (f.word + t) if f else None
        f = vperf.inflect({"PRTS", "pssv", "past"} | num_tags(pn))
        if not f:
            return None
        if T == "PERF":
            b = BYT.inflect({"past"} | num_tags(pn))
            return f"{PRON[pn]} {b.word} {f.word}{t}"
        b = BYT.inflect({"futr", {"1": "1per", "2": "2per", "3": "3per"}[pn[0]], "plur" if pn.endswith("p") else "sing"})
        return f"{PRON[pn]} {b.word} {f.word}{t}"
    if T == "INF":
        return w + t
    if T == "PERF":
        f = v.inflect({"past"} | num_tags(pn))
        return f"{PRON[pn]} {f.word}{'(а)' if pn == '1s' else ''}{t}" if f else None
    if T == "IMPF":
        person, number = {"1": "1per", "2": "2per", "3": "3per"}[pn[0]], "plur" if pn.endswith("p") else "sing"
        if aspect == "impf" and w != "быть":   # «они будут», not «они будут быть»
            return f"{PRON[pn]} {BYT.inflect({'futr', person, number}).word} {w}{t}"
        f = v.inflect({"futr", person, number})
        return f"{PRON[pn]} {f.word}{t}" if f else None
    if T == "IMP":
        f = v.inflect({"impr", "excl", "plur" if pn.endswith("p") else "sing"})
        return f"{f.word}{t}!" if f else None
    if T == "AP":   # Hebrew present = participle: gender + number, no person -> 3rd person, «(ж.)»
        if aspect == "perf" or w == "быть":   # «есть / суть» is not what הוֹוֶה means
            return None
        f = v.inflect({"pres", "3per", "plur" if pn.endswith("p") else "sing"})
        return f"{f.word}{t}{' (ж.)' if 'f' in pn else ''}" if f else None
    return None


def copula_pred(words):
    """«раздавленным» (participle) -> short form everywhere: «был раздавлен»; «ясным» (adjective) ->
    instrumental after the copula, nominative in the present. -> (q[3], n[3], rest) or None."""
    first = words[0]
    prt = [x for x in M.parse(first) if x.tag.POS == "PRTF" and x.tag.case == "ablt"]
    if prt:
        q = [w_(prt[0].inflect({"PRTS"} | t)) for t in ({"sing", "masc"}, {"sing", "femn"}, {"plur"})]
        if all(q):
            return q, q, " ".join(words[1:])
    adj = [x for x in M.parse(first) if x.tag.POS == "ADJF" and x.tag.case == "ablt"]
    if adj:
        q = gn3(adj[0], {"ablt"})
        n = gn3(adj[0], {"nomn"})
        if all(q) and all(n):
            return q, n, " ".join(words[1:])
    return None


def copula_cell(c, words, passive, T, pn):
    if passive:
        return None
    if T == "INF":
        return f"{c} {' '.join(words)}"
    pr = copula_pred(words)
    if not pr:
        return None
    q, n, rest = pr
    i, r = gnum(pn), tail_(rest)
    cf = COPULA_FORMS[c]
    if T == "PERF":
        return f"{PRON[pn]} {cf['P'][i]} {q[i]}{r}"   # «(а)» only on a bare verb: «я был(а) раздавлен» mis-agrees
    if T == "IMPF":
        return f"{PRON[pn]} {cf['F'][p6(pn)]} {q[i]}{r}"
    if T == "IMP":
        return f"{cf['I'][1 if pn.endswith('p') else 0]} {q[i]}{r}!"
    if T == "AP":
        return f"{n[i]}{r}"   # the predicate itself shows gender + number
    return None


def verb_reading(p):
    """-> dict(kind, w, tail, v, vperf, aspect) or (None, reason)"""
    words = first_sense(p.get("meaning"))
    if not words:
        return None, "no-meaning"
    w, tail = words[0], " ".join(words[1:])
    if w in COPULAS and tail:
        return {"kind": "copula", "w": w, "words": words[1:]}, "copula"
    pr = [x for x in M.parse(w) if x.tag.POS == "INFN" and x.normal_form == w.lower()]
    if not pr:
        return None, "meaning-not-infinitive"
    impf = [x for x in pr if x.tag.aspect == "impf"]
    perf = [x for x in pr if x.tag.aspect == "perf"]
    # A two-aspect verb («характеризовать») reads imperfective: «будет характеризовать» is always
    # right, the bare «характеризуют» would read as present.
    v = (impf or perf)[0]
    aspect = "impf" if impf else "perf"
    # Passive only from a purely PERFECTIVE verb whose tail is not a predicate: a two-aspect
    # «переводить» gave «перевожены», «сделать тусклым» gave «сделана тусклым».
    tail_adj = tail and any(x.tag.POS in ("ADJF", "PRTF") and x.tag.case == "ablt" for x in M.parse(tail.split()[0]))
    vperf = perf[0] if (perf and not impf and not tail_adj) else None
    return {"kind": "verb", "w": w, "tail": tail, "v": v, "vperf": vperf, "aspect": aspect}, aspect


def oracle_verb(p, rd):
    out = {}
    for ck in p["cells"]:
        m = CELL_RE.match(ck)
        if not m:
            continue
        passive, T, pn = m.groups()
        pn = pn or ""
        if T == "AP" and pn not in GN4 or T not in ("INF", "AP") and pn not in PRON:
            continue
        if T == "IMP" and pn[0] != "2":
            continue
        if rd["kind"] == "copula":
            txt = copula_cell(rd["w"], rd["words"], passive, T, pn)
        else:
            txt = verb_cell(rd["v"], rd["vperf"], rd["w"], rd["tail"], rd["aspect"], passive, T, pn)
        if txt:
            out[ck] = txt
    return out


def noun_reading(p):
    words = first_sense(p.get("meaning"))
    if not words:
        return None, "no-meaning"
    if len(words) >= 2:   # «перочинный нож»: agree the adjective with the noun
        a = [x for x in M.parse(words[0]) if x.tag.POS == "ADJF" and x.tag.case == "nomn"]
        nn = [x for x in M.parse(words[1]) if x.tag.POS == "NOUN" and x.tag.case == "nomn" and x.normal_form == words[1].lower()]
        if a and nn:
            return {"kind": "phrase", "a": a[0], "n": nn[0], "tail": " ".join(words[2:])}, "noun-phrase"
    w, tail = words[0], " ".join(words[1:])
    pr = [x for x in M.parse(w) if x.tag.POS in ("NOUN", "ADJF") and x.normal_form == w.lower() and x.tag.case == "nomn"]
    if not pr:
        return None, "meaning-not-noun"
    if pr[0].tag.POS == "ADJF":
        return {"kind": "adj", "a": pr[0], "tail": tail}, "adj"
    return {"kind": "noun", "n": pr[0], "tail": tail}, "noun"


def noun_number_forms(rd):
    """-> (sg, pl, gender) where gender in m/f/n/p (p = plurale tantum: possessive goes plural)"""
    n, t = rd["n"], tail_(rd["tail"])
    pltm = "Pltm" in n.tag
    sgtm = "Sgtm" in n.tag
    g = "p" if pltm else {"masc": "m", "femn": "f", "neut": "n"}.get(n.tag.gender, "m")
    sg, pl = n.word, ("" if sgtm else w_(n.inflect({"plur", "nomn"})))
    if pltm:
        pl = sg
    if rd["kind"] == "phrase":
        a = rd["a"]
        ag = a.inflect({"plur", "nomn"} if pltm else {n.tag.gender or "masc", "sing", "nomn"})
        apl = a.inflect({"plur", "nomn"})
        sg = (ag.word + " " + sg) if ag else ""
        pl = (apl.word + " " + pl) if (apl and pl) else ""
    return (sg + t) if sg else "", (pl + t) if pl else "", g


def poss_word(key, g, plural):
    poss = POSS[key]
    if poss not in AGREEING_POSS:
        return poss
    tags = {"plur", "nomn"} if (plural or g == "p") else {{"m": "masc", "f": "femn", "n": "neut"}[g], "nomn", "sing"}
    pa = M.parse(poss)[0].inflect(tags)
    return pa.word if pa else poss


def oracle_noun(p, rd):
    out = {}
    if rd["kind"] == "adj":
        a, t = rd["a"], tail_(rd["tail"])
        for ck in p["cells"]:
            m = re.match(r"^(m|f)(s|p)-a$", ck)
            if m:
                f = a.inflect({"plur", "nomn"} if m.group(2) == "p" else {"sing", "nomn", "femn" if m.group(1) == "f" else "masc"})
                if f:
                    out[ck] = f.word + t
        return out
    sg, pl, g = noun_number_forms(rd)
    for ck in p["cells"]:
        plural = ck.startswith("p")
        base = pl if plural else sg
        if not base:
            continue
        if ck in ("s", "p", "sc", "pc"):
            out[ck] = base   # construct = the same word; the app adds the «сопр.» hint
            continue
        pm = re.match(r"^[sp]-P-(\w+)$", ck)
        if pm:
            out[ck] = f"{poss_word(pm.group(1), g, plural)} {base}"
    return out


# ══ SHIPPED: compact word forms (composed back in public/js/ru-forms.js) ═════════════════════════
def compact_verb(rd):
    if rd["kind"] == "copula":
        pr = copula_pred(rd["words"])
        c = {"c": rd["w"], "i": rd["w"] + " " + " ".join(rd["words"])}
        if pr:
            c.update({"q": pr[0], "N": pr[1], "t": pr[2]})
        return c
    v, vp, t = rd["v"], rd["vperf"], rd["tail"]
    c = {"i": rd["w"], "a": rd["aspect"][0], "P": gn3(v, {"past"}),
         "I": [w_(v.inflect({"impr", "excl", "sing"})), w_(v.inflect({"impr", "excl", "plur"}))]}
    if t:
        c["t"] = t
    if rd["aspect"] == "perf" or rd["w"] == "быть":   # F wins over «буду + infinitive» in the composer
        c["F"] = fut6(v)
    if rd["aspect"] != "perf" and rd["w"] != "быть":
        c["R"] = [w_(v.inflect({"pres", "3per", "sing"})), w_(v.inflect({"pres", "3per", "plur"}))]
    if vp is not None:
        s = gn3(vp, {"PRTS", "pssv", "past"})
        S = gn3(vp, {"PRTF", "pssv", "past", "nomn"})
        if any(s) or any(S):
            c["s"], c["S"] = s, S
    return c


def compact_noun(rd):
    if rd["kind"] == "adj":
        c = {"A": gn3(rd["a"], {"nomn"})}
        if rd["tail"]:
            c["t"] = rd["tail"]
        return c
    sg, pl, g = noun_number_forms(rd)
    return {"n": [sg, pl], "g": g}


def main():
    d = json.load(gzip.open(SRC))
    stats, cells, compact, oracle, rows = collections.Counter(), collections.Counter(), {}, {}, []
    for p in d["paradigms"]:
        if p["kind"] == "verb":
            rd, info = verb_reading(p)
            out = oracle_verb(p, rd) if rd else None
            cp = compact_verb(rd) if rd else None
        elif p["kind"] == "noun" and p["pos"] in ("noun", "adjective"):
            rd, info = noun_reading(p)
            out = oracle_noun(p, rd) if rd else None
            cp = compact_noun(rd) if rd else None
        else:
            continue
        key = p["kind"] + ("/" + p["pos"] if p["kind"] == "noun" else "")
        stats[key + "|paradigms"] += 1
        stats[key + "|" + info] += 1
        cells[key + "|cells"] += len(p["cells"])
        if not out:
            continue
        pid = str(p["pealim_id"])
        cells[key + "|translated"] += len(out)
        if p["kind"] == "verb":
            cells["verb|passive_cells"] += sum(1 for k in p["cells"] if k.startswith("passive-"))
            cells["verb|passive_translated"] += sum(1 for k in out if k.startswith("passive-"))
        compact[pid] = cp
        oracle[pid] = {"slots": sorted(p["cells"]), "forms": out}
        for ck, txt in out.items():
            rows.append((p["lemma"], (p.get("meaning") or "")[:40].replace("|", "/"), ck, p["cells"][ck].get("he", ""), txt))
    payload = {"model_version": MODEL, "source_model": SRC_MODEL,
               "generator": "scripts/word-layer/f2-ru-forms-bake.py (pymorphy3 " + pymorphy3.__version__ + ")",
               "budu": BUDU, "byl": BYL, "copulas": COPULA_FORMS, "forms": compact}
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf8")
    with open(OUT, "wb") as f:   # mtime=0 + no filename: byte-identical rebuilds
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0, compresslevel=9, filename="") as g:
            g.write(raw)
    # committed parity fixture: a seeded slice that covers every compact field
    random.seed(20261011)
    pids = sorted(oracle, key=int)
    pick = set(random.sample(pids, 400))
    for pid in pids:   # make sure the rare branches are in: copula, passive, adjective, plurale tantum, phrase
        c = compact[pid]
        tag = "c" if "c" in c else "s" if "s" in c else "A" if "A" in c else ("g" + c.get("g", "")) if "n" in c else ""
        if tag in ("c", "s", "A", "gp") and sum(1 for x in pick if _tag(compact[x]) == tag) < 25:
            pick.add(pid)
    os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
    with open(FIXTURE, "w", encoding="utf8", newline="\n") as f:
        json.dump({"model_version": MODEL, "note": "oracle = full phrases built directly by the bake; "
                   "ru-forms.js must compose the same from the shipped compact file",
                   "paradigms": {pid: oracle[pid] for pid in sorted(pick, key=int)}}, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    if "--oracle" in sys.argv:
        with open(sys.argv[sys.argv.index("--oracle") + 1], "w", encoding="utf8") as f:
            json.dump(oracle, f, ensure_ascii=False)
    report = {"paradigms": dict(sorted(stats.items())), "cells": dict(sorted(cells.items())),
              "raw_bytes": len(raw), "gz_bytes": os.path.getsize(OUT), "paradigms_with_forms": len(compact)}
    if "--sample" in sys.argv:
        out_dir = sys.argv[sys.argv.index("--sample") + 1]
        os.makedirs(out_dir, exist_ok=True)
        random.seed(20261012)
        with open(os.path.join(out_dir, "f2-ru-forms-sample.md"), "w", encoding="utf8", newline="\n") as f:
            f.write("| # | лемма | значение (Pealim) | клетка | форма | перевод | вердикт |\n|---|---|---|---|---|---|---|\n")
            for i, r in enumerate(random.sample(rows, 120), 1):
                f.write("| %d | %s | %s | %s | %s | %s |  |\n" % ((i,) + r))
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1))


def _tag(c):
    return "c" if "c" in c else "s" if "s" in c else "A" if "A" in c else ("g" + c.get("g", "")) if "n" in c else ""


if __name__ == "__main__":
    main()
