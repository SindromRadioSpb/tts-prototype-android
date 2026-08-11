#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const { CAPABILITIES, CAPABILITY_VERSION } = require("../../agent/access/capabilities");
const { INPUT_SCHEMAS, OUTPUT_SCHEMAS, toolDefinitions } = require("../../agent/access/mcpSchemas");
const { SCOPE_PRESENTATION } = require("../../agent/access/consentCeremony");
const { TOOL_LIMITS } = require("../../agent/access/mcpRateLimiter");
const { createAgentAccessService } = require("../../agent/access/service");
const { createProductionHandlers } = require("../../agent/access/productionHandlers");

const NOW = Date.parse("2026-07-23T12:00:00.000Z"), EXPIRY = "2026-07-23T13:00:00.000Z";
const ADDED = new Set(["search_group_reading_catalog", "get_group_reading_content", "get_group_text_coverage"]);
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function eq(actual, expected, message) { assert.strictEqual(actual, expected, message); checks++; }

function projection() { return { version:"projection-v1", generated_at_ms:NOW, manual:{"pid:1":"known"}, scheduled:[] }; }
function dependencies(state) {
  const corpus = { corpus_id:"study-songs-pilot", title:"Учебные песни", version:1 };
  const works = [
    { work_id:"song-pos-001", title:"כולם גנבים", artist:"אושר כהן", position_no:1, rows_count:42, audio_count:42, level:"A2", topic:"songs", tags:["hitlist.mako"] },
    { work_id:"song-pos-013", title:"אהבת השם", artist:"בן צור", position_no:13, rows_count:34, audio_count:20, level:"A2", topic:"songs", tags:["fixture"] },
  ];
  const denied = () => { const e = new Error("GROUP_CORPUS_NOT_FOUND"); e.code = "GROUP_CORPUS_NOT_FOUND"; throw e; };
  const groupCorpusRepo = {
    listCorpora: async () => state.active ? [{...corpus, works_count:2}] : [],
    listWorks: async () => state.active ? { corpus, works } : denied(),
    getAgentReadingWindow: async (_uid, input) => state.active ? { corpus, work:{...works[0], source_url:"https://example.test/song", rights_status:"REVIEW_REQUIRED"}, rows:[{order_index:0,he:"לכתוב",he_niqqud:"לִכְתּוֹב",ru:"писать"}],rows_total:42,has_more:true } : denied(),
    getAgentCoverageText: async () => state.active ? { corpus, work:works[0], rows:[{he:"לכתוב",he_niqqud:"לִכְתּוֹב"}] } : denied(),
  };
  return {
    learnerGraphRepo:{getAgentAccessReviewAggregates:async()=>({scheduled_total:0,due_total:0,urgent_total:0}),getDue:async()=>[],getActivityDelta:async()=>({by_channel:[],top:[]}),getCoverageProjection:async()=>projection()},
    agentRepo:{getLatestOpenPlanAction:async()=>null,listExplanationMetadata:async()=>({items:[],next_before:null}),getProfile:async()=>null,getExplanationById:async()=>null},
    oauthRepo:{loadConnection:async()=>null,listConnectionsForUser:async()=>[]}, publicCatalog:{isReadable:()=>true,search:()=>({catalog_version:"v1",results:[],next_cursor:null})},
    keyingService:{displayForItemKey:async()=>null,glossForItemKey:async()=>null}, corpusSentenceRepo:{listWorkTexts:()=>null,getCorpusLessonWindow:async()=>null,getCorpusCoverageText:()=>null},
    handoffRepo:{mint:async()=>null,countActive:async()=>0},agentProposalsRepo:{create:async()=>null},personalTextsRepo:{hasConsentVersioned:async()=>({ok:true}),listWithMeta:async()=>[]},
    personalTextsContentRepo:{aaGetPersonalTextWindow:async()=>({ok:false}),aaGetPersonalCoverageText:async()=>({ok:false})},textGrantsRepo:{activeGrant:async()=>({state:"NONE"})},
    groupCorpusRepo,connectionPersistence:async()=>({access_lifetime:"TOKEN_ONLY",window_expires_at:null}),now:()=>NOW,principalAccessExpiresAt:()=>EXPIRY,
  };
}
function principal(id, scopes) { return {user_id:"owner",oauth_client_id:"hermes",connection_id:"conn-1",external_actor_id:"actor",request_id:id,scopes,connection_status:"ACTIVE",access_expires_at:EXPIRY}; }

