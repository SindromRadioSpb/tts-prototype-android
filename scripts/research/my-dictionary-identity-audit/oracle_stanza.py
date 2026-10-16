"""Stanza (UD Hebrew) as an independent lemma oracle for the identity audit.

Two modes:
  calibrate <test.conllu> <out.json>   — the oracle's own accuracy against human gold (IAHLTwiki test split)
  annotate  <sample.json> <out.json>    — the content lemma/UPOS of every sampled word in its sentence

Input words are whitespace tokens (pretokenized); Stanza expands prefixes itself (MWT). A token's «content word» is
its first expanded word with a lexical UPOS (NOUN/VERB/ADJ/PROPN/ADV/NUM/AUX/PRON-as-head), else its last word —
the same rule for gold and for the oracle, so the comparison is like for like.
"""
import json
import sys
import unicodedata

LEXICAL = ("NOUN", "VERB", "ADJ", "PROPN", "ADV", "NUM", "AUX")
NIQQUD = {chr(c) for c in range(0x0591, 0x05C8)} - {"\u05be", "\u05c0", "\u05c3", "\u05c6"}


def skel(s):
    s = unicodedata.normalize("NFC", s or "")
    return "".join(ch for ch in s if ch not in NIQQUD)


def content(words):
    """words: list of (form, lemma, upos) of ONE surface token → (lemma, upos)"""
    for form, lemma, upos in words:
        if upos in LEXICAL:
            return lemma, upos
    return (words[-1][1], words[-1][2]) if words else ("", "")


def pipeline():
    import stanza
    return stanza.Pipeline("he", dir="E:/tmp-lp/oracle/stanza", processors="tokenize,mwt,pos,lemma",
                           use_gpu=False, verbose=False)


def read_conllu(path):
    sents, cur, mwt = [], [], None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line:
            if cur:
                sents.append(cur)
            cur, mwt = [], None
            continue
        if line.startswith("#"):
            continue
        cols = line.split("\t")
        tid = cols[0]
        if "." in tid:
            continue
        if "-" in tid:
            a, b = map(int, tid.split("-"))
            mwt = {"form": cols[1], "end": b, "words": []}
            cur.append(mwt)
            continue
        w = (cols[1], cols[2], cols[3])
        if mwt and int(tid) <= mwt["end"]:
            mwt["words"].append(w)
            if int(tid) == mwt["end"]:
                mwt = None
        else:
            cur.append({"form": cols[1], "words": [w]})
    if cur:
        sents.append(cur)
    return sents


def annotate_tokens(nlp, token_lists):
    """Raw text (tokens joined by spaces) through the full pipeline (pretokenized input skips MWT — prefixes would stay
    glued); Stanza's tokens are mapped back to each whitespace token by character span."""
    texts, spans = [], []
    for toks in token_lists:
        pos, sp = 0, []
        for t in toks:
            sp.append((pos, pos + len(t)))
            pos += len(t) + 1
        texts.append(" ".join(toks))
        spans.append(sp)
    from stanza import Document
    docs = nlp.bulk_process([Document([], text=t) for t in texts])
    out = []
    for doc, sp in zip(docs, spans):
        words_at = [[] for _ in sp]
        for sent in doc.sentences:
            for tok in sent.tokens:
                for i, (a, b) in enumerate(sp):
                    if tok.start_char < b and tok.end_char > a:
                        words_at[i].extend((w.text, w.lemma or "", w.upos or "") for w in tok.words)
                        break
        out.append([content([w for w in ws if w[2] != "PUNCT"] or ws) for ws in words_at])
    return out


def calibrate(test_path, out_path):
    gold = read_conllu(test_path)
    nlp = pipeline()
    pred = annotate_tokens(nlp, [[t["form"] for t in s] for s in gold])
    n = lem = pos = 0
    by_upos = {}
    for gs, ps in zip(gold, pred):
        for gt, (pl, pu) in zip(gs, ps):
            gl, gu = content(gt["words"])
            if gu not in LEXICAL:
                continue
            n += 1
            ok_l = skel(pl) == skel(gl)
            lem += ok_l
            pos += pu == gu
            b = by_upos.setdefault(gu, [0, 0])
            b[0] += 1
            b[1] += ok_l
    res = {"tokens": n, "lemma_acc": lem / n, "upos_acc": pos / n,
           "lemma_acc_by_upos": {k: {"n": v[0], "acc": v[1] / v[0]} for k, v in sorted(by_upos.items())}}
    json.dump(res, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False))


def annotate(sample_path, out_path):
    items = json.load(open(sample_path, encoding="utf-8"))
    if isinstance(items, dict):
        items = items["items"]
    nlp = pipeline()
    toks = [it["tokens"] for it in items]
    pred = annotate_tokens(nlp, toks)
    out = []
    for it, ps in zip(items, pred):
        i = it["index"]
        lemma, upos = ps[i] if i < len(ps) else ("", "")
        out.append({"id": it["id"], "stanza_lemma": lemma, "stanza_upos": upos})
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(out), "annotated")


if __name__ == "__main__":
    {"calibrate": calibrate, "annotate": annotate}[sys.argv[1]](*sys.argv[2:])
