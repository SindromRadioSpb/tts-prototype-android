#!/usr/bin/env node
// Aggregate statistics for subtitle tracks extracted from one local video.
// Prints counts and timing only; cue text is never printed (source subtitles are third-party works).
//
// Usage:
//   ffmpeg -v error -y -i <video> -map 0:s:<n> -c:s srt <dir>/<name>.srt ...
//   node subtitle-track-stats.js --dir=<dir> --text=heb.srt --translation=rus.srt \
//        [--forced=heb_forced.srt] [--sdh=heb_sdh.srt]
'use strict';
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  return match ? [match[1], match[2]] : [arg, true];
}));
if (!args.dir || !args.text || !args.translation) {
  console.error('required: --dir, --text, --translation');
  process.exit(2);
}

const CONTROL = /[‎‏‪-‮⁦-⁩]/;
const CONTROL_ALL = /[‎‏‪-‮⁦-⁩]/g;
const TAG = /\{\\[^}]*\}|<\/?[a-z][^>]*>/i;
const bracketed = (cue) => /^\s*\[/.test(cue.text.replace(CONTROL_ALL, ''));

function seconds(stamp) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(stamp);
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
}
function parse(name) {
  const raw = fs.readFileSync(path.join(args.dir, name), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  return raw.split(/\n\n+/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => line.includes('-->'));
    if (at < 0) return null;
    const [a, z] = lines[at].split('-->');
    return { start: seconds(a), end: seconds(z), text: lines.slice(at + 1).join('\n') };
  }).filter(Boolean);
}
const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const matches = (a, b) => overlap(a, b) / Math.max(0.001, Math.min(a.end - a.start, b.end - b.start)) >= 0.3;
const clock = (s) => Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0');

function summary(label, cues) {
  const time = cues.reduce((sum, cue) => sum + Math.max(0, cue.end - cue.start), 0);
  return {
    track: label,
    cues: cues.length,
    first: clock(cues[0].start),
    last: clock(cues[cues.length - 1].end),
    cue_time: clock(time),
    with_bidi_controls: cues.filter((cue) => CONTROL.test(cue.text)).length,
    with_ass_or_html_tags: cues.filter((cue) => TAG.test(cue.text)).length,
    whole_cue_square_brackets: cues.filter(bracketed).length,
  };
}

const text = parse(args.text);
const translation = parse(args.translation);
const forced = args.forced ? parse(args.forced) : null;
const sdh = args.sdh ? parse(args.sdh) : null;

const report = { tracks: [summary('text', text), summary('translation', translation)] };
if (forced) report.tracks.push(summary('forced', forced));
if (sdh) report.tracks.push(summary('sdh', sdh));

let one = 0, many = 0, none = 0;
const deltas = [];
const shared = new Map();
for (const cue of text) {
  const hits = translation.filter((candidate) => matches(cue, candidate));
  if (!hits.length) none++;
  else if (hits.length === 1) { one++; deltas.push(Math.abs(cue.start - hits[0].start)); }
  else many++;
  hits.forEach((hit) => shared.set(hit, (shared.get(hit) || 0) + 1));
}
deltas.sort((a, b) => a - b);
report.alignment_text_to_translation = {
  exactly_one: one,
  several: many,
  none,
  translation_cues_covering_several_text_cues: [...shared.values()].filter((count) => count > 1).length,
  start_delta_median_seconds: Number((deltas[Math.floor(deltas.length / 2)] || 0).toFixed(2)),
  start_delta_p90_seconds: Number((deltas[Math.floor(deltas.length * 0.9)] || 0).toFixed(2)),
};

if (forced) {
  const inside = forced.filter((cue) => text.some((candidate) => matches(cue, candidate))).length;
  const textInForced = text.filter((cue) => forced.some((candidate) => matches(cue, candidate))).length;
  const bracketedCues = translation.filter(bracketed);
  report.non_target_speech_signals = {
    forced_cues_inside_text_track: inside,
    text_cues_overlapping_forced: textInForced,
    text_cues_overlapping_forced_share: Number((textInForced / text.length).toFixed(3)),
    translation_bracketed_cues: bracketedCues.length,
    translation_bracketed_overlapping_forced: bracketedCues.filter((cue) => forced.some((candidate) => matches(cue, candidate))).length,
  };
}
if (sdh) {
  report.sdh_extra_cues_vs_text = sdh.filter((cue) => !text.some((candidate) => matches(cue, candidate))).length;
}
console.log(JSON.stringify(report, null, 2));
