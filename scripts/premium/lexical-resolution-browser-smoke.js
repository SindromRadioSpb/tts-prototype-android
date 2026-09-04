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
  const locale = arg('locale', 'ru');
  const viewportWidth = Number(arg('width', '380'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error)));

  try {
    await page.goto(baseUrl.replace(/\/$/, '') + '/library.html?lexres-smoke=1#room=mytexts', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LexicalResolutionUI && window.ObsidianLexicalPreview && window.LexicalResolutionService);
    await page.evaluate((nextLocale) => window.appSetLocale(nextLocale), locale);
    const servedVersion = await page.evaluate(() => window.APP_VERSION || String(document.querySelector('#roomFooterVersion')?.textContent || '').replace(/^v/, ''));
    if (expectedVersion) assert.equal(servedVersion, expectedVersion);

    await page.evaluate(async () => {
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
      const savedItem = {
        lp_occurrence_id: 'lpro:T1:R0:0', text_key: 'smoke-text', order_index: 0, word_offset: 0,
        surface: 'נטע', niqqud: 'נֶטַע', sentence_he: 'נטע באה', sentence_he_niqqud: 'נֶטַע בָּאָה'
      };
      const savedEvent = {
        id: 'owner-smoke-1', occurrence_id: savedItem.lp_occurrence_id, text_id: 'T1', sentence_id: 'R0', word_offset: 0,
        text_key: 'smoke-text', order_index: 0, surface_norm: 'נטע', source_anchor: await window.LexicalResolutionCore.sourceAnchor(savedItem),
        action: 'manual_correction', chosen_analysis: { lemma: 'נטע', lp_pos: 'propernoun', pealim_id: '7361', root: 'נטע', meaning_ru: 'Нета' },
        candidate_fingerprint: 'sha256:manual-smoke', actor_kind: 'owner', created_at: '2026-09-04T00:00:00.000Z'
      };
      const localDb = {
        exportBundle: async () => bundle,
        listLexicalResolutionEventsForText: async () => [savedEvent],
        appendLexicalResolutionEvent: async () => { throw new Error('SMOKE_MUST_NOT_WRITE'); },
        appendLexicalResolutionBatch: async () => { throw new Error('SMOKE_MUST_NOT_WRITE'); }
      };
      const localized = (key, fallback) => { const value = window.t && window.t(key); return value && value !== key ? value : fallback; };
      window.LexicalResolutionUI.open({ item: { id: 'T1', title: '82-context layout smoke' }, localDb, t: localized });
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
        candidateText: candidate && candidate.textContent,
        posTag: document.querySelector('[name="lp_pos"]')?.tagName,
        posValue: document.querySelector('[name="lp_pos"]')?.value,
        pealimValue: document.querySelector('[name="pealim_ref"]')?.value,
        pealimOpen: document.querySelector('[data-pealim-open]')?.href,
        meaningValue: document.querySelector('[name="meaning_ru"]')?.value,
        priorAnalysis: document.querySelector('[data-prior-analysis]')?.textContent,
        title: document.querySelector('.lexres-title')?.textContent,
        stats: Array.from(document.querySelectorAll('.lexres-count')).map((node) => node.textContent.trim()),
        reasonLabels: Array.from(document.querySelectorAll('.lexres-reason')).map((node) => node.textContent.trim()),
        actions: Array.from(document.querySelectorAll('.lexres-actions button')).map((node) => node.textContent.trim()),
        searchTag: document.querySelector('.lexres-filter input[type="search"]')?.tagName,
        reasonFilterTag: document.querySelector('.lexres-filter select')?.tagName,
        tooltipCount: document.querySelectorAll('[role="tooltip"]').length,
        brokenTooltipRefs: Array.from(document.querySelectorAll('[aria-describedby]')).filter((node) => !document.getElementById(node.getAttribute('aria-describedby'))).length,
        unlabelledEditorFields: Array.from(document.querySelectorAll('.lexres-form input, .lexres-form select')).filter((node) => !node.labels || !node.labels.length).length,
        undersizedPrimaryTargets: Array.from(document.querySelectorAll('.lexres-close, .lexres-button, .lexres-help, .lexres-context input, .lexres-technical summary, .lexres-pealim-open')).filter((node) => {
          if (!node.checkVisibility()) return false;
          const rect = node.getBoundingClientRect(); return rect.width < 24 || rect.height < 24;
        }).length,
        visibleTechnicalIds: Array.from(document.querySelectorAll('.lexres-technical code')).filter((node) => node.checkVisibility()).length,
        contextInputTypes: Array.from(document.querySelectorAll('.lexres-context input')).map((node) => node.type),
        selectedCount: document.querySelector('.lexres-selected-count')?.textContent,
        dialogText: document.querySelector('.lexres-dialog')?.textContent
      };
    });
    assert.equal(before.editorBeforeContexts, true);
    assert.ok(before.editorTop < before.contextsTop, JSON.stringify(before));
    assert.ok(before.listScrollHeight > before.listClientHeight, JSON.stringify(before));
    assert.match(before.candidateText || '', /נטע.*pealim\.com\/ru\/dict\/7361/);
    assert.equal(before.posTag, 'SELECT');
    assert.equal(before.posValue, 'propernoun');
    assert.match(before.pealimValue || '', /pealim\.com\/ru\/dict\/7361/);
    assert.match(before.pealimOpen || '', /pealim\.com\/ru\/dict\/7361/);
    assert.equal(before.meaningValue, 'Нета');
    assert.ok(before.priorAnalysis);
    const expected = {
      ru: { title: 'Слова, требующие проверки', stats: ['Нужно проверить', 'Проверено', 'Группы слов'], reason: 'Несколько вариантов', actions: ['Сохранить этот разбор', 'Вернуться позже', 'Ни один вариант не подходит'], impact: 'Что изменится', impactActions: ['Вернуться к проверке', 'Сохранить изменения'] },
      en: { title: 'Words that need review', stats: ['Needs review', 'Reviewed', 'Word groups'], reason: 'Several possible analyses', actions: ['Save this analysis', 'Come back later', 'None of the suggestions fit'], impact: 'What will change', impactActions: ['Back to review', 'Save changes'] },
      he: { title: 'מילים שדורשות בדיקה', stats: ['דורשים בדיקה', 'נבדקו', 'קבוצות מילים'], reason: 'כמה ניתוחים אפשריים', actions: ['שמירת הניתוח הזה', 'חזרה מאוחר יותר', 'אף הצעה אינה מתאימה'], impact: 'מה עומד להשתנות', impactActions: ['חזרה לבדיקה', 'שמירת השינויים'] }
    }[locale];
    assert.ok(expected, 'Unsupported smoke locale: ' + locale);
    assert.equal(before.title, expected.title);
    expected.stats.forEach((label) => assert.ok(before.stats.some((value) => value.includes(label)), JSON.stringify(before.stats)));
    assert.ok(before.reasonLabels.some((value) => value.includes(expected.reason)), JSON.stringify(before.reasonLabels));
    expected.actions.forEach((label) => assert.ok(before.actions.includes(label), JSON.stringify(before.actions)));
    assert.equal(before.searchTag, 'INPUT');
    assert.equal(before.reasonFilterTag, 'SELECT');
    assert.ok(before.tooltipCount >= 10, String(before.tooltipCount));
    assert.equal(before.brokenTooltipRefs, 0);
    assert.equal(before.unlabelledEditorFields, 0);
    assert.equal(before.undersizedPrimaryTargets, 0);
    assert.equal(before.visibleTechnicalIds, 0);
    assert.ok(before.contextInputTypes.length > 2 && before.contextInputTypes.every((type) => type === 'checkbox'), JSON.stringify(before.contextInputTypes));
    assert.match(before.selectedCount || '', /1/);
    assert.doesNotMatch(before.dialogText || '', /identity_guarded|unknown_pos|skipped_token|Occurrence|кластеры|impact|append-only|receipt|audit/i);

    await page.locator('.lexres-filter input[type="search"]').fill('совпадений нет');
    await page.waitForSelector('.lexres-list .lexres-empty');
    await page.locator('.lexres-filter input[type="search"]').fill('Нета пришла');
    await page.waitForSelector('.lexres-cluster[open]');

    const help = page.locator('.lexres-count .lexres-help').first();
    await help.focus();
    await page.waitForTimeout(200);
    const tooltipState = await help.evaluate((node) => ({
      opacity: getComputedStyle(node.parentElement.querySelector('[role="tooltip"]')).opacity,
      activeClass: document.activeElement && document.activeElement.className,
      focusWithin: node.parentElement.matches(':focus-within')
    }));
    assert.equal(tooltipState.opacity, '1', JSON.stringify(tooltipState));

    // Default is the first exact occurrence. Add the second and prove that the
    // impact preview contains exactly this arbitrary two-row subset.
    await page.locator('.lexres-context input[type="checkbox"]').nth(1).check();
    await page.locator('.lexres-actions .lexres-primary').first().scrollIntoViewIfNeeded();
    await page.locator('.lexres-actions .lexres-primary').first().click();
    await page.waitForSelector('.lexres-impact');
    const after = await page.evaluate(() => {
      const impact = document.querySelector('.lexres-impact');
      const contexts = document.querySelector('.lexres-contexts');
      return {
        count: document.querySelector('.lexres-impact-count').textContent,
        ids: document.querySelectorAll('.lexres-impact-list code').length,
        title: document.querySelector('.lexres-impact-title').textContent,
        actions: Array.from(document.querySelectorAll('.lexres-impact-actions button')).map((node) => node.textContent.trim()),
        impactBeforeContexts: impact.compareDocumentPosition(contexts) === Node.DOCUMENT_POSITION_FOLLOWING,
        impactTop: impact.getBoundingClientRect().top,
        contextsTop: contexts.getBoundingClientRect().top
      };
    });
    assert.match(after.count, /2/);
    assert.equal(after.title, expected.impact);
    assert.deepEqual(after.actions, expected.impactActions);
    assert.equal(after.ids, 2);
    assert.equal(after.impactBeforeContexts, true);
    assert.ok(after.impactTop < after.contextsTop, JSON.stringify(after));

    if (screenshot) {
      const target = path.resolve(screenshot);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target, fullPage: false });
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.lexres-dialog', { state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('lexical-resolution-browser-smoke: PASS', JSON.stringify({
      version: servedVersion, locale, viewportWidth, title: before.title,
      tooltips: before.tooltipCount, unlabelledEditorFields: before.unlabelledEditorFields,
      undersizedPrimaryTargets: before.undersizedPrimaryTargets, contextViewport: before.listClientHeight,
      contextContent: before.listScrollHeight, impact: after.count
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
