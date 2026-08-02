#!/usr/bin/env node
'use strict';
const {performance}=require('node:perf_hooks');
const Core=require('../../public/js/import-center-core.js');

function fixture(count){return Array.from({length:count},(_,i)=>({
  material_id:`material-${i}`,text_id:`text-${i}`,portable_scope_id:`learning-material:sha256:${String(i).padStart(64,'0')}`,
  title:`Synthetic material ${i}`,projection_present:true,projection_archived:false,projection_rebuildable:false,
  caption_raw_present:true,caption_current_revision_id:`caption-${i}-20`,caption_current_sha256:'a'.repeat(64),caption_draft_present:false,
  table_current_revision_id:`table-${i}-20`,table_content_sha256:'b'.repeat(64),table_mapping_sha256:'c'.repeat(64),
  table_bound_caption_revision_id:`caption-${i}-20`,table_bound_caption_revision_sha256:'a'.repeat(64),mapping_total:2800,mapping_mapped:2800,mapping_invalid:false,
  media_expected_sha256:'d'.repeat(64),media_actual_sha256:'d'.repeat(64),media_present:i%7!==0,media_codec_supported:true,
  import_integrity_state:'native',source_state_sha256:'e'.repeat(64),revision_count:20,
}));}
function measure(count,ceiling){const input=fixture(count),start=performance.now(),catalog=Core.buildCatalog(input,[],{storage_supported:true},'2026-08-02T00:00:00Z'),derive=performance.now()-start;const renderStart=performance.now(),visible=catalog.slice(0,30).map(row=>({id:row.material_id,state:row.continuity_state,next:row.next_action})),render=performance.now()-renderStart;const samples=[];for(let i=0;i<100;i++){const t=performance.now();catalog.filter(row=>row.continuity_state!=='ready').sort((a,b)=>a.title.localeCompare(b.title)).slice(0,30);samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);const p95=samples[Math.floor(samples.length*.95)];if(derive>ceiling)throw new Error(`IMPORT_CENTER_DERIVATION_${count}:${derive.toFixed(2)}ms`);if(render>500)throw new Error(`IMPORT_CENTER_RENDER_MODEL:${render.toFixed(2)}ms`);if(p95>100)throw new Error(`IMPORT_CENTER_FILTER_P95:${p95.toFixed(2)}ms`);if(visible.length!==30)throw new Error('IMPORT_CENTER_DOM_WINDOW');return{count,revision_count:20,derive_ms:Number(derive.toFixed(2)),first_30_ms:Number(render.toFixed(2)),filter_p95_ms:Number(p95.toFixed(2)),visible:visible.length};}
const materials100=measure(100,500),materials500=measure(500,1500);console.log(JSON.stringify({gate:'P4_IMPORT_CENTER_100_500_BOUNDED',materials100,materials500},null,2));
