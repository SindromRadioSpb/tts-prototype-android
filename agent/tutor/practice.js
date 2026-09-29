"use strict";
const {randomUUID}=require('node:crypto');
const {fail}=require('./response');
const MARKS=/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
const TOKEN=/[\u05D0-\u05EA][\u05D0-\u05EA\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*/g;
const normalize=text=>text.normalize('NFD').replace(MARKS,'').trim();
function build(context,question){
 const source=context.source.excerpt;
 if(source.length>600)fail('practice_unavailable');
 const tokens=[...source.matchAll(TOKEN)];
 const candidates=tokens.filter(t=>normalize(t[0]).length>=3 && !/["׳״']/u.test(source[t.index-1]||'') && !/["׳״']/u.test(source[t.index+t[0].length]||''));
 if(tokens.length<3||!candidates.length)fail('practice_unavailable');
 const mentioned=new Set([...question.matchAll(TOKEN)].map(t=>normalize(t[0])));
 const chosen=candidates.find(t=>mentioned.has(normalize(t[0]))) || candidates.reduce((a,b)=>normalize(a[0]).length>=normalize(b[0]).length?a:b);
 const expected=chosen[0], target=normalize(expected);
 // Mask every matching occurrence, so another copy cannot reveal the answer.
 const masked=source.replace(TOKEN,word=>normalize(word)===target?'＿＿＿':word);
 return {id:randomUUID(),kind:'source_recall',checker_version:'source-match.1',context_id:context.context_id,
  excerpt_digest:context.excerpt_digest,revision_id:context.source.revision_id,masked,expected,
  source_seen:true,explanation_seen:true,niqqud_scored:false};
}
function descriptor(row){
 const challenge=JSON.parse(row.challenge_json), receipt=row.receipt_json?JSON.parse(row.receipt_json):null;
 const {expected,...safe}=challenge;
 return {...safe,proposal_state:row.proposal_state||'accepted',hint_seen:!!row.hint_seen,receipt,...(row.hint_seen||receipt?{expected}:{} )};
}
function evaluate(challenge,{answer,skipped},hintSeen){
 return {challenge_id:challenge.id,context_id:challenge.context_id,excerpt_digest:challenge.excerpt_digest,
  checker_version:challenge.checker_version,outcome:skipped?'skipped':normalize(answer)===normalize(challenge.expected)?'source_match':'source_diff',
  answer:skipped?'':answer,expected:challenge.expected,source_seen:true,explanation_seen:true,hint_seen:!!hintSeen,
  evidence_kind:'post_explanation_source_recall',canonical_review_written:false,niqqud_scored:false};
}
module.exports={build,descriptor,evaluate,normalize};
