'use strict';
const fs = require('node:fs');

function readReview(file, lessonId) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return { review: null, bytes: null };
    throw error;
  }
  const review = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (!review || review.lessonId !== lessonId) throw new Error('Review lesson identity mismatch: ' + lessonId);
  if (!review.items || typeof review.items !== 'object' || Array.isArray(review.items)) throw new Error('Invalid review items: ' + lessonId);
  return { review, bytes };
}

function approvedAudio(lessonId, items, review) {
  if (review && review.lessonId !== lessonId) throw new Error('Review lesson identity mismatch: ' + lessonId);
  const entries = [], stale = [];
  for (const item of items) {
    const mark = review?.items?.[item.ref];
    if (mark?.status !== 'ok') continue;
    if (mark.key !== item.assetKey) { stale.push(item.ref); continue; }
    entries.push([item.id, item.assetKey]);
  }
  return { audio: Object.fromEntries(entries), stale };
}

module.exports = { readReview, approvedAudio };
