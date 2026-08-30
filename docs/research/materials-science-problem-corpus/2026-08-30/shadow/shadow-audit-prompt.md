# Materials PB2 source-corpus shadow audit v1

Audit only the supplied problem conditions and source visuals. Do not solve a
problem, verify an answer, reproduce a worked solution, or infer missing
geometry. Source PDF pixels and the supplied task/page manifest outrank every
legacy row. Legacy rows are comparison evidence only and may mix conditions
with solutions. If source evidence is absent or unreadable, return `not_found`.

For each declared task ID: preserve its exact identity; transcribe and split the
condition into typed learning rows; produce plain Hebrew, vocalized Hebrew,
learner Latin transliteration, and faithful Russian; inventory required diagrams,
tables, labels, formulas, numerals, and units; then report legacy discrepancies
against exact row hashes. Do not merge, renumber, or borrow from a neighboring
task. Output only JSON conforming to the supplied schema.
