# C2 preregistration — realtime Hebrew voice

Frozen before the first Gemini Live audio call on 2026-07-25.

## Amendment A — product surface corrected before first audio session

This amendment was recorded on 2026-07-25 after the connection-only probe and before any C2
audio was sent. The owner rejected the terminal launcher because it does not represent the
actual learning path. The original authorization, provider, privacy boundary, three-session
limit and zero-dollar stop condition are unchanged.

The benchmark surface is now limited to the Hermes WebUI in a desktop browser and the same
mobile WebUI reached from iPhone. The installed Hermex build remains an async control because it
sends completed voice notes; it is not counted as realtime unless a future native build exposes
a continuous bidirectional audio channel.

The following original measures are superseded before data collection:

- anxiety is not collected because it is non-informative for this owner;
- a subjective dialogue-quality score is not collected;
- cost is an account-level Free Tier stop guard, not a question after every session;
- Gemini input transcription must be visible during the conversation so the owner can see what
  the provider recognized; neither that text nor assistant transcription is persisted.

The three realtime observations are fixed to the actual surfaces:

| Realtime run | Surface | Scenario |
|---|---|---|
| RT1 | Hermes WebUI, desktop browser | cafe |
| RT2 | Hermes WebUI, iPhone browser | directions |
| RT3 | Hermes WebUI, iPhone browser | plans |

The terminal prototype remains a provider conformance tool only. It cannot collect benchmark
observations and must label every invocation `PROBE_ONLY`.

## Owner authorization and immutable bounds

The owner authorized exactly:

> Утверждаю C2 R&D с Gemini Live Free Tier через независимый provider-адаптер. Денежный
> конверт — $0 в неделю, платный fallback запрещён. Разрешаю передавать мои тестовые
> аудиозаписи в Gemini Live для трёх preregistered realtime-сессий и понимаю, что данные
> Free Tier могут использоваться Google для улучшения продуктов. Личные тексты не передавать;
> при 429 или исчерпании квоты явно переходить в H2.6 async.

Hard bounds:

- provider: `gemini-3.1-flash-live-preview` behind the local `RealtimeVoiceProvider` contract;
- budget: USD 0/week; any verified charge above zero stops C2;
- no paid retry, fallback or alternate paid provider;
- exactly three benchmark realtime sessions; connectivity probes are separately labeled and do
  not count;
- no personal texts, learner profile, due list, notes, corpus passages or song lyrics in the Live
  system instruction or session content;
- no raw audio or transcript persistence;
- no FSRS, `review_log`, grade, mastery, progress, analytics or agent-memory write;
- on `429`/quota exhaustion the realtime path stops and names H2.6 async as the available mode.

## Readiness

- H2.6: CLOSED; two owner async sessions, 205.28 seconds total, usefulness 5/5.
- Existing async sessions do not contain user-turns/minute, so they are contextual evidence only
  and are not reused as the three control observations.
- Recommended four-week async baseline is absent. Maturity is `UNDERPOWERED`, allowed under D6-A.
- H1/H2 monitors contain no active stop condition affecting C2 at freeze time.

## Research question and primary endpoint

Does realtime Hebrew dialogue increase valid user turns per minute by at least 1.5x over the
existing async H2.6 loop without violating the zero-dollar envelope or making the dialogue
unusable?

`valid_user_turn` is one completed Hebrew learner utterance that causes one completed assistant
response. For realtime, the prototype counts completed model turns after user audio begins. For
async, the owner counts confirmed transcript turns in H2.6. Empty/noise-only VAD activations,
retries caused solely by transport failure and assistant-only opening speech are excluded.

Primary calculation:

`mean(realtime valid_user_turns / active_minutes) / mean(async confirmed_turns / active_minutes)`

Success requires the ratio to be at least 1.5 and all three realtime sessions to have verified
actual cost USD 0.

## Matched six-session design

Each session lasts 8 minutes of active dialogue. Use headphones. The fixed order limits simple
practice/fatigue bias while retaining matched scenarios:

| Run | Mode | Scenario | Neutral task |
|---:|---|---|---|
| 1 | async | cafe | Order food, ask two questions, resolve one misunderstanding |
| 2 | realtime | cafe | Same task, new wording |
| 3 | realtime | directions | Ask for a route, clarify two landmarks, summarize it |
| 4 | async | directions | Same task, new wording |
| 5 | async | plans | Arrange a meeting time and negotiate one change |
| 6 | realtime | plans | Same task, new wording |

The fixed system instruction requires simple modern Hebrew, short turns, one question at a time,
supportive correction only when communication breaks, no pronunciation grading and no claims
about learner state. It contains no personal material.

## Secondary outcomes

The product surface records only content-free operational observations:

- transport incidents count;
- completed assistant turns;
- explicit presses of “Gemini меня не понял”;
- session duration and surface (`desktop_web` or `iphone_web`);
- provider usage counters when returned;
- whether the account-level Free Tier guard remains valid after the three-run packet.

Input and output transcriptions are rendered ephemerally for transparency and are erased from the
page when the session ends. They are never included in benchmark JSON, logs or analytics.

## Failure and stop conditions

- verified cost above USD 0;
- `429` or quota exhaustion: stop the affected realtime attempt, record a content-free incident,
  do not retry immediately and offer H2.6 async;
- personal text enters a Live payload;
- raw audio or transcript is written to disk/log;
- zero completed assistant turns in at least two realtime sessions;
- no working prototype within two weeks;
- any learner-state write or pronunciation-grade claim.

An interrupted realtime run is not silently replaced. It is recorded as an incident and repeated
only on another day if the total number of successful benchmark realtime sessions remains below
three and the Free Tier is available. The report lists attempts and successful sessions separately.

## Evidence and interpretation

The tracked report contains aggregates only. Session JSON under `.tmp/h3-c2-results/` contains
durations, counts, ratings, token counts, typed incident codes and cost verification, but no audio,
transcripts or semantic content. A result before the recommended baseline remains
`UNDERPOWERED`, even if the numerical success threshold passes.
