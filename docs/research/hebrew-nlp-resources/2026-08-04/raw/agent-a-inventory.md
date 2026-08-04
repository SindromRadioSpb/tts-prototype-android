# RAW: Агент A — инвентарь каталогов NNLP-IL (2026-08-04)

> Необработанный выход research-агента. Не редактировать. Синтез — в ../REPORT.md.

# Hebrew NLP Resource Catalogs — Structured Inventory

**Sources (both fully fetched):**
- GitHub catalog: `https://github.com/NNLP-IL/Hebrew-Resources` (default branch `master`; content is in **.rst files, not README.md** — `README.rst`, `corpora_and_data_resources.rst`, `models_tools_services.rst`, `additional_resources.rst`, `Industry.rst`). Raw URLs: `https://raw.githubusercontent.com/NNLP-IL/Hebrew-Resources/master/<file>.rst`
- Web catalog: `https://resources.nnlp-il.mafat.ai/?language=hebrew` — **not a JS shell**: a server-rendered Webflow CMS page; all 200 resource cards (162 Hebrew-tagged, rest Arabic/untagged) extracted from page 1 + `?dc6e3d3b_page=2`. Per-card metadata: category, description, language, license, task, link. The web catalog ⊇ GitHub list, plus a few web-only items (marked below).

Legend: ★ = plausibly relevant to a Hebrew-LEARNING product. License is copied verbatim from source; `{?}`/"Unknown" → **unstated**.

---

## 1. Corpora — unannotated / literary / song ★-rich

