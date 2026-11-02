# P3 progress — historical checkpoint

Superseded by [the completed local search A report](../2026-11-02-search-eval/README.md). The draft limitations below were recorded before implementation and are not current search status.

Branch: feat/atlas-search-voice, base origin/main 99930cdc. Plan imported from 01bec5dd.

Owner clarification: Hebrew audio only. RU audio and HE→RU playback are excluded. Search remains bilingual with transliteration. Public audio and download rights were explicitly granted in the conversation; no production writes or provider calls have occurred.

Search engine draft: shared Node/browser module, Hebrew normalization through CorpusFTS, Russian Snowball rules, notation/unit keys, compact postings, section hashes, build script. Actual corpus: 42 sections, 7614 indexed objects, search.json 1473385 bytes, preliminary desktop p95 0.1712 ms. Derived data remains gitignored. These measurements do not establish relevance or browser acceptance.

Validation: node atlasReader + atlasSearch tests 49/49; reader audit 42 sections, 0 findings. Python atlas suite: 193 tests, failures=1/errors=1/skipped=12; output indicates missing katex in the shared node_modules installation. Full npm test: 2949/2949 passed.

Pending before S1 is accepted: independent 60+ query gold set with scan evidence; ranking by exactness/field weight/IDF, case fallback labels, full notation lexicon; exact phrase checking currently only examines the preview and needs full-object positions; fragment coverage evaluation; unknown command report. Compact format needs additional real-corpus round-trip testing and parse timing. None of S1/S2/S3 is declared complete.

S2 UI, browser history round trip, three locales, responsive browser checks and S3 integration have not been implemented. Voice generation/player code has not started. Do not deploy this draft. No main push, production write or paid request.
