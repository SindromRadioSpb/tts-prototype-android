# RAW: Агент D — возможности для существующих поверхностей (2026-08-04)

> Необработанный выход research-агента. Не редактировать. Синтез — в ../REPORT.md.

# NNLP-IL Hebrew Resources Scan — Integration Opportunities for LinguistPro

**Catalogs scanned:** [NNLP-IL/Hebrew-Resources](https://github.com/NNLP-IL/Hebrew-Resources) (corpora_and_data_resources.rst, models_tools_services.rst, additional_resources.rst) · [resources.nnlp-il.mafat.ai](https://resources.nnlp-il.mafat.ai/?language=hebrew) (~100 entries rendered) · plus HF orgs [dicta-il](https://huggingface.co/dicta-il), [ivrit-ai](https://huggingface.co/ivrit-ai), [IAHLT products](https://www.iahlt.org/products).
**Excluded per task:** MT/nikud *models*, Shironet.
**Score legend:** УЦ = учебная ценность · Ц = целесообразность · П = приоритетность · А = актуальность (1–5).

## TOP opportunities

### 1. UD Hebrew IAHLT treebanks — independent gold oracle for tap-morphology audit
- **Resource:** [UD_Hebrew-IAHLTwiki](https://github.com/UniversalDependencies/UD_Hebrew-IAHLTwiki) (5,000 sentences, CC BY-SA 4.0) + [UD_Hebrew-IAHLTknesset](https://github.com/IAHLT/UD_Hebrew-IAHLTKnesset) (CC BY 4.0, includes NER layer); complement: [UD_Hebrew-HTB](https://github.com/UniversalDependencies/UD_Hebrew) (CC BY-NC-SA 4.0, literary/news register).
- **Serves:** `smoke:reader-morph:audit` (Зал). Current oracle is Dicta-silver — but Tier-3 *is* Dicta, violating the project's own oracle-independence rule (R11). Human-annotated CoNLL-U (segmentation, lemma, POS, features) is a truly independent gold for precision-"exact" measurement of the tap-resolver, incl. proclitic segmentation cases like כזאת→זאת.
- **Enables:** a second, human-gold audit harness alongside the Dicta-silver one; per-feature error breakdown (binyan/POS/segmentation); regression gate for resolver changes.
- **УЦ/Ц/П/А: 3/5/5/5** (indirect learner value, trivially parseable format, actively maintained by IAHLT 2022–2025).

### 2. Hebrew Language Corpus of the Academy (data.gov.il) — large-scale morph gold + curated frequencies
- **Resource:** [data.gov.il/dataset/corpus](https://data.gov.il/dataset/corpus) — national corpus project (Israel National Digital Agency + Academy of the Hebrew Language), morphologically tagged, contemporary + historical registers. License: listed "Open" in catalog; GOV.il portion reported CC BY-SA 3.0 — **verify per-subcorpus before use**.
- **Serves:** (a) scale-out of morphology audits beyond 5K treebank sentences; (b) lemma-level frequency computation from a *curated* (not web-crawl) corpus for SRS word-priority.
- **Enables:** frequency-band provenance chips per word; stratified audit sampling by register (Academy tagging conventions differ from UD — needs a mapping layer).
- **УЦ/Ц/П/А: 4/3/4/4** (format/size friction; the only Academy-grade tagged corpus openly published).

### 3. Dicta `hebrew_suffix_verbal_forms` + OtoBERT — suffixed-verb honesty for literary Hebrew
- **Resource:** [dicta-il/hebrew_suffix_verbal_forms](https://huggingface.co/datasets/dicta-il/hebrew_suffix_verbal_forms) (2,853 sentences from literature/newspapers, CC BY 4.0; binary With_Suffix/No_Suffix with offsets) + [OtoBERT](https://huggingface.co/dicta-il/otobert) (CC BY 4.0).
- **Serves:** Зал tap-morphology. Ben-Yehuda literary texts are dense with pronominal-suffixed verbs (ראיתיו = ראיתי אותו) — a known homograph trap where the honest resolver must demote or explain.
- **Enables:** a dedicated audit slice: does the tap card handle suffixed forms honestly (exact vs "вероятно" vs search-link)? Optionally a card feature "form = verb + object suffix → expansion" grounded in this gold; distribution matches our corpus register exactly.
- **УЦ/Ц/П/А: 5/5/4/4** (direct learner payoff on the actual corpus; small, clean dataset).

### 4. NEMO NER + DictaBERT-ner + gazetteers — "this is a name" cards in the Reading Room
- **Resource:** [NEMO-Corpus](https://github.com/OnlpLab/NEMO-Corpus) (6,143 sentences, 9 OntoNotes-style entity types, morpheme-level; CC BY 4.0 per NNLP-IL catalog — repo itself lacks a LICENSE file, verify) · [dicta-il/dictabert-ner](https://huggingface.co/dicta-il/dictabert-ner) (CC BY 4.0) · gazetteers: [KIMA historical Hebrew place gazetteer](http://data.geo-kima.org/) (CC BY 4.0), [Hebrew name lists](https://github.com/NLPH/NLPH_Resources/tree/master/linguistic_resources/word_lists/dday) (CC BY 4.0), [ParaNames](https://github.com/bltlab/paranames) (MIT, Wikidata-derived).
- **Serves:** Зал. Readers tap person/place names constantly; the resolver should say "имя собственное (person/place)" instead of hallucinating a root/binyan — a natural extension of the honesty invariant.
- **Enables:** bake-time NER pass over baked works (fits the existing prebake pattern — no runtime model needed); KIMA covers exactly the historical toponyms of 19th–20th c. literature; NEMO as the audit gold for the NER pass.
- **УЦ/Ц/П/А: 5/4/4/4**.

### 5. Frequency lists — SRS word-priority + graded-reading bands
- **Resource:** OpenSubtitles-based [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) Hebrew list (MIT — verify file headers) · CC-100-derived lists with counts in [eyaler/hebrew_wordlists](https://github.com/eyaler/hebrew_wordlists) (**AGPL-3.0 — do not bundle into the shipped app; audit-side only**) · [rspeer/wordfreq](https://github.com/rspeer/wordfreq) (MIT code; archived 2024) · HUJI [Word-Frequency Database for Printed Hebrew](http://word-freq.huji.ac.il/index.html) (license unstated, **site currently broken**).
- **Serves:** Retention/SRS + Зал graded reading. External modern-conversational frequencies complement an internal frequency table computable from the 26K-work corpus (literary register): the *divergence* between the two is itself the signal ("common in literature, rare today" — an honest provenance-worthy label).
- **Enables:** due-ring prioritization by frequency band; scaffolded-niqqud fade scheduling by band; "rare word" chips; word-priority in serve-unsourced ladder.
- **УЦ/Ц/П/А: 5/5/5/3** (lists are static snapshots; lemmatization needed — surface-form lists undercount Hebrew lemmas; there is no open SUBTLEX-IL).

### 6. ivrit.ai eval sets + HebDB — grounding the Studio ASR gates in gold audio
- **Resource:** [ivrit-ai/eval-whatsapp](https://huggingface.co/datasets/ivrit-ai/eval-whatsapp) (70.8 min gold, [ivrit.ai license](https://www.ivrit.ai/en/the-license/) — broad research+commercial use) and other ivrit-ai eval/transcript sets ([audio-v2](https://huggingface.co/datasets/ivrit-ai/audio-v2) CC BY 4.0, [knesset-plenums](https://huggingface.co/datasets/ivrit-ai/knesset-plenums) custom terms) · [HebDB](https://pages.cs.huji.ac.il/adiyoss-lab/HebDB/) (~1,690h podcasts/testimonies, weakly supervised, CC BY 4.0 per catalog).
- **Serves:** Studio S12 long-media ingest gates. `ingest-slice-live-smoke` currently needs owner-supplied mp3+subs; ivrit.ai eval sets give *standing, redistribution-safe* audio+gold-transcript pairs for the coverage/clock-compression/duplicate-shingle gates and for WER tracking of the Gemini-chunk pipeline against a fixed reference (the exact independent-signal medicine after the S12.5–S12.7 fake-timestamp incidents).
- **Enables:** a repeatable `smoke:ingest-asr-gold` gate with WER + timing-drift stats vs known transcripts; comparison baseline: their whisper-large-v3 CT2 models.
- **УЦ/Ц/П/А: 3/5/5/5** (indirect learner value, very active project, drops straight into existing gate infra).

### 7. HeQ — gold for grading reading-comprehension agent features
- **Resource:** [HeQ](https://github.com/NNLP-IL/Hebrew-Question-Answering-Dataset) — 30,147 SQuAD-style Hebrew questions with span answers, CC BY 4.0; smaller predecessor [ParaShoot](https://github.com/omrikeren/ParaShoot) (license unstated).
- **Serves:** AI mentor / premium agents (R17: кто учит — не сертифицирует). When the agent generates comprehension questions over read texts, HeQ is a gold reference to (a) calibrate the deterministic grader on span-answer equivalence in Hebrew (nikud/segmentation-insensitive matching), (b) benchmark question-generation quality against human-authored Q/A, (c) test the D1 grading channel without circular self-grading.
- **Enables:** an offline gate "grader agrees with HeQ gold ≥ X%" before any comprehension-quiz feature ships.
- **УЦ/Ц/П/А: 4/4/4/5**.

### 8. HebNLI — entailment as an independent validation signal
- **Resource:** [HebNLI](https://github.com/NNLP-IL/HebNLI) (CC BY 4.0, MNLI translated/adapted); related: [Hebrew Paraphrase Dataset](https://github.com/NNLP-IL/Hebrew-Paraphrase-Dataset) (CC BY 4.0).
- **Serves:** quiz engine + agent grading. Entailment is the natural independent oracle for: distractors (a wrong MC option must NOT be entailed by the passage), cloze acceptability, and "agent claim is supported by the text" checks — an oracle that is not the generator (R11/R17).
- **Enables:** train/eval a small NLI head (e.g., over DictaBERT) gated on HebNLI; paraphrase set doubles as accept-alternative-answer gold for translations.
- **УЦ/Ц/П/А: 3/3/3/4** (needs a model in the loop; medium effort).

### 9. Nikud gold sets — QA gates for niqqud display and scaffolded fade
- **Resource:** [Nakdimon test sets](https://github.com/elazarg/nakdimon) (`tests/new`, `tests/dicta` — diverse modern sources; repo has LICENSE, MIT per repo — verify) · [Eran Tomer's Digital Vocalized Text Corpus](https://github.com/NNLP-IL/Hebrew-Resources) (Apache 2.0, via catalog Dropbox link) · Ben-Yehuda public-domain diacritized dumps (already in-house).
- **Serves:** Зал (scaffolded niqqud fade; ktiv male↔haser mapping correctness) and any future in-house nikud verification — gold sets are in scope even though nikud *models* are covered elsewhere.
- **Enables:** a `smoke:niqqud-gold` gate: for words where we display niqqud (from Pealim paradigms or baked texts), cross-check against independent vocalized gold; measure the niqqud coverage gap that previously caused tap-mismatch (BRR_P1_009: "DATA not algorithm").
- **УЦ/Ц/П/А: 4/4/3/4**.

### 10. fastText Hebrew + Hebrew SimLex-999 — offline semantic layer for quizzes and search
- **Resource:** [fastText cc.he.300 vectors](https://github.com/facebookresearch/fastText/blob/master/docs/pretrained-vectors.md) (CC BY-SA 3.0) · gate: Hebrew [SimLex-999 translation](https://github.com/NNLP-IL/Hebrew-Resources/blob/master/additional_resources.rst) (Leviant & Reichart; license unstated, Google Drive hosting).
- **Serves:** quiz engine (semantic distractors: near-but-wrong foils instead of random words), Зал similar-word suggestions («слова той же семьи/поля»), corpus search recall.
- **Enables:** prune vectors to product vocabulary (~50–100K forms), quantize to a few MB, ship OPFS-side like the Pealim dict — fully offline, fits offline-first (R5); SimLex-999 as the measure-before-code gate for distractor quality (similarity≠relatedness matters exactly for distractors).
- **УЦ/Ц/П/А: 4/5/4/3** (fastText is old but stable; subword handling suits Hebrew surface forms).

### 11. NeoDictaBERT-bilingual-embed — semantic retrieval across the 26K-work corpus (GPU sidecar)
- **Resource:** [dicta-il/neodictabert-bilingual-embed](https://huggingface.co/dicta-il/neodictabert-bilingual-embed) (0.4B, 768-d, Hebrew+English, CC BY 4.0, sentence-transformers).
- **Serves:** Зал «Корпус» discovery + Studio. Fits the local-GPU-processing roadmap (L0–L6): embed all baked works once (bake-time job), serve ANN search — "find passages about jealousy", theme-based reading recommendations, semantic dedupe of imported texts, RAG grounding for the mentor over the user's own read texts.
- **Enables:** corpus-wide semantic search where the current FTS inverted index is lexical-only; bilingual model allows English-query→Hebrew-passage (Russian queries would need translation hop — honest limitation).
- **УЦ/Ц/П/А: 4/3/3/5** (needs sidecar/offline batch; model is current, Feb 2026 update).

### 12. Hebrew WordNet — synonym/hypernym gloss enrichment (with caveats)
- **Resource:** [Hebrew WordNet (MILA)](http://www.mila.cs.technion.ac.il/resources_lexicons_wordnet.html) — MultiWordNet-aligned (EN/IT/ES), GPLv3 per catalog / free for research per Haifa terms; **MILA site is intermittently unreachable; data circa 2007**.
- **Serves:** ②-notes meaning field + quiz distractors: synonym sets and hypernyms give "same semantic field" foils and richer glosses with provenance (derived≠asserted: WordNet-derived sense labels marked as such, R9).
- **Enables:** cross-lingual pivot to Russian via aligned English synsets (honest "via-EN" provenance).
- **УЦ/Ц/П/А: 4/3/3/2** (coverage of modern colloquial lexicon is thin; mirror availability must be found first; embeddings partly substitute).

### 13. HUJI Corpus of Spoken Hebrew — authentic conversational listening packs
- **Resource:** [HUJI Corpus of Spoken Hebrew](https://huji-corpus.com/) (CC BY 4.0 per both catalogs; **site DNS failed at scan time — currency risk**); alternatives: [CoSIH](http://cosih.com/table-3.html) (license unstated), HebDB podcast subset (CC BY 4.0).
- **Serves:** Studio S4/S12 as *content*: pre-cleared authentic spontaneous-conversation audio with transcripts → import → bilingual table + segment karaoke = ready-made colloquial listening modules, the register Ben-Yehuda literary corpus lacks entirely (R2: употребление>форм).
- **Enables:** curated "разговорный иврит" packs without rights negotiation; transcripts remove ASR cost/risk for these items.
- **УЦ/Ц/П/А: 5/3/3/2**.

### 14. AlephBERTGimel — permissively-licensed encoder fallback
- **Resource:** [AlephBERTGimel](https://github.com/Dicta-Israel-Center-for-Text-Analysis/alephbertgimmel) (CC0 1.0 per catalog; large-vocab Hebrew BERT, ONLP+Dicta).
- **Serves:** any in-house fine-tune (NLI head of #8, NER of #4, readability classifier) where CC0 removes every attribution/share-alike question; note the prior DictaBERT-ONNX NO-GO applies to *in-browser* use — sidecar/bake-time use is unaffected.
- **УЦ/Ц/П/А: 2/4/2/3**.

## Explicitly considered and deprioritized

- **HeSum / MevakerSumm** ([HeSum](https://github.com/OnlpLab/HeSum) license unstated; [MevakerSumm](https://huggingface.co/datasets/HeTree/MevakerSumm) Apache 2.0) — grades *model* summarization; no near-term LinguistPro feature emits Hebrew summaries that need certification.
- **Sefaria export** ([Sefaria-Export](https://github.com/Sefaria/Sefaria-Export/), per-text licenses) — biblical/rabbinic register duplicates neither Studio nor the modern-learner path; Ben-Yehuda already covers the reading moat.
- **hspell + eyaler/hebrew_wordlists as shipped data** ([hspell](http://hspell.ivrix.org.il/) AGPL-3.0, [wordlists](https://github.com/eyaler/hebrew_wordlists) AGPL-3.0) — useful for typo-tolerant answer grading, but AGPL bundled into the PWA creates license contamination; confine to server/audit side if ever used; dictionary frozen since 2017.
- **Sentiment/emotion datasets** (HeBERT emotion UGC, HebrewSentiment etc.) — no product surface consumes sentiment.
- **Robo-Shaul / HebTTS local TTS** ([HebTTS](https://pages.cs.huji.ac.il/adiyoss-lab/HebTTS/) Apache 2.0) — quality below Google Cloud TTS for learner-grade audio; revisit only if BYOK-TTS cost becomes a blocker in the GPU-sidecar phase.
- **CHILDES Hebrew** ([TalkBank](https://childes.talkbank.org/access/Other/)) — acquisition-order data is a tempting difficulty proxy but format/licensing friction is high and frequency bands (#5) deliver 90% of the value.
- **MILA corpora/analyzers** (GPLv3) — historically important, but tooling superseded by Dicta/UD and the site is intermittently down; keep only WordNet (#12) on the radar.
- **Annotation tools section** (doccano, WebAnno, brat…) — generic tooling; the project's bespoke audit harnesses already fill this role.
- **Hebrew CEFR vocabulary lists — negative finding:** no open CEFR-aligned Hebrew vocab dataset exists in either catalog or adjacent searches (ulpan א–ו lists are not published as open data); graded difficulty must be built from frequency + morphology + corpus-internal statistics, which strengthens the case for #2/#5.