| ★ | Name | What it is | License (as stated) | Link |
|---|------|-----------|---------------------|------|
| ★ | Project Ben Yehuda Public Dumps | Dumps of thousands of PD Hebrew works, plaintext **with and without nikud** + HTML (LinguistPro's Reading Room source) | Public Domain | https://github.com/projectbenyehuda/public_domain_dump |
| ★ | Sefaria Export | 3,000 years of structured Jewish texts, Hebrew + English translation | Each text licensed separately | https://github.com/Sefaria/Sefaria-Export/ |
| ★ | Hebrew Songs Lyrics | ~15,000 Israeli songs scraped from Shironet, 167 singers, Hebrew-only chars | CC BY-SA 4.0 | https://www.kaggle.com/datasets/guybarash/hebrew-songs-lyrics |
| ★ | 1001 Israeli Pop Songs Dataset | 1001 Israeli pop songs, manual analyses 1967–2017 | CC BY-NC-ND 4.0 | https://www.kaggle.com/datasets/adamyodfat/1001-israeli-pop-dataset |
| ★ | JPress | National Library historical Jewish newspapers, full-text search (era-graded reading material; non-commercial custom ToU, permission checks required) | Custom Terms of Use | http://www.jpress.org.il |
| ★ | The SVLM Hebrew Wikipedia Corpus | 50K Wikipedia sentences chosen for **phoneme coverage** (built for a sentence-recording/TTS project) | CC-BY-SA 3.0 | https://github.com/NLPH/SVLM-Hebrew-Wikipedia-Corpus |

Low-relevance (grouped): HeDC4 cleaned Common-Crawl {Apache 2.0}, AlephBERT Wikipedia extract {Apache 2.0}, Hebrew Wikipedia/WikiBooks dumps {CC-BY-SA 3.0 / CC0}, Supreme Court of Israel 751K legal docs {OpenRAIL}, Heb-Architecture-Corpus {CC BY 4.0}, IsraParlTweet Knesset+Twitter 294.5M tokens {CC BY 4.0}, Kol-Zchut RAGbot document/paragraph corpora {CC BY-NC-SA 2.5}, ThinkIL Zvi-Yanai archive {CC-BY-SA 3.0}; multilingual: OSCAR {CC BY 4.0}, CC100 {MIT}, Old Newspapers {CC0}, TED Talks transcripts {CC BY-NC 4.0}, ParaNames {MIT}, Help-Seeking-Corpus {Custom ToU}.

## 2. Corpora — annotated (morphology gold data ★-rich)

| ★ | Name | What it is | License | Link |
|---|------|-----------|---------|------|
| ★ | UD Hebrew Treebank | Hebrew Universal Dependencies treebank (morph + syntax gold) | CC BY-NC-SA 4.0 | https://github.com/UniversalDependencies/UD_Hebrew |
| ★ | IAHLT-HTB | Revised/consistency-overhauled fork of UD Hebrew Treebank with manual corrections | CC BY-NC-SA 4.0 | https://github.com/IAHLT/UD_Hebrew |
| ★ | UD Hebrew IAHLTwiki | 5,000 contemporary Wikipedia sentences, full UD annotation, public subset | CC-BY-SA 4.0 | https://github.com/UniversalDependencies/UD_Hebrew-IAHLTwiki |
| ★ | UD Hebrew IAHLTKnesset | UD treebank + named entities over Knesset protocols | CC BY 4.0 | https://github.com/IAHLT/UD_Hebrew-IAHLTKnesset |
| ★ | The Hebrew Treebank (MILA) | 6,500 hand-annotated news sentences, full word segmentation + morpho-syntax (research-only; "temporarily down") | GPLv3 | http://www.mila.cs.technion.ac.il/resources_treebank.html |
| ★ | The Hebrew Language Corpus — Morphological Annotation | Gold morphological tagging by Israel National Digital Agency + **Academy of the Hebrew Language** | "Open" (opendefinition.org) | https://data.gov.il/dataset/corpus |
| ★ | Knesset 2004-2005 | Knesset transcripts, tokenized + morphologically tagged | Public Domain | https://github.com/NLPH/knesset-2004-2005 |
| ★ | The MILA corpora collection | 20 corpora, most with tokenized/morph-analyzed/morph-disambiguated versions (non-commercial; "temporarily down") | GPLv3 | http://www.mila.cs.technion.ac.il/resources_corpora.html |
| ★ | Modern Hebrew Dependency Treebank V.1 | Yoav Goldberg's PhD dependency treebank | GPLv3 | https://www.cs.bgu.ac.il/~yoavg/data/hebdeptb/ |

Low-relevance (grouped): NER — NEMO morpheme/token NER over Hebrew Treebank {CC BY 4.0}, MDTEL medical entities {MIT}, Ben-Mordecai & Elhadad corpus {unstated}; QA — HeQ 30,147 questions {CC BY 4.0}, ParaShoot {unstated}, HebWiki QA machine-translated SQuAD {unstated}, Kol-Zchut QA training set {CC BY 4.0}; sentiment/emotion — Amram et al. {unstated}, HeBERT Emotion UGC {MIT}, Sentiment HebrewDataset 75K sentences {MIT}, NNLP-IL HebrewSentiment {site: CC BY 4.0; GitHub: ?}; misc — Knesset Topic Classification {unstated}, Criminal Sentence Classification {OpenRAIL}, HeGeL geolocation {unstated}, HebNLI {CC BY 4.0}, Hebrew Paraphrase Dataset 9,785 pairs {CC BY 4.0}, HeSum summarization {unstated}, MevakerSumm/MevakerConc {Apache 2.0}, IronySet {unstated}. Empty catalog sections (no items): SRL, coreference, relation extraction, dialogue, MT, **aligned/parallel corpora** (relevant gap: no he↔ru resource anywhere in the catalogs).

## 3. Corpora — recorded speech & audio (ASR/TTS ★-rich)

| ★ | Name | What it is | License | Link |
|---|------|-----------|---------|------|
| ★ | ivrit.ai Corpus | ~15,000 h auto-transcribed + 300+ h manually corrected Hebrew speech (basis of LinguistPro's sidecar ASR) | CC BY 4.0 | https://huggingface.co/ivrit-ai |
| ★ | ivrit-ai audio-v2 | >20k hours Hebrew audio ("ivrit.ai v1 license" per description; card says CC BY 4.0) | CC BY 4.0 / ivrit.ai v1 | https://huggingface.co/datasets/ivrit-ai/audio-v2 |
| ★ | ivrit-ai knesset-plenums | Knesset plenum A/V + human protocols | GitHub: CC BY 4.0; site: Custom ToU | https://huggingface.co/datasets/ivrit-ai/knesset-plenums |
| ★ | HebDB | ~2,500 h natural spontaneous Hebrew speech, raw + weakly-supervised (adiyoss lab, HUJI) | CC BY 4.0 | https://pages.cs.huji.ac.il/adiyoss-lab/HebDB/ |
| ★ | Robo-Shaul | 30 h transcribed single-podcast recordings (חיות כיס) — classic Hebrew TTS training set | GitHub: unstated; site: MIT | https://github.com/Sharonio/roboshaul (GitHub list links https://story.kan.org.il/robo_shaul) |
| ★ | The HUJI Corpus of Spoken Hebrew | Naturally-occurring telephone conversations 2020–21, audio + transcripts, Interactional-Linguistics annotation | CC BY 4.0 | https://huji-corpus.com/ |
| ★ | CoSIH | Corpus of Spoken Israeli Hebrew recordings | unstated | http://cosih.com/table-3.html |
| ★ | CHILDES (web catalog only) | Child language acquisition transcripts/audio/video incl. Hebrew — naturally simple learner-adjacent speech | unstated | https://childes.talkbank.org/access/Other/ |

Low-relevance: MaTaCOp map-task dialogues {unstated, non-commercial research only}, HaArchion prose/poetry readings {unstated, down}, Hebrew Medical Audio (Verbit) {CC BY-NC 4.0}.

## 4. Lexicons, dictionaries, word lists (frequency + inflection ★-rich)

| ★ | Name | What it is | License | Link |
|---|------|-----------|---------|------|
| ★ | Grammatical Conjugation and Declension — Academy of the Hebrew Language (**web catalog only**) | ~255,000 inflected forms of 8,200 verbs + ~280,000 declined forms of 15,000 nouns + 22,000 lexical entries with grammar features — authoritative complement to LinguistPro's Pealim dict | unstated | https://hebrew-academy.org.il/2023/05/29/מאגרי-מידע-של-האקדמיה-ללשון-העברית/ |
| ★ | Wikidata Lexemes | 500K+ Hebrew conjugations with morphological analysis, largely Hspell-derived; SPARQL-queryable | CC0 1.0 | http://query.wikidata.org/ |
| ★ | The Word-Frequency Database for Printed Hebrew | Frequency (per-million) of every letter cluster from a 620M-token 2001 newspaper corpus; 554,270 types | © Hebrew University (unstated open license) | GitHub list: https://github.com/eranroz/BotMisparim ; site: http://word-freq.huji.ac.il/index.html |
| ★ | MILA's Hebrew Stopwords List | 23,327 tokens in descending **frequency** order | GPLv3 | https://github.com/NLPH/NLPH_Resources/tree/master/linguistic_resources/word_lists/MILA_stopwords |
| ★ | Hebrew WordLists (Eyal Gruss) | Word lists extracted from Hspell 1.4 (vocalized/unvocalized forms) | AGPL-3.0 | https://github.com/eyaler/hebrew_wordlists |
| ★ | Most Common Hebrew Words on Twitter | Frequency-ranked common words, Twitter 2018–19 | site: MIT; GitHub: unstated | https://github.com/YontiLevin/Hebrew-most-common-words-by-Twitter |
| ★ | Hebrew verb lists (Eran Tomer) | Verb lists from a Master's thesis on verb generation | CC-BY 4.0 | https://github.com/NLPH/NLPH_Resources/tree/master/linguistic_resources/word_lists/hebrew_verbs_eran_tomer |
| ★ | Eran Tomer's Digital Vocalized Text Corpus | Corpus of digitally **vocalized (nikud) Hebrew texts** | Apache License 2.0 | https://www.dropbox.com/sh/rlg0k0flz0675ho/AADvfxmY3SN8lqmkGAWr0hd2a?dl=0 |
| ★ | Hebrew WordNet (MILA) | MultiWordNet-aligned Hebrew WordNet (aligned w/ English/Italian/Spanish; non-commercial; "temporarily down") | GPLv3 | http://www.mila.cs.technion.ac.il/resources_lexicons_wordnet.html |
| ★ | word2word | Word-to-word translations for 3,564 language pairs; Hebrew↔61 languages **incl. Russian** — only he↔ru-capable item in the catalogs | Apache License 2.0 | https://github.com/Kyubyong/word2word |
| ★ | The MILA lexicon of Hebrew words | ~25,000-item lexicon designed for morphological analyzers (non-commercial; "temporarily down") | GPLv3 | http://www.mila.cs.technion.ac.il/resources_lexicons_mila.html |

Low-relevance: MILA Verb Complements Lexicon {GPLv3}, Hebrew Psychological Lexicons {CC-BY-SA 4.0 data / Apache 2.0 code}, sentiment lexicons for 81 langs {GPLv3}, Tapuz 500 stop words {"Data files © Original Authors"}, 28-language stop words {GPLv2}, NNLP-IL UD-based stop words {CC-BY-SA 4.0}, Hebrew name lists (streets/companies/given/last) {CC-BY 4.0}, top-1000 Twitter words {unstated}, KIMA historical Hebrew gazetteer {site: CC BY 4.0}. Unreleased: BGU morphological lexicon, NITE morphological lexicon.

## 5. Word embeddings

All low-relevance for a learning product (grouped): fastText Wikipedia vectors {CC-BY-SA 3.0}, hebrew-word2vec (1.4M words, Twitter) {Apache 2.0}, CoNLL17 word2vec {CC BY 4.0}, CoNLL17 ELMO {GPLv3}, Lior Shkiller's embeddings {unstated}, Hebrew Subword Embeddings (BPEmb) {unstated}, hebrew-w2v (Iddo Yadlin) {Apache 2.0}, LASER multilingual sentence embeddings {CC BY-NC 4.0}, Multilingual BERT {Apache 2.0}.

## 6. Models

| ★ | Name | What it is | License | Link |
|---|------|-----------|---------|------|
| ★ | ivrit-ai whisper-large-v3-turbo-ct2 | faster-whisper CT2 build of ivrit.ai's Hebrew Whisper (the model LinguistPro's sidecar runs) | Apache License 2.0 | https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ct2 |
| ★ | HebTTS | Nikud-free LM-based Hebrew TTS (adiyoss lab) | Apache License 2.0 | https://pages.cs.huji.ac.il/adiyoss-lab/HebTTS/ |
| ★ | DictaBERT-seg | Fine-tuned prefix-segmentation model (proclitic splitting — relevant to LinguistPro's stem-aware resolver) | CC BY 4.0 | https://huggingface.co/dicta-il/dictabert-seg |
| ★ | DictaBERT-morph | Fine-tuned morphological tagging model | CC BY 4.0 | https://huggingface.co/dicta-il/dictabert-morph |
| ★ | OtoBERT | Identifies suffixed verbal forms in Modern Hebrew | CC BY 4.0 | https://huggingface.co/dicta-il/otobert |
| ★ | Hebrew Punctuation Model (Verbit) | AlephBERT fine-tune restoring punctuation in **ASR transcripts** (post-ASR step) | Apache License 2.0 | https://huggingface.co/verbit/hebrew_punctuation (note: web-catalog card mislinks to the hOCR page) |
| ★ | TaatikNet | Seq2seq Hebrew↔Latin **transliteration** (demo: https://huggingface.co/spaces/malper/taatiknet) | CC BY-SA 3.0 | https://github.com/morrisalp/taatiknet |

Low-relevance (grouped): PLMs — AlephBERT {Apache 2.0}, AlephBERTGimmel {CC0 1.0}, DictaBERT {CC BY 4.0}, DictaBERT-char {CC BY 4.0}, HeBERT {MIT}, TavBERT {MIT}, BEREL Rabbinic Hebrew {unstated}, MsBERT manuscripts {CC BY 4.0}, Legal-HeBERT {unstated}, HeRo/LongHeRo {unstated}, HeArBERT he-ar {unstated}, mBERT {Apache 2.0}, ULMFiT-Hebrew {unstated}; generative — Dicta-LM 2.0 collection {Apache 2.0}, Hebrew-Mistral-7B-200K {Apache 2.0}, Hebrew GPT-neo {MIT}; task models — NEMO2 NER {Apache 2.0}, HebSpacy {MIT}, HebSafeHarbor (+ Clalit fork) de-identification {MIT}, Kol-Zchut RAGbot embedder/trainer/engine {MIT}, Neural Sentiment Analyzer {MIT}, LemLDA {GPL}, mT5 summarization experiments {unstated}.

## 7. Tools (morphology / nikud ★-rich)

| ★ | Name | What it is | License | Link |
|---|------|-----------|---------|------|
| ★ | Nakdan (Dicta) | Professional automatic/semi-automatic **nikud** tool (ACL 2020 demo) | GitHub: unstated; site card: "Public Domain" (conflict — verify) | https://nakdan.dicta.org.il/ |
| ★ | Nakdimon | Lightweight Hebrew diacritizer without a dictionary (code: https://github.com/elazarg/nakdimon, **training data**: https://github.com/elazarg/hebrew-diacritize) | unstated | https://www.nakdimon.org/ |
| ★ | UNIKUD | Open-source CANINE-transformer nikud tool, no rules (demo on HF Spaces) | MIT | https://dagshub.com/morrisalp/unikud |
| ★ | Hebrew OCR with Nikud (hOCR) | Converts nikud-less Hebrew text files to correctly vocalized text (BGU) | unstated | https://www.cs.bgu.ac.il/~elhadad/hocr/ |
| ★ | Verb Inflector | Generates **vocalized, morphologically tagged verb forms** from base form + pattern (Java, Eran Tomer) | Apache License 2.0 | https://github.com/NLPH/NLPH_Resources/tree/master/code/VerbInflector |
| ★ | Hspell (+HspellPy) | Free Hebrew spell checker + morphological analyzer (source of LinguistPro-adjacent word lists) | AGPL-3.0 | http://hspell.ivrix.org.il/ |
| ★ | YAP | Morphological analysis, disambiguation + dependency parser (Go; BGU lexicon; NNLP-IL also ships a JS client: https://github.com/NNLP-IL/yap-js-client) | Apache License 2.0 | https://github.com/OnlpLab/yap |
| ★ | HebPipe | End-to-end Hebrew pipeline: segmentation, tagging, lemmatization, parsing, coref | Apache License 2.0 | https://github.com/amir-zeldes/HebPipe |
| ★ | RFTokenizer | Highly accurate morphological segmenter for complex word forms | Apache License 2.0 | https://github.com/amir-zeldes/RFTokenizer |
| ★ | NeMo-text-processing (Verbit fork) | WFST-based Hebrew **inverse text normalization** for ASR post-processing (numbers etc.) | Apache License 2.0 | https://github.com/verbit-ai/NeMo-text-processing |

Low-relevance: Yonti Levin's Hebrew Tokenizer {MIT}, Eyal Gruss's hebrew_tokenizer (field-tested on Ben-Yehuda/bible/opensubs) {unstated}, MILA morphological analysis/disambiguation tools {GPLv3, down}, BGU Tagger {unstated}, SPMRL-to-UD converter {Apache 2.0}, HebMorph Lucene analyzer {AGPL-3.0}, Shtey Shekel grammar-fix wikiproject {MIT}, Text-Fabric ancient-corpora browser {CC BY-NC 4.0}.

## 8. Services (commercial/online)

★ AlmaReader — online Hebrew **TTS** service {unstated} — https://app.almareader.com/
★ wordfreq (PyPI) — word **frequencies** in 44 languages incl. Hebrew (Wikipedia, OpenSubtitles, SUBTLEX, Twitter mix) {MIT} — https://pypi.org/project/wordfreq/
★ DICTA — analytical tools for Jewish/Hebrew texts (nikud, OCR, tagging; GitHub org: https://github.com/Dicta-Israel-Center-for-Text-Analysis) {CC-BY-SA 4.0 per catalog} — http://dicta.org.il/
★ ivrit.ai transcription tool — free browser transcription of Hebrew audio {unstated} — https://transcribe.ivrit.ai/

Grouped, low relevance: Eyfo search/entity {unstated}, Melingo ICA API {unstated}, Genius {unstated}, Amnon/Callee WhatsApp transcriber bots {unstated}, verbit.ai transcription {unstated}, MS Text Analytics for health {unstated}, hebrew-nlp.co.il {unstated}, HebMorph commercial page {AGPL-3.0}.

## 9. Annotation tools

All low-relevance for LinguistPro (grouped): LightTag (RTL-aware) {unstated}, Recogito {Apache 2.0}, CATMA {unclear}, WebAnno {Apache 2.0}, Arethusa {MIT}, rasa-nlu-trainer {MIT}, brat (no RTL) {MIT}, openNLP {Apache 2.0}, opeNER {unstated}, pybossa {AGPL-3.0}, TextThresher {unstated}, doccano {MIT}, SHEBANQ Hebrew-Bible annotation env {unstated}; NNLP-IL's own: Parashoot-Tagging {Apache 2.0}, Parashoot-Screening {unstated}, ParaGeek {Apache 2.0}, View-Annotations {MIT}.

## 10. Evaluation / benchmarks

- Hebrew SimLex-999 — word-similarity gold set for evaluating semantic models {unstated} — https://drive.google.com/drive/folders/0B_pyA_IW4g-jTlJzOHlSWVZWbTQ (copies in Attract-Repel and NLPH_Resources repos). *Only item; "Evaluation Metrics" section is empty.*

## 11. Educational / community

★ Recital: ivrit.ai Community Recording Project — volunteers record spoken Hebrew texts, building an open speech corpus {unstated} — https://recital.ivrit.ai/
★ ivrit.ai Community Transcription Project — volunteer transcription {unstated} — https://serve.ivrit.ai

Grouped: NLPH Facebook group, Israeli NLP Meetup, BIU NLP course playlist, ONLP 2019 slides, Big DataNights NLP 2020; Labs & Researchers directory (~30 entries: ONLP/BIU, BGU, Haifa, TAU, Technion, HUJI, AI2 Israel); Industry list (`Industry.rst`): Melingo, Philosoft, Microsoft IL, Zebra Medical, Ifat, Clalit Research, Taboola, khealth, Webtech, Insights, Hebrew-NLP, over.ai, Genius; non-profits DICTA, Public Knowledge Workshop.

---

## Coverage note

**Fetched successfully:**
- GitHub `NNLP-IL/Hebrew-Resources`: `https://raw.githubusercontent.com/NNLP-IL/Hebrew-Resources/master/README.md` and `/main/README.md` both **404 — the repo has no README.md**; actual content is five `.rst` files on `master` (`README.rst`, `corpora_and_data_resources.rst` 348 lines, `models_tools_services.rst` 418 lines, `additional_resources.rst` 184 lines, `Industry.rst` 53 lines), all downloaded raw and parsed in full.
- `https://resources.nnlp-il.mafat.ai/?language=hebrew`: server-rendered Webflow page, not a SPA shell; no JSON API found or needed — all 200 cards extracted from raw HTML of page 1 and `.../?language=hebrew&dc6e3d3b_page=2` (name/category/description/language/license/task/link per card). Language filtering (`jetboost`) is client-side, so both Hebrew and Arabic cards ship in the HTML; Hebrew-tagged: 162.
- `https://api.github.com/orgs/NNLP-IL/repos` — org repo list (confirms first-party datasets: HeQ, HebNLI, HebrewSentiment, Stop-Words-Hebrew, Kol-Zchut RAGbot family, yap-js-client).

**Not accessible / caveats:** none blocking. Known data-quality issues in the sources themselves: web card "Hebrew Punctuation Model" links to the wrong URL (BGU hOCR page instead of `https://huggingface.co/verbit/hebrew_punctuation`); license conflicts between the two catalogs noted inline (Nakdan, Robo-Shaul, knesset-plenums, HebrewSentiment); MILA resources marked "temporarily down" in the catalog; HaArchion and the Automatic Hebrew Transcriber are listed as down. **Notable gap for LinguistPro:** the catalogs contain no he↔ru parallel corpus at all (the "Aligned/Parallel Corpora" section is empty); the closest is word2word's he↔ru word-level lexicon. **Web-catalog-only finds worth knowing:** the Academy of the Hebrew Language conjugation/declension databases (~255K verb forms + 280K noun forms) and CHILDES Hebrew.

Scratch files (raw RST + parsed cards) are in `.tmp/hebrew-resources/` (gitignored scratch; no repo changes made).
