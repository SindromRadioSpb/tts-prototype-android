# RAW: Агент F — аудит HF-организации HebArabNlpProject (2026-08-04, follow-up по вопросу владельца)

> Необработанный выход research-агента. Не редактировать. Синтез — в ../REPORT.md (аддендум §8).

# HebArabNlpProject (Hugging Face) — audit for LinguistPro

## 1. Org identity — VERIFIED

**HebArabNlpProject = the Israel National NLP Program (NNLP-IL)**, run by **MAFAT / DDR&D** (Directorate of Defense Research & Development, Israeli MoD) in partnership with **IAHLT** (Israeli Association of Human Language Technologies). Evidence, all first-party:

- Org display name on https://huggingface.co/HebArabNlpProject is "Israel National NLP Program".
- HebCo dataset card states verbatim: "Coreference Project by DDRND (Mafat) as part of the Israeli national NLP program (see our GitHub at https://nnlp-il.mafat.ai/#Our-Github) and the Israeli Association of Human Language Technologies (https://www.iahlt.org)".
- The Semantic-Retrieval cards: "Hebrew Semantic Retrieval Challenge by MAFAT DDR&D … in partnership with the Israel National NLP Program".
- Hebatron card: "collaboration between PwC Israel and MAFAT and AWS"; MAFAT lead Tal Geva; research collaborator **Shaltiel Shmidman (Dicta)** — who is also among the org's 20 HF members (alongside noamor = Noam Ordan/IAHLT, TalGeva). So the org is institutionally adjacent to Dicta, whose models LinguistPro already uses.
- Related GitHub: https://github.com/NNLP-IL and https://github.com/HebArabNlpProject/heb_leaderboard.

This is the same national program that produced HeQ (already in your dictabert-heq lineage) and the IAHLT NER/UD data underlying the dictabert family. So the org is upstream-adjacent to your current stack, not a random collection.

## 2. Inventory — models (11)

