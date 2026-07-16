#!/usr/bin/env node
"use strict";
const assert=require("assert"),S=require("../../agent/evidence/observationSelector");
const rows=[{id:"r1",kind:"review",meta_json:"{}"},{id:"a1",kind:"annul",meta_json:'{"annul_of":"r1"}'},{id:"r2",kind:"review",meta_json:"{}"}];
assert.deepEqual(S.fold(rows).map(x=>x.id),["r2"]);assert.deepEqual(S.fold([rows[1],rows[0],rows[2]]).map(x=>x.id),["r2"]);
assert(S.receptive({channel:"read:mc"}));assert(S.receptive({channel:"reading:tap"}));assert(!S.receptive({channel:"reverse:tiles"}));assert(!S.receptive({channel:"dictate:typed"}));
console.log("f2-observation-smoke: ok");
