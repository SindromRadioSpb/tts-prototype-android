'use strict';
// Owner, 2026-10-18: a finished 68-minute local ASR lived only in tab memory until the build task
// existed; a reload meant recognising the file again. The record must survive and must refuse a
// different file.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const R = require('../public/js/studio-import-resume.js');

const hex = buf => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const store = { sha256Hex: async buf => hex(buf), sha256File: async file => hex(await file.arrayBuffer()) };
const fileOf = (text, name) => { const bytes = Buffer.from(text); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }; };

function finished() {
  const file = fileOf('audio-bytes', 'lecture.m4a');
  const handle = { kind: 'file', name: 'lecture.m4a' };
  return {
    file,
    pending: { kind: 'audio', source: 'lecture.m4a', method: 'local-faster-whisper', text: 'שלום\nעולם', summary: { level: 'ok' } },
    audio: { file, originalFile: file, sourceHandle: handle, buf: new ArrayBuffer(4), name: 'lecture.m4a', isVideo: false,
      sha256: hex('audio-bytes'), durationSec: 4115, localJobId: 'job-1',
      parsed: { language: 'he', segments: [{ text: 'שלום', start: 0, end: 1 }], warnings: [] },
      validation: { timingOk: true, segments: [{ text: 'שלום' }] }, asrMethod: 'local-faster-whisper' },
    handle,
  };
}

test('a finished recognition becomes a record without the live file, buffer or handles inside it', () => {
  const f = finished();
  const rec = R.snapshot(f.pending, f.audio, 'שלום (edited)\nעולם', 1000);
  assert.equal(rec.sha256, f.audio.sha256);
  assert.equal(rec.previewText, 'שלום (edited)\nעולם', 'the owner\'s preview edits are kept');
  assert.equal(rec.fileHandle, f.handle);
  for (const key of ['file', 'originalFile', 'sourceHandle', 'preparedHandle', 'buf']) assert.equal(key in rec.audio, false, key);
  assert.equal(rec.audio.localJobId, 'job-1');
  assert.deepEqual(rec.audio.parsed.segments[0], { text: 'שלום', start: 0, end: 1 });
  assert.equal(rec.size, 11);
});

test('nothing unfinished or unhashed is recorded', () => {
  const f = finished();
  assert.equal(R.snapshot({ kind: 'pdf' }, f.audio), null);
  assert.equal(R.snapshot(f.pending, { ...f.audio, parsed: null }), null);
  assert.equal(R.snapshot(f.pending, { ...f.audio, sha256: null }), null);
});

test('a prepared copy is resumed from its own handle, not the original', () => {
  const f = finished();
  const prepared = fileOf('prepared', 'x-mobile-ready.mp4'), preparedHandle = { name: 'x-mobile-ready.mp4' };
  assert.equal(R.fileHandleOf({ ...f.audio, file: prepared, preparedHandle }), preparedHandle);
  assert.equal(R.fileHandleOf({ ...f.audio, file: prepared }), null, 'unsaved prepared copy has no handle; the owner picks it');
});

test('only the same bytes resume the recognition', async () => {
  const f = finished();
  const rec = R.snapshot(f.pending, f.audio, null, Date.now());
  const same = await R.verifyFile(rec, fileOf('audio-bytes', 'renamed.m4a'), store);
  assert.equal(same.ok, true);
  assert.equal(Buffer.from(same.buf).toString(), 'audio-bytes', 'audio keeps its buffer like the first import');
  assert.equal((await R.verifyFile(rec, fileOf('other-bytes', 'lecture.m4a'), store)).reason, 'SHA_MISMATCH');
  assert.equal((await R.verifyFile(rec, fileOf('short', 'lecture.m4a'), store)).reason, 'SIZE_MISMATCH');
  const restored = R.restoreAudio(rec, f.file, f.handle, same.buf);
  assert.equal(restored.file, f.file);
  assert.equal(restored.sha256, f.audio.sha256);
  assert.equal(restored.localJobId, 'job-1');
});

test('an old record is not offered', () => {
  const f = finished();
  const rec = R.snapshot(f.pending, f.audio, null, 1000);
  assert.equal(R.usable(rec, 1000 + R.MAX_AGE_MS), true);
  assert.equal(R.usable(rec, 1001 + R.MAX_AGE_MS), false);
  assert.equal(R.usable(null), false);
});
