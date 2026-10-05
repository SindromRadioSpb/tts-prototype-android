"""Build an additive, immutable Ben-Yehuda learning release from verified owner archives.

The existing discovery order is retained so all FTS work ordinals remain stable.
No archive evidence, prompts, operational ledgers or source paths enter public output.
"""
import argparse
import copy
import gzip
import hashlib
import json
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


def encoded(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
def sha(value): return hashlib.sha256(value).hexdigest()
def load(path): return json.loads(path.read_text(encoding='utf-8'))
def put(path,value): path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(encoded(value))
def fields(value,allowed): return {k:value[k] for k in allowed if k in value}
def ready(card): return bool(card.get('coverage',{}).get('text') and card.get('coverage',{}).get('translation') not in [None,'none'])

def public_derived(value):
    # The reader uses this evidence to keep machine vocalization out of canonical source fields.
    result=fields(value,['value','authority','provider','source_hash','generated_at','model_version'])
    provenance=value.get('provenance')
    if isinstance(provenance,str):
        try: provenance=json.loads(provenance)
        except (ValueError,TypeError): provenance=None
    if isinstance(provenance,dict):
        safe=fields(provenance,['source_original','review'])
        if isinstance(provenance.get('changes'),list):
            safe['changes']=[fields(c,['kind','original','learning_form','added_codepoint','location','reason','source_modified']) for c in provenance['changes'] if isinstance(c,dict)]
        result['provenance']=json.dumps(safe,ensure_ascii=False,separators=(',',':'))
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-root',type=Path,required=True);p.add_argument('--dir',type=Path,required=True);p.add_argument('--version',type=int,default=8);args=p.parse_args()
    inventory=load(args.dir/'input-inventory.json'); comparison=load(args.dir/'comparison.json'); baseline=args.dir/'baseline/data/benyehuda'; out=args.dir/'candidate'
    if inventory['problems'] or comparison['cross_work_key_matches']: raise ValueError('Unresolved inventory conflicts')
    before=load(baseline/'corpus-catalog-v7.json'); oldsearch=load(baseline/'corpus-search-v7.json'); oldindex=load(baseline/'corpus-index-v7.json')
    actions={r['work_id']:r for r in comparison['works']}; records={r['work_id']:r for r in inventory['works']}
    # Keys are aliases only within their independently checked source work identity.
    owners=defaultdict(set)
    for record in inventory['works']:
        for key in [record['stored_key'],record['recomputed_key']]:owners[key].add(record['work_id'])
    for card in oldindex['ready']:owners[card['text_key']].add(card['id'])
    if any(len(ids)>1 for ids in owners.values()):raise ValueError('Cross-work alias ownership conflict')
    cards={}; manifests=[]
    for entry in before['manifests']:
        manifest=load(baseline/entry['file']); manifests.append((entry,manifest)); cards.update({c['id']:c for c in manifest['works']})
    for card in cards.values(): card['catalog_version']=args.version
    # Evidence paths are used privately to check each referenced snapshot hash.
    evidence={}
    for archive in inventory['archives']:
        if archive['role']!='evidence':continue
        path=args.input_root/archive['archive']
        if sha(path.read_bytes())!=archive['sha256']:raise ValueError('Evidence archive changed: '+archive['archive'])
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if name.endswith(('.html','.txt','.json')): evidence.setdefault(sha(z.read(name)),[]).append((archive['archive'],name))
    release=[]; verified_source_periods=0
    for archive in inventory['archives']:
        if archive['role']!='learning':continue
        path=args.input_root/archive['archive']; raw=path.read_bytes()
        if sha(raw)!=archive['sha256']:raise ValueError('Learning archive changed: '+archive['archive'])
        with zipfile.ZipFile(path) as z:
            body=z.read('library/library.json'); library=json.loads(body)
            expected=(archive.get('manifest') or {}).get('library_json_sha256')
            if expected and sha(body)!=expected:raise ValueError('Library SHA mismatch: '+archive['archive'])
            for text in library['texts']:
                corpus=copy.deepcopy(text['corpus']); id=str(corpus['byehuda_id']); card=cards[id]; record=records[id]
                learning=text.get('source_meta',{}).get('text_learning',{}); document=learning.get('reviewed_source_document') or {}; c=corpus
                safe_rows=[]
                for row in text['rows']:
                    safe=fields(row,['row_id','order_index','hebrew_plain','hebrew_niqqud','russian','translit','translit_ru','translation_provider','niqqud_authority'])
                    meta=fields(row.get('meta') or {},['stanza_index','source_line_index','source_block_index','source_sentence_index','content_form','original_language','language','foreign_script','footnote_marker'])
                    derived=(row.get('meta') or {}).get('niqqud_derived')
                    if isinstance(derived,dict):meta['niqqud_derived']=public_derived(derived)
                    if meta:safe['meta']=meta
                    tm=fields(row.get('translation_meta') or {},['model','review_status','human_philological_review','source_url','niqqud_origin','transliteration_profile'])
                    if tm:safe['translation_meta']=tm
                    safe_rows.append(safe)
                count=len(safe_rows); filled=record['filled_rows']; source_version=learning.get('source_version') or ('pinned_public_domain_dump' if learning.get('dump_commit') else None)
                public_learning={'schema':'benyehuda-public-learning-v1','work_id':id,'source_version':source_version,'source_sha256':learning.get('source_sha256'),'raw_source_sha256':learning.get('raw_source_sha256'),'dump_commit':learning.get('dump_commit') or document.get('dump_commit'),'revision_date':text.get('updated_at'),'main_rows':count,'filled_rows':filled,'niqqud_rows':sum(bool(re.search('[\u05b0-\u05bc\u05c1\u05c2\u05c7]',r.get('hebrew_niqqud',''))) for r in safe_rows),'complete_learning_edition':True,'review':'machine; no human philological certification','human_philological_review':False,'source_reported_rights':(document.get('current_rights') or {}).get('label') or corpus.get('provenance',{}).get('license'),'rights_scope':'Source-reported rights; no independent legal clearance','source_edition':document.get('source_edition'),'contributors':c.get('translator'),'content_form':learning.get('content_form') or document.get('content_form'),'canonical_text_key':record['recomputed_key'],'stored_text_key':record['stored_key']}
                normalized={'text_id':'by-'+id,'title':text['title'],'level':None,'tags':text.get('tags') or [],'source_label':'Project Ben-Yehuda','topic':None,'source_text':'','source_meta':{'origin':'benyehuda-ingest','corpus':corpus,'public_learning':public_learning},'corpus':corpus,'table_model_meta':None,'text_audio_asset_key':None,'created_at':text.get('created_at'),'updated_at':text.get('updated_at'),'is_archived':False,'rows':safe_rows}
                edition=sha(encoded(normalized)); normalized['text_key']=sha(('benyehuda-learning:'+id+':'+edition).encode()); normalized['text_id']='by-'+id+'-learning-'+edition[:16]; public_learning['edition_id']=edition
                bundle={'library':{'schema_version':1,'corpus_meta_version':1,'texts':[normalized],'shelves':[],'audio_assets':[]}}
                bodybytes=encoded(bundle); bodyhash=sha(bodybytes); file='works/'+id+'-'+bodyhash[:32]+'.json'; put(out/file,bundle)
                preview={'library':{'texts':[{'rows':[fields(r,['hebrew_plain','hebrew_niqqud','russian','translit','translit_ru']) for r in safe_rows[:4]]}]}}
                previewhash=sha(encoded(preview)); previewfile='works/'+id+'-'+previewhash[:16]+'-preview.json';put(out/previewfile,preview)
                c=corpus; ratio=round(sum(bool(re.search('[\u0591-\u05c7]',r.get('hebrew_niqqud',''))) for r in safe_rows)/count,2)
                aliases=sorted(set(actions[id]['published_keys']+[record['stored_key'],record['recomputed_key']]))
                if any(not re.fullmatch('[a-f0-9]{64}',key) or owners[key]!={id} for key in aliases):raise ValueError('Unverified work key alias')
                card.update(title=text['title'],author=c.get('author') or card.get('author'),parts=1,segments=count,vocalized_ratio=ratio,review_status=c['review_status'],audio_status='none',text_key=normalized['text_key'],file=file,bundle_sha256=bodyhash,preview_file=previewfile,preview_sha256=previewhash,learning_edition_id=edition,learning_revision=record['revision'],source_edition_id=source_version,catalog_version=args.version,translation_provenance={'provider':' / '.join(sorted({r.get('translation_provider') for r in safe_rows if r.get('translation_provider')}))},public_learning=public_learning,previous_text_keys=aliases)
                card['coverage']={'text':True,'niqqud':ratio,'translation':'machine','audio':'none','era_known':bool(card.get('era')),'tier':'machine-known' if card.get('era') and card['era']!='unknown' else 'machine-rest'}
                classification=document.get('official_classification_evidence') or {}; listing=classification.get('listing_evidence') or {}; snapshot=listing.get('snapshot_sha256')
                if classification.get('period') and listing.get('modern_filter_checked') and snapshot in evidence and str(document.get('id'))==id:
                    card['source_period']={'scope':'work','work_id':id,'status':'known','value':classification['period'],'source_label':document.get('official_period_label') or classification['period'],'source_url':listing['url'],'snapshot':'sha256:'+snapshot};verified_source_periods+=1
                release.append({'work_id':id,'action':actions[id]['state'],'canonical_text_key':record['recomputed_key'],'stored_text_key':record['stored_key'],'edition_text_key':normalized['text_key'],'learning_edition_id':edition,'body':file,'body_bytes':len(bodybytes),'body_sha256':bodyhash,'preview':previewfile,'preview_sha256':previewhash,'rows':count,'old_body':('works/'+id+'.json') if actions[id]['state']=='replaced' else None,'old_body_sha256':sha((baseline/'works'/f'{id}.json').read_bytes()) if actions[id]['state']=='replaced' else None})
    by_era=defaultdict(list); blocks={}; output_manifests=[]
    for entry,manifest in manifests:
        target=re.sub(r'-v7\.json$','-v'+str(args.version)+'.json',entry['file']);manifest['version']=args.version
        put(out/target,manifest);output_manifests.append({**entry,'file':target})
        for card in manifest['works']:by_era[entry['era']].append(card);blocks[card['id']]=entry['block']
    authors={};facets={};readycards=[]
    for era,era_cards in by_era.items():
        a={};genre=Counter();lang=Counter()
        for card in era_cards:
            name=card['author'] or '(без автора)'; group=a.setdefault(name,{'name':name,'qid':card.get('author_qid'),'works':0,'ready':0,'blocks':[]});group['works']+=1;group['ready']+=int(ready(card))
            if blocks[card['id']] not in group['blocks']:group['blocks'].append(blocks[card['id']])
            genre[card.get('genre') or '(none)']+=1;lang[card.get('orig_language') or 'he']+=1
            if ready(card):readycards.append(card)
        authors[era]=sorted(a.values(),key=lambda r:(-r['ready'],-r['works'],r['name']));facets[era]={'genre':dict(genre),'lang':dict(lang)}
    root=copy.deepcopy(before);root.update(version=args.version,index_file=f'corpus-index-v{args.version}.json',search_file=f'corpus-search-v{args.version}.json',authors_file=f'corpus-authors-v{args.version}.json',manifests=output_manifests,generated_from='verified-public-v7 + owner-learning-editions',release_manifest=f'learning-release-v{args.version}.json')
    root['pointers']['ready']=[r['id'] for r in oldsearch if ready(cards[r['id']])]
    root['counts']['baked']=len(readycards);root['counts']['by_tier']=dict(Counter(c['coverage']['tier'] for c in cards.values()))
    for era in root['era_taxonomy']:era['ready_count']=sum(ready(c) for c in by_era[era['era']]);era['author_count']=len(authors[era['era']])
    index={'schema':1,'version':args.version,'generated_from':root['generated_from'],'ready':readycards,'authors':authors,'facets':facets}
    search=[{**r,'t':cards[r['id']]['title'],'a':cards[r['id']]['author'] or '', 'r':int(ready(cards[r['id']]))} for r in oldsearch]
    if [r['id'] for r in search]!=[r['id'] for r in oldsearch]:raise ValueError('FTS ordinal drift')
    put(out/root['index_file'],index);put(out/root['search_file'],search);put(out/f'corpus-catalog-v{args.version}.json',root)
    # Retained old bodies are byte-exact locally; they are never uploaded or overwritten.
    for id in before['pointers']['ready']:
        target=out/'works'/f'{id}.json';target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(baseline/'works'/f'{id}.json',target)
    manifest={'schema':'benyehuda-learning-release-v1','catalog_version':args.version,'baseline_catalog_version':7,'summary':comparison['summary'],'input_learning_archives':[{'name':Path(a['archive']).name,'bytes':a['bytes'],'sha256':a['sha256'],'library_sha256':a['library_sha256'],'works':a['works'],'rows':a['rows']} for a in inventory['archives'] if a['role']=='learning'],'works':release,'retained_works':[{'work_id':id,'body':'works/'+id+'.json','sha256':sha((baseline/'works'/f'{id}.json').read_bytes())} for id in before['pointers']['ready'] if id not in actions],'verified_source_period_count':verified_source_periods,'client_policy':'Preserve existing device edition; new edition imports separately with skip; no learner-state migration'}
    put(out/f'learning-release-v{args.version}.json',manifest)
    report={'ready':len(readycards),'rows':comparison['summary']['ready_rows_candidate'],'new_body_bytes':sum(r['body_bytes'] for r in release),'gzip_new_bodies':sum(len(gzip.compress((out/r['body']).read_bytes(),mtime=0)) for r in release),'largest_body_bytes':max(r['body_bytes'] for r in release),'source_periods_verified':verified_source_periods,'discovery_cards':len(search),'actions':comparison['summary']['actions']}
    put(args.dir/'build-report.json',report); print(json.dumps(report,indent=2))


if __name__=='__main__':main()
