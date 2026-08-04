# RAW: Агент B — верификация инструментов L4 (MT + nikud + S6) (2026-08-04)

> Необработанный выход research-агента. Не редактировать. Синтез — в ../REPORT.md.

# L4 local translation + nikud + S6 — tool-landscape verification (2026-08-04)

Method note: he↔ru MT numbers below were extracted from the Helsinki-NLP MT leaderboard SQLite score databases (`scores/chrf_scores.db`, `scores/bleu_scores.db` in [1][2][3]) — one shared evaluation harness (OPUS-MT dashboard [4]), so the numbers are cross-comparable. NNLP-IL catalog [5] was swept: it lists **no** he↔ru MT model, **no** forced-alignment tool, and no nikud tool beyond those covered below.

---

## Q1 — Local Hebrew→Russian MT on 8 GB VRAM

FLORES-200 devtest, direct pair, single harness [1][2][3][4]:

| Candidate | heb→rus chrF / BLEU | rus→heb chrF / BLEU | VRAM / runtime (8 GB RTX 3070) | License | Verdict |
|---|---|---|---|---|---|
| **MADLAD-400-10B-MT CT2 int8_float16 (current)** | **no published he→ru score exists** — paper evaluates a 272-pair non-English subset but heb-rus is not reported [6][7] | same — unverified | ~6.5 GB, fits, exclusive GPU slot (in-house measurement) | Apache-2.0 [7] | Keep, but its he→ru edge is an **assumption, not evidence** — must be measured in-house |
| NLLB-200-54.5B MoE (reference ceiling, not runnable) | 0.544 / 27.2 [3] | 0.516 / 21.3 [3] | not runnable locally | CC-BY-NC 4.0 | Shows local models leave ~4–5 chrF on the table vs Meta's MoE |
| **OPUS-MT heb-sla transformer-big (2022-09-15)** | **0.503 / 22.5** [2] | (see sla-heb row) | ~880 MB zip, Marian → CT2-convertible, runs fast on CPU — frees the GPU slot [8] | CC-BY 4.0 (Tatoeba-MT release) | **Top challenger.** Beats every runnable NLLB variant on this pair; verified downloadable [8] |
| OPUS-MT sla-heb transformer-big (reverse) | — | **0.498 / 18.9** [2] | same as above [8] | CC-BY 4.0 | Best published local rus→heb score — reverse direction matters for us |
| NLLB-200-distilled-1.3B | 0.500 / 22.3 [1] | 0.466 / 16.2 [1] | ~1.3 GB int8 CT2 (conversions exist [9]) | CC-BY-NC 4.0 [10] — fine for us | Strong small challenger; note 3.3B is NOT better on this pair |
| NLLB-200-3.3B | 0.496 / 22.1 [1] | 0.457 / 15.5 [1] | ~3.3 GB int8 CT2 [9] | CC-BY-NC 4.0 [10] | Dominated by distilled-1.3B here — skip |
| NLLB-200-distilled-600M | 0.467 / 19.2 [1] | 0.423 / 12.7 [1] | ~0.6 GB | CC-BY-NC 4.0 | Floor option only |
| opus-mt-he-ru (2020, HF) | 0.451 / 17.5 (flores) [2]; Tatoeba-test BLEU 40.5 / chrF 0.599 (short sentences) [11] | rus-heb 2021: 0.435 / 13.8 [2] | ~300 MB, CPU | Apache-2.0 [11] | Superseded by heb-sla big — ignore |
| MADLAD-400-3B / 7B-MT | no per-pair he→ru published [6] | — | ~3 / ~7 GB int8 (7B tight) | Apache-2.0 [12] | Only as cheaper MADLAD ablation points in our own bench |
| TowerInstruct-7B/13B, Tower-Plus-9B | **Hebrew not supported** (10 langs [13]; Tower-Plus 22 langs, no Hebrew [14]) | — | — | CC-BY-NC 4.0 | **Out** — language coverage excludes he |
| Dicta MT / DictaLM | **No dedicated MT models; DictaLM 3.0 translation benchmark is he↔en only** (CCMatrix en-he; tech report) [15][16] | — | 1.7B W4A16 variant would fit | Apache-2.0 (dictalm2.0 [17]); DictaLM 3.0 open-weight | Out for he↔ru; relevant for he↔en only |
| Qwen2.5-7B/14B prompted | Hebrew **not in official language list**; users report poor Hebrew output [18][19] | — | 7B int4 ~4.5 GB; 14B int4 borderline | Apache-2.0 | Out — no evidence, weak Hebrew |
| Gemma-2/3 prompted | 140+ langs pretraining / 35 out-of-box claimed [20][21]; **no published he→ru FLORES score found — unverified** | — | 9B int4 ~6 GB | Gemma license (use restrictions) | Watch only; would need in-house eval to even rank it |

