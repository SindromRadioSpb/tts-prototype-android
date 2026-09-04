'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/lexical-resolution-core.js');

async function item() {
  const value = { lp_occurrence_id:'lpro:t:s:2', text_key:'tk', row_id:'s', order_index:3, word_offset:2, surface:'נטע', niqqud:'נֶטַע', sentence_he:'בית נטע', alternatives:[{pealim_id:'7361',lemma:'נטע',pos:'noun'}], candidate_evidence:[] };
  value.source_anchor = await Core.sourceAnchor(value);
  value.candidate_fingerprint = await Core.candidateFingerprint(value);
  return value;
}
function event(i, action, base, extra={}) { return { id:'e'+i, occurrence_id:base.lp_occurrence_id, text_id:'t', sentence_id:'s', word_offset:2, text_key:'tk', order_index:3, surface_norm:'נטע', source_anchor:base.source_anchor, candidate_fingerprint:base.candidate_fingerprint, morph_model_version:'m1', actor_kind:'owner', action, chosen_analysis:{lemma:'נֶטַע',lp_pos:'propernoun'}, created_at:`2026-09-04T00:00:0${i}Z`, ...extra }; }

test('folds append-only decisions through resolved, deferred, rejected, clear and stale', async () => {
  const base=await item();
  assert.equal(Core.evaluate(base,[]).state,'unresolved');
  const confirmed=event(1,'confirm_candidate',base);
  assert.equal(Core.evaluate(base,[confirmed]).state,'resolved');
  assert.equal(Core.applyOverlay(base,Core.evaluate(base,[confirmed])).verification_state,'owner_confirmed');
  assert.equal(Core.evaluate(base,[confirmed,event(2,'defer',base)]).state,'deferred');
  assert.equal(Core.evaluate(base,[event(3,'reject_all',base)]).state,'rejected_all');
  assert.equal(Core.evaluate(base,[confirmed,event(4,'clear',base)]).state,'unresolved');
  assert.equal(Core.evaluate({...base,source_anchor:'sha256:new'},[confirmed]).stale_reason,'source_anchor_changed');
  assert.equal(Core.evaluate({...base,candidate_fingerprint:'sha256:new'},[confirmed]).stale_reason,'candidate_set_changed');
});

test('manual correction survives model/candidate change but not source-anchor change', async () => {
  const base=await item(); const manual=event(1,'manual_correction',base,{morph_model_version:'old'});
  assert.equal(Core.evaluate({...base,morph_model_version:'new',candidate_fingerprint:'sha256:new'},[manual]).state,'resolved');
  assert.equal(Core.evaluate({...base,source_anchor:'sha256:new'},[manual]).state,'stale');
});

test('rejects non-owner actors and incomplete confirmed analysis', async () => {
  const base=await item();
  assert.throws(()=>Core.normalizeEvent(event(1,'confirm_candidate',base,{actor_kind:'agent'})),/LEXICAL_ACTOR_INVALID/);
  assert.throws(()=>Core.normalizeEvent(event(1,'confirm_candidate',base,{chosen_analysis:{lemma:'נטע'}})),/LEXICAL_CHOSEN_ANALYSIS_REQUIRED/);
});
