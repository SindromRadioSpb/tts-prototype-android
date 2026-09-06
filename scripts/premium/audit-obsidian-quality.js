'use strict';
// Read only the specified immutable source ZIP; write reproducible derivatives
// to an explicit output directory, never to the source or an Obsidian vault.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const ZIP = require('../../public/db/jszip.min.js');
const Preview = require('../../public/js/obsidian-lexical-preview.js');
const {resolverSet} = require('./export-public-corpus-obsidian.js');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function audit(source, output) {
  const bytes = fs.readFileSync(source), zip = await ZIP.loadAsync(bytes), resolvers = resolverSet();
  const totals = {texts:0,tokens:0,analyzed:0,skipped:0,meaning_present:0,context_meaning_confirmed:0,usage_reference:0,source_features:0,source_prefix:0,uncertain:0};
  const works = [], strata = new Map();
  for (const name of Object.keys(zip.files).filter(name => /^works\/[^/]+\.json$/.test(name)).sort()) {
    const bundle = JSON.parse(await zip.file(name).async('string'));
    const textId = String(bundle.library.texts[0].text_id);
    const report = Preview.analyzeBundle(bundle,{...resolvers,textId});
    const baseline = Preview.analyzeBundle(bundle,{...resolvers,usageResolver:null,textId});
    // Independent of enrichment: the raw source and canonical lexical fields
    // must remain byte-equal when usage references are switched off.
    const identity = r => r.lexemes.flatMap(l => l.occurrences.map(o => [o.row_id,o.word_offset,o.niqqud,o.lemma,o.lp_pos,o.pealim_id,o.root,o.binyan,o.meaning_ru]));
    if (JSON.stringify(identity(report)) !== JSON.stringify(identity(baseline))) throw new Error('USAGE_CHANGED_LEXICAL_IDENTITY');
    const occs = report.lexemes.flatMap(l => l.occurrences);
    const count = {texts:1,tokens:report.counts.tokens_total,analyzed:occs.length,skipped:report.counts.skipped_tokens,
      meaning_present:occs.filter(o => o.meaning_ru).length,context_meaning_confirmed:occs.filter(o => o.context_meaning_ru).length,
      usage_reference:occs.filter(o => o.usage).length,source_features:occs.filter(o => Object.keys(o.features||{}).length).length,
      source_prefix:occs.filter(o => o.prefix != null && JSON.stringify(o.prefix) !== '""' && JSON.stringify(o.prefix) !== '[]').length,
      uncertain:report.counts.uncertain_occurrences};
    if (count.analyzed + count.skipped !== count.tokens) throw new Error('TOKEN_CONSERVATION_FAILED');
    Object.keys(totals).forEach(key => totals[key] += count[key]);
    works.push({source_entry:name,text_id:textId,counts:count});
    for (const occ of occs) {
      const stratum = occ.identity_guard_reason || occ.ambiguity ? 'uncertain' : occ.lp_pos;
      if (!strata.has(stratum)) strata.set(stratum,[]);
      strata.get(stratum).push({id:sha(JSON.stringify([name,occ.row_id,occ.word_offset])),source_entry:name,text_id:textId,row_id:occ.row_id,word_offset:occ.word_offset,
        surface:occ.niqqud||occ.surface,sentence_he:occ.sentence_he_niqqud||occ.sentence_he,
        expected_lemma:'',expected_pos:'',expected_root:'',expected_binyan:'',expected_features:{},expected_context_meaning_ru:'',annotator:'',status:'unannotated'});
    }
  }
  const groups = [...strata.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,rows]) => rows.sort((a,b) => a.id.localeCompare(b.id)));
  const worksheet = [];
  for (let index = 0; worksheet.length < 400; index++) {
    let found = false;
    for (const rows of groups) if (rows[index] && worksheet.length < 400) {worksheet.push(rows[index]);found=true;}
    if (!found) break;
  }
  const result = {schema:'linguistpro-obsidian-quality-audit-v1',source_sha256:sha(bytes),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    implementation:'working-tree; see implementation ledger',linguistic_accuracy:'NOT_MEASURED',usage_identity_changes:0,
    totals,works,gold_worksheet:{status:'UNANNOTATED_NOT_SCORED',rows:worksheet.length,selection:'deterministic hash order; round-robin source POS/uncertainty strata; no predicted fields shown'}};
  fs.mkdirSync(output,{recursive:true});
  for (const file of ['coverage.json','gold-worksheet.json']) if (fs.existsSync(path.join(output,file))) throw new Error('OUTPUT_EXISTS_PRESERVE_ANNOTATIONS');
  fs.writeFileSync(path.join(output,'coverage.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(output,'gold-worksheet.json'),JSON.stringify(worksheet,null,2)+'\n');
  console.log(JSON.stringify({totals,worksheet:worksheet.length,linguistic_accuracy:result.linguistic_accuracy}));
  return result;
}
if (require.main === module) {
  const args = process.argv.slice(2), arg = name => args[args.indexOf(name)+1];
  if (!args.includes('--source-zip') || !args.includes('--output')) throw new Error('--source-zip and --output required');
  audit(path.resolve(arg('--source-zip')),path.resolve(arg('--output'))).catch(error => {console.error(error.message);process.exitCode=1;});
}
module.exports = {audit};
