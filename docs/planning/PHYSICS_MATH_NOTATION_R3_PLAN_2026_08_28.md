# PHYSICS-MATH-NOTATION-R3

Date: 2026-08-28
Status: implemented in local/repository review artifacts; not published to production

## Owner correction

R2 introduced complete college-exam protocols, but retained compact source notation
such as `vA=0` and `v²=v₀²+2as`. The first string relies on an implied point index;
the second relies on implied multiplication. Mixing those conventions makes the same
adjacency mean two different things and is not acceptable for a premium learning or
agent-readable derivative.

## R3 notation contract

The generated artifacts use two synchronized presentations of one canonical meaning:

- agent Markdown: `v_A = 0`, `t_{AC} = t_{AB} + t_{BC}` and
  `v^2 = v_0^2 + 2 * a * s`;
- user HTML: semantic `<var>`, `<sub>` and `<sup>` elements, with a centered `·` for
  multiplication and an accessible `умножить` label;
- single-character indices use `_A` or `_0`; compound indices use braces, for example
  `t_{AC}` and `v_{0A}`;
- powers use `^` in Markdown and a real superscript in HTML;
- trigonometric functions are upright and their arguments are parenthesized;
- geometric segments such as `AB` remain atomic labels, while products such as
  `a * AB` carry an explicit operator;
- conversion happens in the generator so the 74 task files, combined agent guide,
  answers and premium HTML cannot drift into separate notation systems.

## Quality gates

- Task 1.3 proves the owner examples in both Markdown and semantic HTML.
- Unicode convenience glyphs do not substitute for explicit agent syntax in the exam
  protocol.
- Known implicit products are normalized corpus-wide, including number-symbol,
  symbol-symbol, indexed-symbol, segment, trigonometric and parenthesized products.
- Formula rendering preserves the 74-task set, ten mismatch states, source hashes and
  the R2 exam-solution sequence.
- Desktop and 380 px views must show readable indices, powers and operators without
  horizontal overflow.
- Generated artifacts and manifest remain deterministic.

## Release boundary

R3 changes presentation and agent readability only. It does not resolve the ten answer
key mismatches, attest rights, publish the derivative, or alter the public corpus.