| Model | What it is | Task | License | Last mod | DLs | Evals in card? |
|---|---|---|---|---|---|---|
| [Hebatron](https://huggingface.co/HebArabNlpProject/Hebatron) | 31.6B Mamba2+MoE Hebrew LLM (Nemotron-3-Nano-30B base; PwC+MAFAT+AWS), 64k ctx, ~3B active params | text-generation | apache-2.0 | 2026-06-10 | 2,046 | **Yes**: Heb reasoning avg 73.8%, GSM8K-heb 83.3%, SNLI 91.2%; AlephBench 77.1 |
| [Hebatron_base](https://huggingface.co/HebArabNlpProject/Hebatron_base) | Base (pre-SFT) Hebatron | text-generation | apache-2.0 | 2026-05-13 | 152 | Same card numbers |
| [Hebatron_base_long](https://huggingface.co/HebArabNlpProject/Hebatron_base_long) | Long-context base variant | text-generation | apache-2.0 | 2026-05-13 | 46 | Same card numbers |
| [shoshan](https://huggingface.co/HebArabNlpProject/shoshan) | Hebrew **lemmatizer**: DictaBERT backbone, retrieves lemma from fixed 117.6k bank + bounded edit-script transduction — "cannot emit a free-form string". Trained on IAHLT UD (Knesset+Wiki) | token-classification | **MIT** (encoder subject to DictaBERT license) | 2026-07-23 | 66 | **Yes**: 92.4% OOD / 94.3% in-domain lemma acc; B³ 0.965/0.953 vs DictaBERT-lex 0.906/0.932; 0.0% vs 12.3% low-overlap errors on unseen words |
| [Semantic-Retrieval-1st-place](https://huggingface.co/HebArabNlpProject/Semantic-Retrieval-1st-place) | Winning system of MAFAT Hebrew Semantic Retrieval Challenge: 6-dense-retriever ensemble (e5-large pseudo-tuned, bge-m3, arctic-l-v2, Solon, Webiks RAGbot) + BM25s + fine-tuned bge-reranker-v2-m3; full weights in repo | sentence-similarity | **other** (no LICENSE file — terms unverified) | 2026-05-10 | 0 | **Yes**: nDCG@20 = 0.6736 private / 0.4562 public |
| [Semantic-Retrieval-2nd-place](https://huggingface.co/HebArabNlpProject/Semantic-Retrieval-2nd-place) | BM25 + dual-E5 WRRF fusion + fine-tuned BGE reranker | sentence-similarity | other (unverified) | 2026-05-10 | 0 | **Yes**: nDCG@20 = 0.6568 private |
| [Semantic-Retrieval-3rd-place](https://huggingface.co/HebArabNlpProject/Semantic-Retrieval-3rd-place) | Clean two-stage: fine-tuned bge-m3 retriever → fine-tuned bge-reranker-v2-m3 | sentence-similarity | other (unverified) | 2026-05-10 | 0 | **Yes**: nDCG@20 = 0.6525 private |
| [WhisperLevantine](https://huggingface.co/HebArabNlpProject/WhisperLevantine) | Whisper-large-v3 fine-tune for **Levantine Arabic** (Israeli dialect), 1,200h; faster-whisper format | ASR (Arabic) | apache-2.0 | 2025-05-25 | 52 | Yes: WER 33% |
| [mt-ar-he](https://huggingface.co/HebArabNlpProject/mt-ar-he) | Marian (opus-mt-ar-he) fine-tune, colloquial Israeli Arabic→Hebrew | translation ar↔he | apache-2.0 | 2024-11-10 | 5 | No |
| [mt-he-ar](https://huggingface.co/HebArabNlpProject/mt-he-ar) | Same, he→ar direction | translation | apache-2.0 | 2024-11-10 | 7 | No |
| [Arab_Summerization](https://huggingface.co/HebArabNlpProject/Arab_Summerization) | AraBART fine-tune, Arabic summarization (461-byte card, truncated) | summarization (Arabic) | cc-by-sa-4.0 | 2025-03-11 | 0 | Claims comparison vs AraBART but table is empty in card |

## 3. Inventory — datasets (17)

| Dataset | What it is | License | Last mod | DLs | Evals cited? |
|---|---|---|---|---|---|
| [AlephBench](https://huggingface.co/datasets/HebArabNlpProject/AlephBench) | Reproducible **Hebrew LLM benchmark**: 11 tasks / 11,432 prompts (MMLU-heb, ARC, HellaSwag, GSM8K, COPA, HeQ-QA, HebNLI, Winograd, Sentiment, Israeli trivia, EN→HE COMET), frozen prompts + per-row outputs + leaderboard | cc-by-4.0 | 2026-06-10 | 33 | **Yes** — leaderboard: gemini-2.5-flash 88.8 > gemma-4-31b 88.1 > DictaLM-3.0-24B-Thinking 85.2 > gpt-oss-120b 84.2 > Hebatron 77.1 |
| [shoshan-data](https://huggingface.co/datasets/HebArabNlpProject/shoshan-data) | Hebrew lemmatization gold: 191k train + OOD benchmarks (Bagatz/GeekTime/Dicta, 100 sent/domain) + OOV tail | cc-by-4.0 | 2026-06-18 | 86 | (is itself the eval) |
| [asmachta](https://huggingface.co/datasets/HebArabNlpProject/asmachta) | 131 Hebrew **attributed-QA** records; every claim carries char-exact span in source; 1/3 deliberately unanswerable; `score.py` grader with **string-equality, no judge model** | MIT | 2026-07-29 | 33 | n/a (eval asset) |
| [abstractive-qa-llm-eval](https://huggingface.co/datasets/HebArabNlpProject/abstractive-qa-llm-eval) | 132 Hebrew grounded-QA records, claims backed by exact quoted spans; predecessor/sibling of asmachta | cc-by-sa-4.0 | 2026-07-19 | 54 | annotator-agreement stats in card |
| [HebSummaries](https://huggingface.co/datasets/HebArabNlpProject/HebSummaries) | 5,368 human/hybrid Hebrew summaries of 5,076 articles (IAHLT; gold+silver, IAA scores) | **unstated** in metadata | 2025-04-20 | 161 | IAA reported |
| [Hebrew-Paraphrase-Dataset](https://huggingface.co/datasets/HebArabNlpProject/Hebrew-Paraphrase-Dataset) | 9,785 Hebrew paraphrase pairs (LLM-generated, filtered; 300 human-validated gold) | cc-by-sa-4.0 | 2025-03-20 | 14 | No |
| [HebNLI](https://huggingface.co/datasets/HebArabNlpProject/HebNLI) | Hebrew NLI 3-class (card oddly says `private: true` but repo is listed publicly) | other | 2026-04-18 | 129 | No |
| [HebrewSentiment](https://huggingface.co/datasets/HebArabNlpProject/HebrewSentiment) | Hebrew sentiment 3-class, 10-100k | other | 2026-04-18 | 82 | No |
| [LCHAIM](https://huggingface.co/datasets/HebArabNlpProject/LCHAIM) | Long-context Hebrew NLI (8,325 pairs, translated ConTRoL; ACL 2025 Findings paper) | MIT | 2025-10-06 | 29 | **Yes**: best LLM 60.12% vs human +35pt gap |
| [HebCo](https://huggingface.co/datasets/HebArabNlpProject/HebCo) | Hebrew (+some Arabic) coreference corpus, 9,610 heb paragraphs, morpheme-level mentions | cc-by-4.0 | 2024-06-06 | 20 | IAA study included |
| [ShamNER](https://huggingface.co/datasets/HebArabNlpProject/ShamNER) | Levantine **Arabic** spoken NER corpus v1.1 | cc-by-4.0 | 2025-07-11 | 226 | — |
| [arabic-iahlt-NER](https://huggingface.co/datasets/HebArabNlpProject/arabic-iahlt-NER) | IAHLT NER, **Arabic subset** | cc-by-4.0 | 2025-04-01 | 66 | — |
| [ArQ](https://huggingface.co/datasets/HebArabNlpProject/ArQ) | **Arabic** QA (32,625 triplets, HeQ methodology) | unstated | 2025-04-01 | 7 | — |
| [ASAS](https://huggingface.co/datasets/HebArabNlpProject/ASAS) | **Arabic** summarization w/ annotated support | apache-2.0 | 2025-10-14 | 44 | — |
| [Arab_Summerization_Ds](https://huggingface.co/datasets/HebArabNlpProject/Arab_Summerization_Ds) | **Arabic** summarization training data | cc-by-sa-4.0 | 2025-03-11 | 6 | — |
| [ArabCoRef](https://huggingface.co/datasets/HebArabNlpProject/ArabCoRef) | **Arabic** coreference | cc-by-4.0 | 2025-04-01 | 29 | — |
| [ArabicSentimentDataSet](https://huggingface.co/datasets/HebArabNlpProject/ArabicSentimentDataSet) | **Arabic** sentiment | cc-by-4.0 | 2025-04-15 | 63 | — |

**Collections (3):** [Hebrew Semantic Retrieval Competition Winners](https://huggingface.co/collections/HebArabNlpProject/hebrew-semantic-retrieval-competition-winners-69fc7fc8b621155593852e18) (the 3 models above) · "Hebrew<>levantine Arabic translation" (empty item list) · "HebNLI" (empty item list).

## 4. Fit verdicts vs LinguistPro stack

**(a) BEATS-OR-COMPLEMENTS current picks**

- **shoshan** — the standout. Complements (likely beats for lemmatization specifically) the dictabert family you already run. Your lemma canon (`lemma-canon.js` keying of review_log) and Pealim surface→paradigm mapping depend on Dicta-derived lemmas; shoshan's published head-to-head shows DictaBERT-lex hallucinating single-token lemmas on unseen words (12.3% low-overlap errors) while shoshan is structurally incapable of it (retrieval from a real lemma bank + bounded edits ⇒ 0.0%). That "cannot emit an invented form" property is exactly your R1/R11 invariant, machine-enforced. MIT code, DictaBERT-backbone encoder (runs fine on your sidecar, likely CPU-viable like menaked). Caveat: 92.4% OOD accuracy is on Knesset/Wiki-adjacent registers — Ben-Yehuda literary Hebrew is further out of domain; run your own R10 audit first (shoshan-data OOD gives you the harness pattern). Verdict: candidate for sidecar lemmatizer and/or independent oracle to audit your existing lemma-canon keyer.
- **AlephBench** — complements the Gemini BYOK cloud pick with independent, reproducible evidence: gemini-2.5-flash is #1 on Hebrew (88.8) over DictaLM-3.0-24B (85.2) and gpt-oss-120b. Frozen prompts + per-row outputs + scoring code (github.com/HebArabNlpProject/heb_leaderboard) make it a ready-made harness whenever you re-evaluate the cloud model or a local LLM. cc-by-4.0.

**(b) USEFUL for planned directions**

- **Semantic-Retrieval-1st/2nd/3rd place** → *semantic search direction*. The real value is the measured recipe, not the weights: 3rd place's clean fine-tuned bge-m3 → bge-reranker-v2-m3 two-stage scores 0.6525 vs 0.6736 for the 1st-place 6-model ensemble — i.e., a single-model pipeline gets 97% of the ensemble at a fraction of the VRAM (relevant for the 8GB 3070). Corpus was Wikipedia + Kol-Zchut + Knesset — closer to your Studio texts than to Ben-Yehuda. ⚠ License is "other" with **no LICENSE file in-repo** (verified) — treat weights as unusable until clarified; the base models (bge-m3, e5) are openly licensed upstream, so replicate rather than reuse.
- **asmachta + abstractive-qa-llm-eval** → *QA oracle / R17 grader independence*. Hebrew grounded-QA with character-exact attribution checkable by string equality ("no judge model needed") plus deliberately unanswerable items for hallucination-vs-abstention measurement — this is precisely your "deterministic grader first + anti-circularity" doctrine, and MNAR/unanswerable handling matches R17. Small (131+132 records) but ready to use as an acceptance gate for any agent-answers-about-text feature. MIT / cc-by-sa-4.0.
- **shoshan-data** → independent gold for R10 measure-before-code audits of your own morphology/lemma pipeline (cc-by-4.0, OOD splits incl. a Dicta-domain slice).
- **HebSummaries** → *readability/graded-reading*: 5.4k human-validated Hebrew summaries usable as reference data for evaluating Gemini-generated summaries/simplifications of Studio texts. ⚠ License unstated in metadata (IAHLT provenance; verify before redistribution).
- **Hebrew-Paraphrase-Dataset** → weak-useful for *readability/simplification* experiments (paraphrase ≈ register rewriting); mostly LLM-generated with only 300 gold, so eval-only.
- **LCHAIM / HebNLI** → marginal: NLI could back an entailment-based grounding check for the QA oracle, but LCHAIM's own numbers (best model 60%) say Hebrew long-context NLI models aren't reliable enough to be an oracle yet. HebNLI license "other" + `private: true` frontmatter oddity.

**(c) NOT USEFUL**

- **Hebatron (all 3 variants)** — 31.6B total params cannot fit the RTX 3070 8GB, and on the org's own AlephBench it loses to your existing cloud pick (77.1 vs 88.8 for gemini-2.5-flash); noteworthy as the first apache-2.0 Hebrew MoE, irrelevant operationally. (arxiv link 2605.11255 in card — unverified.)
- **WhisperLevantine** — Arabic ASR, wrong language; no challenge to ivrit-ai/whisper-large-v3-turbo-ct2 and no Hebrew wav2vec2 here for the aligner.
- **mt-ar-he / mt-he-ar** — Hebrew↔Levantine Arabic only; nothing covering Russian, no eval numbers, dormant since 2024-11.
- **Arab_Summerization (model) + all 7 Arabic datasets** (ArQ, ArabCoRef, arabic-iahlt-NER, ShamNER, ASAS, Arab_Summerization_Ds, ArabicSentimentDataSet) — wrong language for a Hebrew↔Russian product.
- **HebCo / HebrewSentiment** — no planned coreference or sentiment feature; keep HebCo in mind only if anaphora-aware reading aids ever get planned.

**Special-attention answers:** no Hebrew wav2vec2/ASR here (ASR pick unchanged; aligner backbone unchanged) · no Hebrew NER models/datasets in this org (Arabic only — Hebrew NER stays with dictabert-ner) · embeddings: no new Hebrew-native embedder, but competition evidence crowns fine-tuned bge-m3 for Hebrew retrieval · nothing he↔ru or Russian-covering (madlad400 / OPUS-MT heb-sla decision untouched) · eval-bearing items: Hebatron, shoshan, all 3 retrieval solutions, AlephBench, LCHAIM, WhisperLevantine.

## 5. Bottom line

**Yes — two picks are affected, three planned directions gain assets; core ASR/nikud/MT picks unchanged.**

1. **shoshan** (MIT, 2026-07, actively maintained) is a credible upgrade/independent-oracle for the Dicta-based lemmatization layer — its no-hallucination-by-construction design matches R1/R11, and it publishes a head-to-head win over DictaBERT-lex on OOD consistency. Action-worthy: R10 audit on Ben-Yehuda-register text before adoption.
2. **Semantic search direction** now has a measured Hebrew recipe: fine-tuned bge-m3 two-stage ≈ ensemble quality (0.6525 vs 0.6736 nDCG@20) — replicate the recipe; don't reuse the license-unclear weights.
3. **AlephBench** independently validates Gemini-flash as the top Hebrew cloud model and provides a reusable eval harness; **asmachta/abstractive-qa-llm-eval** are turnkey deterministic grounding graders for the QA-oracle/R17 direction; **HebSummaries/paraphrase data** back the readability direction as eval sets.

Everything else (Hebatron, all Arabic assets, he↔ar MT, WhisperLevantine) is not applicable to a Hebrew↔Russian learning product on an 8GB GPU.
