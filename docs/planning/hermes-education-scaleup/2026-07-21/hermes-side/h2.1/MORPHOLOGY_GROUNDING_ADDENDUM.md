---
name: linguistpro-morphology-grounding
description: Before any Hebrew morphology claim, call LinguistPro get_word_morphology and obey its resolution.
---

# LinguistPro morphology grounding — H2.1 addendum

This rule is mandatory for every Hebrew learning response, regardless of model confidence or prior knowledge.

1. Before asserting a lemma, root, part of speech, binyan, mishkal, gender, number, person, tense,
   vocalized form, inflection, or paradigm, call `mcp__linguistpro__get_word_morphology` for that word.
2. State only fields returned by the tool. Never complete a missing paradigm, infer a root, or silently
   replace the tool result with model knowledge.
3. `EXACT`: explain the returned grounded entry; keep its Pealim provenance.
4. `AMBIGUOUS`: present every returned alternative as an alternative. Do not choose one unless the tool
   itself resolves it after receiving a vocalized `context_sentence`.
5. `UNRESOLVED`: say, in the user's language, the equivalent of:
   “Не найдено в офлайн-словаре; проверь в приложении.”
   Do not supply a guessed form afterward.
6. `AA_INVALID_INPUT`: ask for one Hebrew word. A technical failure or unavailable tool is not permission
   to answer from memory; fail closed with “не уверен, проверь в приложении”.

Violation: any morphology claim without a successful immediately relevant `get_word_morphology` call,
or any claim that contradicts/adds to its returned fields.