async function main() {
  const state = {active:true}, handlers = createProductionHandlers(dependencies(state));
  const service = createAgentAccessService({enabled:true,ownerIds:["owner"],handlers,now:()=>NOW});

  const search = await service.execute(principal("search",["reading.group_corpus.read"]),"search_group_reading_catalog",{query:"אושר",audio:"ANY",sort:"RELEVANCE",limit:20});
  ok(search.ok, JSON.stringify(search)); eq(search.result.results.length,1); eq(search.result.results[0].work_id,"song-pos-001"); eq(search.result.results[0].access,"GROUP_RESTRICTED");
  const content = await service.execute(principal("content",["reading.group_corpus.read"]),"get_group_reading_content",{corpus_id:"study-songs-pilot",work_id:"song-pos-001",rows:5});
  ok(content.ok,JSON.stringify(content)); eq(content.result.rows[0].he,"לִכְתּוֹב"); eq(content.result.authority,"GROUP_CORPUS_SERVER_CANONICAL"); ok(!JSON.stringify(content.result).includes("review_log"),"learner state leaked");
  const coverage = await service.execute(principal("coverage",["learner.group_coverage.read"]),"get_group_text_coverage",{corpus_id:"study-songs-pilot",work_id:"song-pos-001",top_unknown_limit:5});
  ok(coverage.ok,JSON.stringify(coverage)); eq(coverage.result.schema_version,"aa.group_text_coverage.2.0.0"); eq(coverage.result.recorded_familiar_pct_lower_bound,100); eq(coverage.result.counts.familiar,1); ok(!Object.prototype.hasOwnProperty.call(coverage.result,"rows"),"source body leaked through coverage");
  const wrongScope = await service.execute(principal("scope",["reading.group_corpus.read"]),"get_group_text_coverage",{corpus_id:"study-songs-pilot",work_id:"song-pos-001"});
  eq(wrongScope.ok,false); eq(wrongScope.error.code,"INSUFFICIENT_SCOPE");
  state.active=false;
  const revokedSearch = await service.execute(principal("revoked-search",["reading.group_corpus.read"]),"search_group_reading_catalog",{corpus_id:"study-songs-pilot",audio:"ANY",sort:"POSITION",limit:20});
  eq(revokedSearch.ok,false); eq(revokedSearch.error.code,"AA_NOT_FOUND");
  const revokedContent = await service.execute(principal("revoked-content",["reading.group_corpus.read"]),"get_group_reading_content",{corpus_id:"study-songs-pilot",work_id:"song-pos-001"});
  eq(revokedContent.ok,false); eq(revokedContent.error.code,"AA_NOT_FOUND");

  eq(CAPABILITY_VERSION,"aa-v0.1"); eq(toolDefinitions().length,25);
  eq(CAPABILITIES.search_group_reading_catalog.scope,"reading.group_corpus.read"); eq(CAPABILITIES.get_group_text_coverage.scope,"learner.group_coverage.read");
  for(const name of ADDED){eq(TOOL_LIMITS[name].minute,6);eq(TOOL_LIMITS[name].day,200);ok(INPUT_SCHEMAS[name]&&OUTPUT_SCHEMAS[name],name+" schemas missing");}
  eq(SCOPE_PRESENTATION["reading.group_corpus.read"].retention_tier,"CONTENT"); eq(SCOPE_PRESENTATION["learner.group_coverage.read"].retention_tier,"PERSONAL");
  const before=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/group-corpus/schema-before-sha256.json"),"utf8"));
  const oldInput={},oldOutput={};
  const laterH23=new Set(["propose_import_text","propose_track_word","propose_goal","get_current_goal"]);
  for(const name of Object.keys(INPUT_SCHEMAS))if(!ADDED.has(name)&&!laterH23.has(name))oldInput[name]=INPUT_SCHEMAS[name];
  // B7 deliberately versions get_text_coverage v1→v2 so Room and Agent Access share one
  // recorded-familiarity contract. All other pre-group output schemas remain byte-frozen.
  for(const name of Object.keys(OUTPUT_SCHEMAS))if(!ADDED.has(name)&&!laterH23.has(name)&&name!=="get_text_coverage")oldOutput[name]=OUTPUT_SCHEMAS[name];
  eq(Object.keys(oldInput).length,before.tool_count); eq(sha(oldInput),before.input_map_sha256,"existing input schemas mutated");
  eq(Object.keys(oldOutput).length,before.tool_count-1); eq(sha(oldOutput),"dfd9a4bd9776ebf49d81b26733be0e379657951816beece08539130c9dd2c47b","non-B7 output schemas mutated");
  const migration=fs.readFileSync(path.join(ROOT,"migrations/060_agent_access_group_corpus_scopes.sql"),"utf8");
  ok(migration.includes("'reading.group_corpus.read'")&&migration.includes("'learner.group_coverage.read'"),"migration scopes missing"); ok(!/^\s*(BEGIN|COMMIT)\b/im.test(migration),"migration owns transaction");
  const ui=fs.readFileSync(path.join(ROOT,"public/js/agent-access.js"),"utf8"); ok(/"reading\.group_corpus\.read":\{ru:"[^"]+",en:"[^"]+",he:"[^"]+"\}/.test(ui),"group read i18n missing"); ok(/"learner\.group_coverage\.read":\{ru:"[^"]+",en:"[^"]+",he:"[^"]+"\}/.test(ui),"group coverage i18n missing");
  console.log(`[agent-group-corpus] PASS ${checks} checks; membership revoke fail-closed; original schemas 18 -> 21 only-addition; current catalog 25 after H2.3`);
}
main().catch((e)=>{console.error(e&&e.stack||e);process.exitCode=1;});
