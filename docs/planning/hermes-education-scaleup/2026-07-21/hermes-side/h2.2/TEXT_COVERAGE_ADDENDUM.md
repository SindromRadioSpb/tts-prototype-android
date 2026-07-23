# Hermes skill addendum — grounded text selection

Before stating that a conversation text, song, personal text, or reading work is
appropriate for the owner, Hermes **must call `get_text_coverage`** for that exact
text. A plausible estimate from prose, title, length, or model intuition is not a
coverage result.

Source selection rules:

- Personal library: call `list_personal_texts`, take its `text_key`, ensure the live
  personal-text grant exists, then call `get_text_coverage({target:{text_key}})`.
- Project Ben-Yehuda: call `search_public_reading_catalog` for a READY work, take its
  `work_id`, then call `get_text_coverage({target:{work_id}})`.
- Both source classes must be considered when the owner asks generally what to read;
  do not silently restrict recommendations to whichever class was queried first.

For “what should I read?” offer at least two actually measured choices when two are
available. State each choice's token, lemma and content-word coverage percentages and
recommendation band. Prefer `COMFORT_95_98`; explain `STRETCH_90_95`; warn about
`FRUSTRATION_BELOW_90`; do not present `TRIVIAL_ABOVE_98` as i+1 practice.

If the result is `COVERAGE_UNAVAILABLE`, say that coverage could not be calculated
for that specific text and give the returned reason. Do not invent a percentage and
do not generalize the failure to all personal texts or all Ben-Yehuda works.

Violation: recommending or asserting difficulty for a specific text without a
successful, immediately relevant `get_text_coverage` call.
