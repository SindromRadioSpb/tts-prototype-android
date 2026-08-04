# RAW: Агент G — систематический live-свип Hugging Face (2026-08-04, follow-up по вопросу владельца)

> Необработанный выход research-агента. Не редактировать. Синтез — в ../REPORT.md (аддендум §8).

# HF Live Sweep — Hebrew Resources (2026-08-04)

Method note: `?language=he` on the HF API is **silently ignored** (returns global toplists) — everything below was re-verified via `?filter=he` (models), `?filter=language:he` (datasets), name searches (`hebrew`, `ivrit`, `nikud`, `niqqud`, `menaked`), org listings, and README/tag fetches. Items from the broken `language=he` lists were only kept if independently confirmed.

---

## 1. New Hebrew LLMs / instruct (2025–2026)

- **SicariusSicariiStuff/Hebrew_Nemo** — https://huggingface.co/SicariusSicariiStuff/Hebrew_Nemo — Mistral-Nemo-12B Hebrew instruct fine-tune. Apache-2.0, mod 2025-12-16, 45 dl (+GGUF mirrors ~520 dl via mradermacher). **Evals: yes** — card table: SNLI acc 79.76, HeQ 70.51, translation BLEU 30.83, "Israeli Trivia", claims SOTA-for-size vs DictaLM2.0-instruct. Fit: the only serious community-tuned Hebrew 12B with published numbers; candidate for local-GPU Q4 experiments, but 12B is tight on 8GB.
- **Intel/hebrew-math-tutor-v1** — https://huggingface.co/Intel/hebrew-math-tutor-v1 — Qwen3-4B-Thinking-2507 fine-tune answering math in Hebrew (Intel, Jan 2026). Apache-2.0, 58 dl. **Evals: yes** — MATH500/AIME24/AIME25 in Hebrew, pass@1 + maj@16 + %-Hebrew-answers reported. Fit: proof that 4B-class Hebrew-output reasoning works — size fits RTX 3070; also relevant to focus 6.
- **DictaLM-3.0-24B Base/Thinking (+FP8/W4A16)** — https://huggingface.co/dicta-il/DictaLM-3.0-24B-Thinking — *new about a covered family*: the 24B tier (mod 2026-05-04) and Nemotron-12B tier (2025-12) with pre-quantized FP8/W4A16 + GGUF variants. Fit: 1.7B-Instruct (2966 dl) is the realistic local option; 24B is server/BYOK only.
- **Hebrew LLM Leaderboard** — https://huggingface.co/spaces/hebrew-llm-leaderboard/leaderboard (+ `chat-leaderboard`, dataset `hebrew-llm-leaderboard/chat-results`, mod 2026-04-27) — live Hebrew LLM eval leaderboard (46 likes). Fit: external model-selection oracle we hadn't cataloged.
- **AI21 Jamba** — https://huggingface.co/ai21labs/AI21-Jamba-Mini-1.5 — Jamba 1.5/1.6/1.7 are he-tagged (official Hebrew support, apache/other lic). The new **Jamba2-3B / Jamba2-Mini** (2026-02) make **no Hebrew claim** in the card. Eval evidence for Hebrew: none published.
- **CohereLabs Aya Expanse 8B/32B, Command-A family, command-a-translate-08-2025** — he-tagged, CC-BY-NC (gated). No public Hebrew-specific numbers. Fit: BYOK-style only; NC license limits product use.
- **yam-peleg/Hebrew-Mistral-7B & Hebrew-Gemma-11B(-Instruct)** — https://huggingface.co/yam-peleg/Hebrew-Mistral-7B — 2024-era, apache-2.0, absent from our covered list; superseded in practice by DictaLM, no strong evals. Low priority.
- **Slasky/HebrewGPT-1B(-Instruct)** — from-scratch Hebrew GPT (2026-03/04), apache-2.0, no evals, ~0 dl. Watch-only. Same for **guychuk/hebrew-hrm-corpus** (https://huggingface.co/datasets/guychuk/hebrew-hrm-corpus, apache-2.0, 4774 dl) — training corpus for a from-scratch Hebrew Hierarchical Reasoning Model.
- **Negative**: nothing Hebrew from Aleph Alpha; no other Israeli-startup open weights found.

## 2. New ASR/TTS/speech beyond ivrit.ai

**ASR / alignment**
- **microsoft/VibeVoice-ASR** — https://huggingface.co/microsoft/VibeVoice-ASR — unified S2T for **60-minute long-form audio in a single pass** with speakers + timestamps + hotwords, 50+ languages **incl. Hebrew** (he in card langs). MIT, mod 2026-01-27, **694,766 dl**, arXiv 2601.18184. GGUF: cstr/VibeVoice-7B-GGUF / cstr/vibevoice-asr-GGUF. Hebrew-specific WER: none published. Fit: the single most relevant ASR find — an independent long-form hypothesis generator vs our chunked Whisper pipeline.
- **MahmoudAshraf/mms-300m-1130-forced-aligner** — https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner — CTC **forced aligner**, 1130 languages incl. he. CC-BY-NC-4.0, 2.46M dl (+ONNX: onnx-community mirror). Fit: independent audio↔text timing oracle — directly relevant to S12.7-style timestamp-fraud gates and karaoke alignment.
- **nvidia/nemotron-3.5-asr-streaming-0.6b** — https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b — Hebrew is only **"adaptation-ready"** (tokenizer knows it, not production-tuned). License "other" (NVIDIA), 1.03M dl, mod 2026-07-06. Community Hebrew adaptations exist but are eval-free: notmax123/nemotron-3.5-asr-hebrew-streaming-0.6b, mralexivy/… (Jul–Aug 2026).
- **Negative (important)**: **Qwen3-ASR (0.6B/1.7B) has NO Hebrew**; CohereLabs/cohere-transcribe-03-2026 — no Hebrew; mistralai/Voxtral-Mini-Realtime — no Hebrew. They only appeared under the broken `language=he` query.
- **thewh1teagle/whisper-large-v3-turbo-he-ipa** (+`-ct2`) — https://huggingface.co/thewh1teagle/whisper-large-v3-turbo-he-ipa — Whisper turbo fine-tuned to transcribe Hebrew **into IPA phonemes**. Apache-2.0, 443 dl, mod 2026-04. Dataset: whisper-heb-ipa-dataset. Fit: pronunciation-scoring building block nobody else has.
- **MayBog/whisper-hebrew-nikud-v1** — https://huggingface.co/MayBog/whisper-hebrew-nikud-v1 — ASR emitting **vocalized (nikud) Hebrew**, base ivrit-ai/whisper-large-v3-turbo (2025-11, gated card, no evals).
- **ivrit-ai family — new since prior research**: `yi-whisper-large-v3(-turbo)(-ct2/ggml)` (Yiddish, Feb 2026); **VoxKnesset** (https://huggingface.co/datasets/ivrit-ai/VoxKnesset, arXiv 2603.01270 — Knesset voices annotated with **speaker age/demographics**); `knesset-committees` (gated); `jbd` (10M–100M text rows, no card); `audio-base`; **tts-arena-preferences** (human preference votes from a Hebrew TTS arena — i.e., ivrit.ai now runs Hebrew TTS evals); plus their pyannote-diarization-3.1 mirror (261K dl). Conversion ecosystem: instush/ivrit-whisper-large-v3-turbo-timestamped-onnx, CoreML/MLX/Q8 ports.
- **Diarization**: nothing Hebrew-specific new; **pyannote/speaker-diarization-community-1** (2025, 5.1M dl) is the language-agnostic upgrade path.
- **Niche**: akiva-skolnik/hebrew-impairment-speech-v1 (Down-syndrome Hebrew speech, CC-BY-NC); disco-eth/WorldSpeech + commonvoice22_sidon include he.

**TTS**
- **ResembleAI/chatterbox (Multilingual)** — https://huggingface.co/ResembleAI/chatterbox — MIT, 2.53M dl, 23 languages **incl. Hebrew**, zero-shot voice clone + emotion control; ONNX (onnx-community/chatterbox-multilingual-ONNX) and GGUF ports exist. Hebrew MOS: none published. Fit: strongest open Hebrew-capable TTS newcomer, license-clean, plausibly sidecar-runnable.
- **openbmb/VoxCPM2** — https://huggingface.co/openbmb/VoxCPM2 — Apache-2.0, 899K dl, Hebrew explicitly in supported-language list (2026-04). No he evals.
- **bosonai/higgs-tts-3-4b** — https://huggingface.co/bosonai/higgs-tts-3-4b — 384K dl, huge language list incl. Hebrew; license "other" (check before use).
- **notmax123/Zonos-Hebrew** — https://huggingface.co/notmax123/Zonos-Hebrew — Zonos-v0.1 Hebrew port, CC-BY-NC-4.0, **162,811 dl**, 6GB+ VRAM. Same author: MamreTTS (CC-BY-NC), piper-medium-heb, BlueV3 experiments.
- **Kokoro Hebrew**: thewh1teagle/kokoro-hebrew-nc (ONNX, non-commercial, Jul 2026) and avris/kokoro-hebrew-saspeech (gated card, SASPEECH-trained). **Yzamari/f5tts-hebrew-v2** (Apache-2.0, F5-TTS on FLEURS+campus data). thewh1teagle/zipvoice-heb, qwen3-tts-prosody-24h dataset.
- **Negative**: MOSS-TTS, fishaudio/s2-pro — no Hebrew in cards despite he tag; k2-fsa/OmniVoice — Hebrew unconfirmed (mass language-tag list, no card mention); Qwen3-TTS — no Hebrew.

## 3. he↔ru / Russian-relevant

- **WindyWord/translate-he-ru** — https://huggingface.co/WindyWord/translate-he-ru — looks like a find but is a **CT2/int8 repack of Helsinki-NLP/opus-mt-he-ru** (CC-BY-4.0), auto-generated repo ("Certified by … Opus-Claw"), self-scored "75.9/100", no independent evals, 0 dl (2026-08-04). Not new capability.
- **HPLT/translate-he-en-v2.0 & en-he (-hplt / -hplt_opus)** — https://huggingface.co/HPLT/translate-en-he-v2.0-hplt_opus — **new dedicated Marian he↔en MT** trained on HPLT v2 + OPUS, CC-BY-4.0, Marian format (HF conversion pending), evals on the HPLT-MT GitHub not in card. English-pivot only — no he↔ru.
- **tencent Hy-MT2 (1.8B / 7B / 30B-A3B) + Hunyuan-MT-7B** — https://huggingface.co/tencent/Hy-MT2-1.8B — Apache-2.0, Hebrew **and** Russian both in the official 33-language list; Hy-MT2-1.8B: 122K dl, 1160 likes (2026-05); WMT-winning lineage (Hunyuan-MT WMT25). No he-pair-specific numbers published. Fit: **first plausible direct he↔ru neural MT in one small open model** — 1.8B fits the RTX 3070 easily.
- **ModelSpace/GemmaX2-28-9B-v0.1** — https://huggingface.co/ModelSpace/GemmaX2-28-9B-v0.1 — translation LLM, 28 languages incl. Hebrew + Russian (paper-backed, arXiv GemmaX2). 9B → Q4 on 8GB is borderline.
- **Datasets**: no new he↔ru parallel corpora found. Adjacent: refine-ai/subscene (multilingual subtitles), Helsinki-NLP/OpenSubtitles2024-40-langs-15-movies (sample), NiuTrans/LMT-60-sft-data (60-lang MT SFT).

## 4. Nikud / vocalization newcomers

- **"renikud" project** (thewh1teagle + notmax123, Dec 2025–May 2026) — https://huggingface.co/thewh1teagle/renikud-v3-whisper, `renikud-mlm-pretrain`, notmax123/`RenikudPlus`, `nikud_exps_renikud` — active new diacritization experiments from the phonikud author. No cards/evals yet; watchlist.
- **TigreGotico/hebrew_diacritized_text** — https://huggingface.co/datasets/TigreGotico/hebrew_diacritized_text — **5.3M nikud-annotated sentences** (phonikud `knesset_nikud_v6`: Dicta-diacritized Knesset, 6 correction passes), CC-BY-4.0, 2026-06. Fit: largest open nikud training/eval corpus we've seen; direct feed for an L4.0 nikud benchmark.
- **thewh1teagle/dicta-onnx** — MIT ONNX export of Dicta (menaked) — sidecar-friendly nikud without Python/torch.
- **dicta-il/hebrew-space-restoration-corpus** (ODC-BY, ~6K sentences, W-NUT 2025 paper) + `dictabert-char-spacefix` — *new about covered family*: space-restoration task/model for scraped Hebrew text.
- MayBog/whisper-hebrew-nikud-v1 (see §2). arthjeau/niqqud-v5 — no card, ignore.

## 5. Hebrew embeddings / rerankers

- **oridror/e5-base-hebrew-qa-v2-myd-r1** — https://huggingface.co/oridror/e5-base-hebrew-qa-v2-myd-r1 — mE5-base tuned on Hebrew QA pairs, Apache-2.0. Evals: acc@1 0.722 / acc@5 0.852 on 500 held-out (synthetic, self-reported). Companion bge-m3-hebrew-r1.
- **microsoft/harrier-oss-v1 (270m/0.6b/27b)** — https://huggingface.co/microsoft/harrier-oss-v1-0.6b — MIT, 2026-03, 93 languages incl. he, 212K–329K dl. New MSFT open embeddings — un-cataloged he-capable option.
- **ibm-granite/granite-embedding-97m/311m-multilingual-r2** — he among 52 langs, Apache-2.0, 283K dl. **codefuse-ai/F2LLM-v2** (80M–14B, he-tagged, 2026-07). **sentence-transformers/static-similarity-mrl-multilingual-v1** (static, ultra-fast, he).
- **jinaai/jina-embeddings-v3** — he-supported, 3.2M dl — high-download miss from prior catalogs (CC-BY-NC weights).
- **Eval data**: Sefaria/Rabbinic-Hebrew-English-Pairs (3,708 parallel pairs, CC-BY-4.0, built *specifically as a cross-lingual embedding benchmark*); MitchMitchon/hebrew-translated-retrieval-datasets + Mithilss/HebrewSearch-* (Hebrew retrieval training sets); mteb/HebrewSentimentAnalysis v3/v4.
- No Hebrew-specific reranker found (negative).

## 6. Learner / education-specific

- **Intel/hebrew-math-tutor-v1** (see §1) — the only real education-tuned Hebrew model found.
- **lego573402/bible-vocabulary-difficulty** — https://huggingface.co/datasets/lego573402/bible-vocabulary-difficulty — per-verse reading-difficulty metrics across 12 translations (references+metrics only, 2026-07-30). Small but conceptually adjacent to graded reading.
- **jumelet/multiblimp** — https://huggingface.co/datasets/jumelet/multiblimp — multilingual grammatical minimal pairs (UD+UniMorph) incl. Hebrew, CC-BY-4.0, arXiv 2504.02768. Usable as a grammar-competence probe for any Hebrew model we adopt.
- **GiliGold/Hebrew_VAD_lexicon** — manually curated valence/arousal/dominance scores for Hebrew words, CC-BY-SA-4.0 (2026-02).
- **Honest negative**: searches for Hebrew **GEC, simplification, CEFR/graded text, learner corpora** all returned **zero** results. This niche remains empty on HF — our graded-reading assets stay unique.

## 7. OCR / handwriting Hebrew

- **cyttic TrOCR-Hebrew program** (active Jun–Jul 2026) — https://huggingface.co/cyttic/exp21-trocr-hebrew-directfit-frozen (1004 dl) + datasets **cyttic/heb-synth-1m** (1M synthetic handwritten lines, 57 fonts, CC-BY-4.0), trocr-hebrew-synthetic*, diffusionpen-hebrew-handwriting. The most systematic open Hebrew HTR effort on HF; no published CER on a public benchmark yet.
- **AmitKabya/hebrew-doc-ocr-benchmark** — https://huggingface.co/datasets/AmitKabya/hebrew-doc-ocr-benchmark — small (<1K) image+text Hebrew doc-OCR benchmark (2026-04), card empty.
- **VLM-HTR fine-tunes**: kohelet-splendour/qwen3-vl-hebrew-htr-* + glm-4.6v-hebrew-htr-* LoRA series (manuscript lines, 2026); isaacmg/qwen3-vl-8b-hebrew-rashi-merged (**Rashi script**, Apache-2.0); beratkurar/hebrew_script_mode_classifier; oln-1/hebrew-htr-trocr; johnlockejrr/heb_synth_pangoline; samaritan-ai (Samaritan Hebrew OCR); alexgoldberg/hebrew-manuscript-* NER/classifiers; mr3vial paleo-hebrew suite (YOLO+mT5 translate).
- Fit: photo-import OCR (S8) currently rides Gemini BYOK; a local printed-Hebrew fallback would still need work — nothing here is production-grade with evals, but cyttic's synthetic corpora are the raw material.

## 8. High-download items missed / infrastructure

- **segment-any-text SaT (sat-3l-sm … sat-12l)** — https://huggingface.co/segment-any-text/sat-3l-sm — MIT, 549K dl, SOTA multilingual **sentence segmentation** (85 langs incl. Hebrew, paper-backed). We hand-roll segmentation; SaT is a drop-in ONNX-able upgrade/oracle.
- **cstr/awesome-align-onnx-int8** — https://huggingface.co/cstr/awesome-align-onnx-int8 — awesome-align (mBERT **word alignment**) as int8 ONNX, he in language list (2026-08). Direct candidate for he↔ru word-level table alignment.
- **google/wmt24pp** — https://huggingface.co/datasets/google/wmt24pp — WMT24++ human post-edited references, 55 pairs **incl. en→he_IL**, Apache-2.0, mod 2026-07-30. **openlanguagedata/flores_plus** — FLORES+ (maintained successor to FLORES-200 incl. Hebrew, CC-BY-SA-4.0).
- **MT metrics with Hebrew coverage**: Unbabel/wmt22-cometkiwi-da (reference-free QE, he-tagged, 17.9K dl) and new zouharvi/COMET-poly-*-wmt25 (2026-07-30).
- **HPLT 3.0 Hebrew encoders** — HPLT/hplt_gpt_bert_base_3_0_heb_Hebr (+`-UD` finetune, `hplt_t5_base_3_0_heb`, `hplt_bert_base_2_0_heb-Hebr`) — Apache-2.0, brand-new monolingual Hebrew GPT-BERT/T5 from the HPLT 3.0 release; near-zero downloads, no head-to-head vs DictaBERT yet.
- **Corpora**: HaifaCLGroup/KnessetCorpus (35M sentences, CC-BY-SA-4.0, paper); tomron87/hebrew-wikipedia-sentences-corpus (11M cleaned sentences, 2026-02); NHLOCAL/judaic-texts-corpus (Otzaria library, CC-BY-4.0, 2026-08); HPLT2.0_cleaned/DocHPLT Hebrew portions.
- **Misc**: stanfordnlp/stanza-he refreshed 2026-07-30 (Apache-2.0); CordwainerSmith/GolemPII-v1 (Hebrew PII NER, MIT); verbit/hebrew_punctuation remains the only punctuation model (no change).

---

## Bottom line — does anything change?

**(a) L4.0 MT/nikud/alignment benchmark candidate list — YES.**
- MT: add **tencent/Hy-MT2-1.8B** (Apache-2.0, he+ru official — first small open model plausibly doing direct he↔ru; benchmark it against MADLAD/NLLB/opus-mt on our tables), optionally Hy-MT2-7B and GemmaX2-28-9B; add **HPLT he↔en v2.0 Marian** as a CPU-cheap baseline. Add **wmt24pp en→he_IL** + **FLORES+** as test sets, and **CometKiwi-DA** as a he-capable reference-free metric.
- Nikud: add **TigreGotico/hebrew_diacritized_text** (5.3M sentences) as train/eval data and **thewh1teagle/dicta-onnx** as a deployment path; put **renikud** on the watchlist (no evals yet).
- Alignment: add **cstr/awesome-align-onnx-int8** (text↔text word alignment) and **MMS forced aligner** (audio↔text; CC-BY-NC — research/gate use only).

**(b) Quality-gates quick wins — YES.**
- **MMS forced aligner** = independent audio-text timing oracle — exactly the "validate LLM-reported coordinates with an independent signal" pattern from S12.5/S12.7; could grade saved karaoke timelines offline.
- **microsoft/VibeVoice-ASR** (MIT, 60-min single-pass with timestamps, GGUF available) = second independent ASR hypothesis for cross-checking chunked-Whisper output on long media.
- **SaT segmentation** as a cheap segmentation-sanity oracle.

**(c) Feature-candidate list — YES.**
- Local/offline Hebrew **TTS** is now realistic: **Chatterbox Multilingual (MIT)** first, VoxCPM2 (Apache) second; Zonos-Hebrew/kokoro-hebrew only if NC is acceptable.
- **whisper-heb-ipa** enables a pronunciation-feedback feature (learner speaks → IPA compare) unique in the Hebrew-learning space.
- **ivrit-ai/tts-arena-preferences + VoxKnesset** signal ivrit.ai expanding into TTS eval + speaker metadata — worth tracking before building our own Hebrew TTS eval.
- Education niche (GEC/simplification/CEFR) is confirmed **empty** on HF — our graded-reading/retention moat is not threatened by any dataset found.