**Bottom line Q1:** Current pick **defensible: yes, with a caveat** — MADLAD-10B has zero published he→ru evidence; the entire published local field tops out at chrF ≈ 0.50, and MADLAD-10B is the highest-capacity direct-pair model that fits 8 GB, but its superiority over a 300 MB CPU Marian model is unproven. **Bounded local benchmark before enablement:** FLORES-200 devtest heb→rus AND rus→heb (chrF++/spBLEU, sacrebleu) + ~200 in-domain segments (subtitle-style ASR output + literary sentences from our corpus), comparing: MADLAD-10B-int8 (current), OPUS heb-sla/sla-heb big (CT2), NLLB-distilled-1.3B-int8, Gemini cloud as ceiling; measure tokens/sec, VRAM, long-sentence behavior (NLLB 512-token limit), and niqqud/punctuation robustness. **Top challenger: OPUS-MT heb-sla + sla-heb transformer-big** — CC-BY, CPU-viable (would free the GPU slot for ASR), and the only local model pair with published scores ≥ NLLB in *both* directions.

---

## Q2 — Local nikud (vocalization)

Common harness: Nakdimon 20K-token modern-Hebrew test set, metrics DEC/CHA/WOR/VOC (word-level = WOR) [22][23]:

| Candidate | Evidence (DEC / CHA / WOR / VOC %) | Runtime | License | Verdict |
|---|---|---|---|---|
| **DictaBERT-large-char-menaked (current)** | **No published numbers on the common harness.** HF card claims SOTA on all modern-Hebrew vocalization benchmarks vs open-source and commercial LLMs, as of 2025-03 — claim **unverified by third party** [24] | 0.3B params, runs on CPU (current sidecar) | **CC-BY 4.0** [24][25] | Keep — newest (updated 2025-04), best license, from the team whose cloud Nakdan is the measured SOTA |
| Dicta Nakdan (cloud, comparator) | 97.95 / 96.77 / **94.11** / 94.92 [22]; later eval: 98.94 / 98.23 / **95.83** / 95.93 [23] | cloud API | terms not clearly published — unverified | Measured SOTA; stays the cloud comparator |
| MenakBERT | 98.82 / 97.95 / **94.12** / 95.22 [23][26] | char-BERT, CPU-ok | **no license on HF card** [27] | Score-competitive but unlicensed + dormant → not productizable |
| D-Nikud (LSTM+TavBERT) | 98.39 / 97.15 / 90.76 / 93.44 [28] | faster than Nakdimon (699 s vs 2713 s, their test) [28] | student project, 2024 | Interesting DEC/CHA, weaker WOR — no |
| Nakdimon | 97.91 / 96.37 / 89.75 / 91.64 [22][23] | tiny 2-layer LSTM, ONNX, CPU | MIT, still maintained (pushed 2026-08) [29] | Great eval *pipeline* to reuse; model itself is behind |
| UNIKUD | **no published accuracy** (card and posts have no numbers) [30][31] | CANINE, CPU | MIT (per NNLP-IL [5]) | No |
| Phonikud | Phoneme-level focus (G2P + stress/vocal-shva); builds ON the Dicta menaked model via frozen-weights adaptors; INTERSPEECH paper [32][33] | INT8 ONNX, real-time CPU [33] | CC-BY 4.0 [33] | Not a replacement — an *extension layer* relevant only if we later need phonetic output for TTS |

**Bottom line Q2:** Current pick **defensible: yes** — no open local system has published numbers beating it, its only measured superior (Dicta cloud Nakdan, WOR 95.8) is the same team's closed system, and every open rival is either unlicensed (MenakBERT), unmeasured (UNIKUD), or weaker (Nakdimon, D-Nikud). **Bounded benchmark:** run the Nakdimon MIT eval pipeline [29] (DEC/CHA/WOR/VOC) on a held-out slice of our own corpus genres (modern prose + dialogue) comparing menaked-local vs Nakdan-cloud, plus CPU ms/1K chars — this both quantifies the unverified SOTA claim and prices the cloud gap. **Top challenger: none locally.**

