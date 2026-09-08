# Studio Gemini 3.8 Flash — release evidence

Date: 2026-09-08
Scope: Studio BYOK model-policy migration only

## Shipped behavior

- Managed Studio default: `gemini-3.8-flash`.
- Thinking policy: explicit `medium`.
- Sampling overrides removed and blocked centrally.
- No model fallback and no ordinary-user model selector.
- Existing 3.7 caches and provenance are preserved; 3.8 uses distinct cache
  identities.
- Browser table-cache reuse and long-table OPFS resume are also bound to the
  exact `gemini-3.8-flash` model, preventing mixed 3.7/3.8 tables after an app
  update.

## Live provider gate

One in-process request used the owner's connected key without logging or
persisting the key, request text, or response text.

- status: `TECHNICAL_PASS`
- requested/returned model: `gemini-3.8-flash`
- structured table coverage: 2/2 segments
- prompt tokens: 404
- output tokens: 94
- thinking tokens: 873
- elapsed time: 4107 ms

This proves model availability, SDK/config compatibility, structured output,
and the existing row/niqqud validator on a small fixture. It is not linguistic
accuracy scoring and is not owner acceptance of a full long-form Studio run.

## Product recommendation

Keep the current model managed by LinguistPro and display it read-only. Do not
make ordinary users decide among provider model IDs. Revisit an Advanced-only
allowlist only after a concrete expert workflow requires it.

Engineering plan and invariants:
[STUDIO_GEMINI_38_MIGRATION_2026_09_08.md](../../../planning/STUDIO_GEMINI_38_MIGRATION_2026_09_08.md)
