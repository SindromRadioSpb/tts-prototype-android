#!/usr/bin/env node
"use strict";
const assert=require("assert"),E=require("../../agent/evidence/evaluators"),R=require("../../agent/evidence/shadowReducer");
const b1={kind:"dictate_shadow_v1",surface:"כתב"};assert.equal(E.evaluateB1(b1,{answer:"כָּתַב"}).verdict,"CORRECT_UNASSISTED");assert.equal(E.evaluateB1(b1,{answer:"כתב",assistance_codes:["REPLAY"]}).verdict,"CORRECT_ASSISTED");assert.equal(E.evaluateB1({...b1,homophone_risk:true},{answer:"כתב"}).verdict,"ABSTAIN");
const b2={kind:"new_context_cloze_shadow_v1",correct_option_id:"a",options:[{id:"a",surface:"כתב",correct:true},{id:"b",surface:"כותב",correct:false}]};assert.equal(E.evaluateB2(b2,{option_id:"a"}).verdict,"CORRECT_NEW_CONTEXT");assert.equal(E.evaluateB2(b2,{option_id:"b"}).verdict,"INCORRECT_NEW_CONTEXT");assert.equal(R.reduce({verdict:"ABSTAIN"}).decision_code,"INCONCLUSIVE");console.log("f2-evaluator-smoke: ok");