---

## Q3 — S6 support tech

### (a) Forced alignment of a known-correct Hebrew transcript

| Candidate | Evidence | Runtime | License | Verdict |
|---|---|---|---|---|
| **WhisperX** | Hebrew IS in default align map: `"he": "imvladikon/wav2vec2-xls-r-300m-hebrew"` [34]; that backbone reports WER ~17–23% on its own test sets, no license stated on card [35] | wav2vec2-300M, GPU or CPU | WhisperX BSD-2-Clause, active (23.4k stars, pushed 2026-07) [36] | **Primary candidate** — phoneme-level CTC alignment, Hebrew wired in out-of-box |
| **stable-ts** | Language-agnostic `align()` using Whisper itself — pairs directly with our ivrit whisper-turbo-ct2; ivrit.ai's own pipeline uses stable-whisper alignment [37][38] | reuses existing ASR GPU slot | MIT, active (pushed 2026-05) [39] | **Co-primary** — zero extra models, same tokenizer as our ASR |
| ctc-forced-aligner | MMS-300m-1130 aligner, 1130+ languages via romanization; ≥5x less memory than torchaudio API [40] | 300M, CPU-ok | code BSD; **default model CC-BY-NC 4.0** [40] | Viable fallback (we're non-commercial); romanization of Hebrew adds risk |
| MFA (Montreal Forced Aligner) | **No Hebrew acoustic model in official mfa-models** [41] | — | MIT (tool) | **Out** — would require training our own Kaldi model |
| ivrit.ai alignment work | Crowd-recital/Knesset datasets carry timestamps; their training blog documents the stable-whisper-based timestamp pipeline [37]; whisper-large-v3-turbo-ct2 is Apache-2.0, updated 2025-10, but ships **no WER numbers on the card** [42] | — | Apache-2.0 [42] | Ecosystem ally; their transcription leaderboard [43] is the reference for Hebrew ASR ranking |

### (b) Local Hebrew TTS landscape (watch-only; agreed below product bar)

| System | Evidence | License | Verdict |
|---|---|---|---|
| **Phonikud-TTS** | Paper claim: "small, local TTS models with phonetic input approach large proprietary systems"; real-time; contributes ILSpeech IPA corpus; INTERSPEECH 2026 [32][33]; live HF demo [44] | CC-BY 4.0 (code/model) [33] | **The one to watch** — same DictaBERT-menaked lineage we already run |
| Piper (official) | **No Hebrew voice in official VOICES.md** [45] | MIT | Nothing to adopt directly |
| facebook/mms-tts-heb | VITS single-voice, 2023, dormant | CC-BY-NC 4.0 [46] | Below bar, NC license |
| Roboshaul / SASPEECH | Tacotron2 single-voice (podcast data), 2023 [47][48] | dataset restrictions apply | Historic; superseded |
| HebTTS (HUJI adiyoss-lab) | LM-based, diacritic-free approach [49] | Apache-2.0 (per NNLP-IL [5]) | Research-grade, watch |
| israwave / lightblue (thewh1teagle) | Community models with HF demos [50] | varies | Watch via the same author's Phonikud track |

**Bottom line Q3:** Current plan **defensible: yes** — forced alignment of a known transcript is well-served locally; MFA is the only dead end (no Hebrew model). **Bounded benchmark:** reuse our existing `--subs=<эталон>` live-gate assets: take 2–3 media files with known-correct subtitles, align with (i) stable-ts over ivrit-whisper-turbo and (ii) WhisperX+imvladikon, and measure median/p95 word-boundary offset vs subtitle timing plus VRAM/runtime — pick whichever passes the karaoke drift gates (`classifyClockCompression` analog) with margin. **Top challenger to the S6 status quo:** none — but note structurally, forced alignment gives *by-construction* timestamps from our deterministic audio offsets, i.e., it eliminates the entire S12.5/S12.7 fabricated-timestamp class for the known-transcript case. TTS stays landscape-only; Phonikud-TTS is the only credible local trajectory.

---

### Sources
1. https://github.com/Helsinki-NLP/External-MT-leaderboard (scores/chrf_scores.db, scores/bleu_scores.db; queried 2026-08-04)
2. https://github.com/Helsinki-NLP/OPUS-MT-leaderboard (scores/*.db)
3. https://github.com/Helsinki-NLP/Contributed-MT-leaderboard (scores/*.db)
4. https://opus.nlpl.eu/dashboard/
5. https://github.com/NNLP-IL/Hebrew-Resources/blob/master/models_tools_services.rst
6. https://arxiv.org/abs/2309.04662 (MADLAD-400 paper; ar5iv HTML checked for eval directions)
7. https://huggingface.co/google/madlad400-10b-mt
8. https://object.pouta.csc.fi/Tatoeba-MT-models/heb-sla/opusTCv20210807_transformer-big_2022-09-15.zip (HTTP 200, 885 MB; sla-heb likewise)
9. https://huggingface.co/entai2965/nllb-200-3.3B-ctranslate2
10. https://huggingface.co/facebook/nllb-200-distilled-1.3B
11. https://huggingface.co/Helsinki-NLP/opus-mt-he-ru
12. https://huggingface.co/google/madlad400-3b-mt
13. https://huggingface.co/Unbabel/TowerInstruct-7B-v0.1
14. https://huggingface.co/Unbabel/Tower-Plus-9B
15. https://dicta.org.il/publications/DictaLM_3_0___Techincal_Report.pdf
16. https://huggingface.co/dicta-il/DictaLM-3.0-24B-Base
17. https://huggingface.co/dicta-il/dictalm2.0
18. https://qwenlm.github.io/blog/qwen2.5/
19. https://github.com/QwenLM/Qwen3/issues/1114
20. https://developers.googleblog.com/en/introducing-gemma3/
21. https://huggingface.co/blog/gemma3
22. https://arxiv.org/abs/2105.05209 (Nakdimon, NAACL 2022 Findings; test-set numbers via [28] Table 3)
23. https://arxiv.org/html/2510.26521v2 (Hebrew Diacritics Restoration using Visual Representation, results table)
24. https://huggingface.co/dicta-il/dictabert-large-char-menaked
25. https://huggingface.co/api/models/dicta-il/dictabert-large-char-menaked (license cc-by-4.0, modified 2025-04-08)
26. https://arxiv.org/abs/2410.02417 (MenakBERT)
27. https://huggingface.co/idoco/MenakBERT (no license field)
28. https://arxiv.org/pdf/2402.00075 (D-Nikud; Tables 2–3, 5)
29. https://github.com/elazarg/nakdimon (MIT, pushed 2026-08)
30. https://huggingface.co/malper/unikud
31. https://dagshub.com/morrisalp/unikud
32. https://arxiv.org/abs/2506.12311 (Phonikud)
33. https://github.com/thewh1teagle/phonikud
34. https://raw.githubusercontent.com/m-bain/whisperX/main/whisperx/alignment.py (DEFAULT_ALIGN_MODELS_HF["he"])
35. https://huggingface.co/imvladikon/wav2vec2-xls-r-300m-hebrew
36. https://github.com/m-bain/whisperX (BSD-2-Clause via GitHub API)
37. https://www.ivrit.ai/en/2025/02/13/training-whisper/
38. https://github.com/jianfch/stable-ts
39. GitHub API: jianfch/stable-ts → MIT, pushed 2026-05-30
40. https://github.com/MahmoudAshraf97/ctc-forced-aligner
41. https://mfa-models.readthedocs.io/en/latest/acoustic/index.html (Hebrew absent)
42. https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ct2
43. https://huggingface.co/spaces/ivrit-ai/hebrew-transcription-leaderboard
44. https://huggingface.co/spaces/thewh1teagle/phonikud-tts
45. https://raw.githubusercontent.com/rhasspy/piper/master/VOICES.md (no Hebrew entry)
46. https://huggingface.co/facebook/mms-tts-heb (cc-by-nc-4.0 via HF API)
47. https://github.com/Sharonio/roboshaul
48. https://github.com/maxmelichov/Text-To-speech
49. https://pages.cs.huji.ac.il/adiyoss-lab/HebTTS/
50. https://huggingface.co/spaces/thewh1teagle/tts-with-israwave

Unverified items are marked inline: MADLAD he→ru quality (no published number anywhere), DictaBERT-menaked's "SOTA" claim (vendor-only, no numbers), Gemma-3 he→ru quality, Dicta Nakdan API commercial terms, and imvladikon aligner license (unstated on card).
