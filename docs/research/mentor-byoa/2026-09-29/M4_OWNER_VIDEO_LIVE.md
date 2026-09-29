# M4 owner-live video check

2026-09-29, authenticated owner Chrome via Kapture MCP. This is a production
browser observation of the existing owner pilot, separate from the isolated
browser fixtures and from the unshipped 3.11.697 candidate.

Material: public Mediatheque item “«Перекрёсток»: Заголовок неважен — просто
послушайте этого человека. Авида Бахар”; the reader's embedded YouTube source
was `4N_-A5VHp2I` (51:16). The first row's tutor panel displayed its actual
Hebrew excerpt with a caption window `00:00:00–00:00:04`; another selected row
displayed `00:00:10–00:00:15`. The panel showed the source and an unchecked
transmission-consent box. No question was submitted to the agent.

The embedded video played from about 0:05 to 0:17. Opening the tutor stopped
playback. After closing the panel, the same YouTube video stayed at 0:17; two
screenshots five seconds apart still showed 0:17 and the same video ID/source.
There was no automatic seek or resume on close. The selected table position
remained visible. Three screenshots (tutor fragment and two paused states) are
retained locally under `.tmp/mentor-owner-video/` and deliberately excluded from
the public repository because the full reader frame contains owner learning
highlights. The selected item, source ID, caption intervals and visible player
times above are the shareable evidence.

This proves the tested item and Chrome session only. It does not prove every
caption binding, mobile-device behavior, assistive technology, or the new
unshipped archive/proposal code in production. Kapture page evaluation was
disabled for this tab, so the player time/state was read from the visible
YouTube controls and repeated screenshots, not from the YouTube JavaScript API.
