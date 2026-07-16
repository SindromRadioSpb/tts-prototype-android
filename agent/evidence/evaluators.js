"use strict";

// Pure, non-writing closed-answer evaluators. Deliberately imports no repository,
// tutor, planner, provider, reviewer or reducer module.
const C=require("./contracts");
const NIQQUD=/[\u0591-\u05C7]/g;
const FINALS={"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"};
function normalize(value){return String(value==null?"":value).normalize("NFKC").replace(NIQQUD,"").replace(/[ךםןףץ]/g,(x)=>FINALS[x]).replace(/[\s\-־'\"״׳]/g,"").trim();}
function base(kind,verdict,confidence,uncertainty=[],rationale=[]){return {evaluator_kind:kind,evaluator_version:C.EVALUATOR_VERSION,rubric_version:C.RUBRIC_VERSION,normalizer_version:C.NORMALIZER_VERSION,verdict,confidence,uncertainty_codes:uncertainty,rationale_codes:rationale};}
function evaluateB1(expected,input){
  if(!expected||expected.kind!=="dictate_shadow_v1"||!expected.surface)return base("DETERMINISTIC_DICTATION","ABSTAIN","ABSTAIN",["EXPECTED_INVALID"]);
  if(expected.ambiguous||expected.homophone_risk)return base("DETERMINISTIC_DICTATION","ABSTAIN","ABSTAIN",["TARGET_AMBIGUOUS"]);
  const got=normalize(input&&input.answer),want=normalize(expected.surface);if(!got||!want)return base("DETERMINISTIC_DICTATION","ABSTAIN","ABSTAIN",["EMPTY_NORMALIZED"]);
  const assisted=!!(input&&input.assistance_codes&&input.assistance_codes.length);
  if(got===want)return base("DETERMINISTIC_DICTATION",assisted?"CORRECT_ASSISTED":"CORRECT_UNASSISTED","EXACT",[],["STRICT_SKELETON_MATCH"]);
  const lev1=Math.abs(got.length-want.length)<=1&&distanceAtMostOne(got,want);
  if(lev1)return base("DETERMINISTIC_DICTATION","NEAR_MISS","BOUNDED",["EDIT_DISTANCE_ONE"],["STRICT_MISMATCH"]);
  return base("DETERMINISTIC_DICTATION","INCORRECT","EXACT",[],["STRICT_MISMATCH"]);
}
function evaluateB2(expected,input){
  if(!expected||expected.kind!=="new_context_cloze_shadow_v1"||!expected.correct_option_id||!Array.isArray(expected.options))return base("DETERMINISTIC_CONTEXT_CLOZE","ABSTAIN","ABSTAIN",["EXPECTED_INVALID"]);
  const matches=expected.options.filter((x)=>x&&x.correct===true);if(matches.length!==1||String(matches[0].id)!==String(expected.correct_option_id))return base("DETERMINISTIC_CONTEXT_CLOZE","AMBIGUOUS","ABSTAIN",["OPTION_SET_AMBIGUOUS"]);
  const assisted=!!(input&&input.assistance_codes&&input.assistance_codes.length);
  let correct=false;
  if(input&&input.option_id)correct=String(input.option_id)===String(expected.correct_option_id);
  else if(input&&input.answer)correct=normalize(input.answer)===normalize(matches[0].surface);
  if(correct)return base("DETERMINISTIC_CONTEXT_CLOZE",assisted?"CORRECT_ASSISTED":"CORRECT_NEW_CONTEXT","EXACT",[],["CLOSED_OPTION_MATCH"]);
  return base("DETERMINISTIC_CONTEXT_CLOZE","INCORRECT_NEW_CONTEXT","EXACT",[],["CLOSED_OPTION_MISMATCH"]);
}
function distanceAtMostOne(a,b){
  if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,d=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}
  return d+(i<a.length||j<b.length?1:0)<=1;
}
module.exports={normalize,evaluateB1,evaluateB2};
