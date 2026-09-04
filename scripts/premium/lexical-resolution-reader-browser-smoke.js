#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

function arg(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

(async () => {
  const baseUrl = arg('base-url', 'http://127.0.0.1:3107').replace(/\/$/, '');
  const expectedVersion = arg('expected-version', '');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error)));
  try {
    await page.goto(baseUrl + '/library.html?lexres-reader-smoke=1#room=mytexts', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ReaderMorph && window.LexicalResolutionCore && window.LexicalResolutionService);
    await page.evaluate(() => window.appSetLocale('ru'));
    const servedVersion = await page.evaluate(() => window.APP_VERSION || String(document.querySelector('#roomFooterVersion')?.textContent || '').replace(/^v/, ''));
    if (expectedVersion) assert.equal(servedVersion, expectedVersion);

    await page.evaluate(() => {
      const row = {
        he: 'ישראל כאן', he_niqqud: 'יִשְׂרָאֵל כָּאן', ru: 'Израиль здесь',
        _v3_textId: 'reader-text', _v3_sentenceId: 'reader-sentence', _v3_orderIndex: 7
      };
      const mount = document.createElement('div');
      mount.id = 'lexres-reader-smoke-mount';
      mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0"><td data-col="he">ישראל כאן</td><td data-col="niqqud">יִשְׂרָאֵל כָּאן</td></tr></tbody></table>';
      document.body.append(mount);
      window.__lexresReaderOccurrence = null;
      window.__lexresReaderHandle = window.ReaderMorph.attach(mount, {
        getRow: () => row,
        getTextKey: () => 'reader-text-key',
        saveUserMeaning: async () => { throw new Error('OWNER_RESOLUTION_MUST_NOT_DUAL_WRITE_WORD_STUDY'); },
        lookupLexicalResolution: async (_card, occurrence) => {
          window.__lexresReaderOccurrence = occurrence;
          try {
            const item = { ...occurrence, lp_occurrence_id: 'lpro:reader-text:reader-sentence:0' };
            const sourceAnchor = await window.LexicalResolutionCore.sourceAnchor(item);
            const event = {
              id: 'reader-owner-1', occurrence_id: item.lp_occurrence_id, text_id: 'reader-text', sentence_id: 'reader-sentence',
              word_offset: 0, text_key: 'reader-text-key', order_index: 7, surface_norm: 'ישראל', source_anchor: sourceAnchor,
              action: 'manual_correction', chosen_analysis: { lemma: 'ישראל', lp_pos: 'propernoun', meaning_ru: 'Израиль' },
              candidate_fingerprint: 'sha256:reader-smoke', actor_kind: 'owner', created_at: '2026-09-04T00:00:00.000Z'
            };
            window.__lexresReaderProjection = await window.LexicalResolutionService.projectExactOccurrence(occurrence, [event], window.LexicalResolutionCore);
            return window.__lexresReaderProjection;
          } catch (error) {
            window.__lexresReaderProjectionError = String(error && error.stack || error);
            throw error;
          }
        }
      });
    });

    await page.locator('#lexres-reader-smoke-mount td[data-col="niqqud"] .rm-w').first().click();
    await page.waitForSelector('.rm-sheet.rm-open .rm-meaning');
    const result = await page.evaluate(() => ({
      meaning: document.querySelector('.rm-sheet.rm-open .rm-meaning')?.textContent || '',
      badge: document.querySelector('.rm-sheet.rm-open .rm-prov')?.textContent || '',
      rows: document.querySelector('.rm-sheet.rm-open .rm-rows')?.textContent || '',
      hasMeaningEditor: !!document.querySelector('.rm-sheet.rm-open [data-rm-meaning-edit], .rm-sheet.rm-open [data-rm-meaning-add]'),
      occurrence: window.__lexresReaderOccurrence,
      projection: window.__lexresReaderProjection,
      projectionError: window.__lexresReaderProjectionError || '',
      serviceMethods: Object.keys(window.LexicalResolutionService || {})
    }));
    assert.match(result.meaning, /Израиль/, JSON.stringify(result));
    assert.match(result.meaning, /проверено/);
    assert.equal(result.badge, 'проверено вами');
    assert.match(result.rows, /имя собственное/);
    assert.equal(result.hasMeaningEditor, false);
    assert.deepEqual(result.occurrence, {
      text_id: 'reader-text', sentence_id: 'reader-sentence', order_index: 7, word_offset: 0,
      surface: 'ישראל', niqqud: 'יִשְׂרָאֵל', text_key: 'reader-text-key',
      sentence_he: 'ישראל כאן', sentence_he_niqqud: 'יִשְׂרָאֵל כָּאן', sentence_ru: 'Израиль здесь'
    });
    assert.deepEqual(errors, []);
    console.log('lexical-resolution-reader-browser-smoke: PASS', JSON.stringify({ version: servedVersion, meaning: result.meaning, badge: result.badge }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
