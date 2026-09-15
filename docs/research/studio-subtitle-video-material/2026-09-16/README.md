# Subtitle-track video material — source evidence, 2026-09-16

Purpose: ground `docs/planning/STUDIO_SUBTITLE_VIDEO_MATERIAL_DECISION_PACKET_2026_09_16.md` in one real
owner-supplied local video before implementation.

- Source: owner-supplied local MKV, Israeli TV drama episode, 2,181,255,313 bytes, 2672.68 s. The file,
  its subtitle text and any dialogue excerpts are third-party content and are **not** committed.
- Repository commit at measurement: `1661a0c5`.
- Tools: ffmpeg/ffprobe 8.1 (gyan.dev essentials build), Node v22.22.1, Windows 11.
- Evidence status: AUTOMATED LOCAL MEASUREMENT on one file; not a product result.

## Commands

```sh
ffprobe -v error -show_entries "format=duration,size,format_name:stream=index,codec_type,codec_name,channels,width,height:stream_tags=language,title:stream_disposition=default,forced,hearing_impaired,attached_pic" -of json <video>
ffprobe -v error -select_streams v:0 -show_entries "stream=profile,level,pix_fmt,avg_frame_rate,field_order,color_transfer:stream_tags=BPS" -of json <video>
ffmpeg -v error -y -i <video> -map 0:s:0 -c:s srt rus.srt -map 0:s:2 -c:s srt heb_forced.srt -map 0:s:3 -c:s srt heb.srt -map 0:s:4 -c:s srt heb_sdh.srt
node subtitle-track-stats.js --dir=<dir> --text=heb.srt --translation=rus.srt --forced=heb_forced.srt --sdh=heb_sdh.srt
```

The extraction of four text tracks from the 2.18 GB file took 9.9 s. `subtitle-track-stats.js` prints
aggregates only.

## Streams

| # | Type | Codec | Language | Title | Flags |
|---|---|---|---|---|---|
| 0 | video | h264 Main L4.0, 1920×1080, 25 fps, yuv420p, bt709, ≈4.79 Mbit/s | heb | — | default |
| 1 | audio | ac3 5.1, 448 kbit/s | rus | studio dub name | default |
| 2 | audio | eac3 5.1, 640 kbit/s | heb | — | — |
| 3 | audio | eac3 5.1, 640 kbit/s | eng | — | — |
| 4 | subtitle | subrip | rus | — | — |
| 5 | subtitle | subrip | ukr | — | — |
| 6 | subtitle | subrip | heb | Forced | forced flag **not** set |
| 7 | subtitle | subrip | heb | — | — |
| 8 | subtitle | subrip | heb | SDH | hearing_impaired |
| 9–12 | subtitle | subrip | eng | Dubtitle / Forced / SDH variants | 12: hearing_impaired |
| 13 | video | png | — | — | attached_pic (cover) |

## Aggregates (`subtitle-track-stats.js`)

```json
{
  "tracks": [
    { "track": "text", "cues": 445, "first": "0:07.1", "last": "42:02.1", "cue_time": "15:08.6",
      "with_bidi_controls": 445, "with_ass_or_html_tags": 12, "whole_cue_square_brackets": 1 },
    { "track": "translation", "cues": 439, "first": "0:07.1", "last": "43:19.8", "cue_time": "15:15.0",
      "with_bidi_controls": 0, "with_ass_or_html_tags": 32, "whole_cue_square_brackets": 190 },
    { "track": "forced", "cues": 228, "first": "0:07.1", "last": "42:02.1", "cue_time": "7:45.2",
      "with_bidi_controls": 228, "with_ass_or_html_tags": 1, "whole_cue_square_brackets": 70 },
    { "track": "sdh", "cues": 576, "first": "0:07.1", "last": "42:02.1", "cue_time": "19:29.4",
      "with_bidi_controls": 576, "with_ass_or_html_tags": 12, "whole_cue_square_brackets": 251 }
  ],
  "alignment_text_to_translation": {
    "exactly_one": 417, "several": 25, "none": 3,
    "translation_cues_covering_several_text_cues": 31,
    "start_delta_median_seconds": 0.04, "start_delta_p90_seconds": 0.2
  },
  "non_target_speech_signals": {
    "forced_cues_inside_text_track": 228, "text_cues_overlapping_forced": 227,
    "text_cues_overlapping_forced_share": 0.51,
    "translation_bracketed_cues": 190, "translation_bracketed_overlapping_forced": 185
  },
  "sdh_extra_cues_vs_text": 130
}
```

Overlap rule: two cues match when their intersection is at least 30% of the shorter cue.

## Project parsers on the full Hebrew track

- `public/js/captions-parse.js` `parse`: ok, 445 cues merged into 167 segments; segments carry `start` only;
  all 167 contain bidi control characters; 6 contain ASS/HTML tags. By forced-track overlap the merged
  segments split into 68 Hebrew-speech-only, 77 non-Hebrew-only and 22 mixed.
- `public/js/media-package-core.js` `parseSubtitles`: ok, 445 segments with `start_ms`/`end_ms`; text still
  contains bidi control characters.

## Sizes

- Stream-copy video + AAC stereo 160 kbit/s ≈ 1.60 GB + 0.05 GB ≈ 1.65 GB (decimal).
- 400 MiB over 2672.68 s ≈ 1.25 Mbit/s total; 300 MiB ≈ 0.94 Mbit/s total.
