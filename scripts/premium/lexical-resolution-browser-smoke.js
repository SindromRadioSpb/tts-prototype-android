#!/usr/bin/env node
'use strict';

// Read-only browser smoke for the owner morphology review layout. It injects a
// synthetic 82-occurrence cluster through the public UI API, stages one exact
// impact, and never calls an append method.

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

function arg(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

(async () => {
  const baseUrl = arg('base-url', 'http://127.0.0.1:3107');
  const expectedVersion = arg('expected-version', '');
  const screenshot = arg('screenshot', '');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error)));

  try {
    await page.goto(baseUrl.replace(/\/$/, '') + '/library.html?lexres-smoke=1#room=mytexts', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LexicalResolutionUI && window.ObsidianLexicalPreview && window.LexicalResolutionService);
    const servedVersion = await page.evaluate(() => window.APP_VERSION || String(document.querySelector('#roomFooterVersion')?.textContent || '').replace(/^v/, ''));
    if (expectedVersion) assert.equal(servedVersion, expectedVersion);

    await page.evaluate(() => {
      const rows = [];
      const morph = [];
      const occurrences = [];
      for (let index = 0; index < 82; index++) {
        const rowId = 'R' + index;
        rows.push({ row_id: rowId, order_index: index, hebrew_plain: 'נטע באה', hebrew_niqqud: 'נֶטַע בָּאָה', russian: 'Нета пришла' });
        morph.push({ text_id: 'T1', sentence_id: rowId, model_version: 'dicta-smoke', tokens: [
          { word: 'נטע', niqqud: 'נֶטַע', lemma: 'נטע', posDicta: 'noun', kind: 'propernoun', ambiguous: true,
            alts: [{ lemma: 'נטע', pos: 'noun', pealim_id: '7361', meaning: 'растение' }] }
        ] });
        occurrences.push({ note_id: 'N1', text_id: 'T1', sentence_id: rowId, word_offset: 0, surface: 'נטע' });
      }
      const bundle = {
        library: { texts: [{ text_id: 'T1', text_key: 'smoke-text', title: '82-context layout smoke', rows }] },
        notes_advanced: {
          notes: [{ id: 'N1', note_type: 'word_study', gen_dedup_key: 'ff:נטע#noun', source: 'autogen', confidence: 0.9,
            body_json: JSON.stringify({ word: 'נטע', niqqud_variant: 'נֶטַע', lemma: 'נטע', pos: 'noun', root: 'נטע', meaning: 'растение', pealim_id: '7361' }) }],
          occurrences,
          sentence_morph: morph
        }
      };
      const localDb = {
        exportBundle: async () => bundle,
        listLexicalResolutionEventsForText: async () => [],
        appendLexicalResolutionEvent: async () => { throw new Error('SMOKE_MUST_NOT_WRITE'); },
        appendLexicalResolutionBatch: async () => { throw new Error('SMOKE_MUST_NOT_WRITE'); }
      };
      window.LexicalResolutionUI.open({ item: { id: 'T1', title: '82-context layout smoke' }, localDb, t: (_, fallback) => fallback });
    });

    await page.waitForSelector('.lexres-cluster[open] .lexres-editor');
    const before = await page.evaluate(() => {
      const editor = document.querySelector('.lexres-editor');
      const contexts = document.querySelector('.lexres-contexts');
      const list = document.querySelector('.lexres-context-list');
      const candidate = document.querySelector('.lexres-candidate');
      return {
        editorBeforeContexts: editor.compareDocumentPosition(contexts) === Node.DOCUMENT_POSITION_FOLLOWING,
        editorTop: editor.getBoundingClientRect().top,
        contextsTop: contexts.getBoundingClientRect().top,
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        candidateText: candidate && candidate.textContent
      };
    });
    assert.equal(before.editorBeforeContexts, true);
    assert.ok(before.editorTop < before.contextsTop, JSON.stringify(before));
    assert.ok(before.listScrollHeight > before.listClientHeight, JSON.stringify(before));
    assert.match(before.candidateText || '', /נטע.*noun.*#7361/);

    await page.locator('.lexres-actions .lexres-primary').first().scrollIntoViewIfNeeded();
    await page.locator('.lexres-actions .lexres-primary').first().click();
    await page.waitForSelector('.lexres-impact');
    const after = await page.evaluate(() => {
      const impact = document.querySelector('.lexres-impact');
      const contexts = document.querySelector('.lexres-contexts');
      return {
        count: document.querySelector('.lexres-impact-count').textContent,
        ids: document.querySelectorAll('.lexres-impact-list code').length,
        impactBeforeContexts: impact.compareDocumentPosition(contexts) === Node.DOCUMENT_POSITION_FOLLOWING,
        impactTop: impact.getBoundingClientRect().top,
        contextsTop: contexts.getBoundingClientRect().top
      };
    });
    assert.match(after.count, /1/);
    assert.equal(after.ids, 1);
    assert.equal(after.impactBeforeContexts, true);
    assert.ok(after.impactTop < after.contextsTop, JSON.stringify(after));

    if (screenshot) {
      const target = path.resolve(screenshot);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target, fullPage: false });
    }
    assert.deepEqual(errors, []);
    console.log('lexical-resolution-browser-smoke: PASS', JSON.stringify({ version: servedVersion, before, after }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
