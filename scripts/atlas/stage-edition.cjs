#!/usr/bin/env node
'use strict';
// Only creates a new immutable namespace, never changes the legacy atlas or learner state.
const {stage}=require('../../lib/atlasEdition');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
if(!get('--source')||!get('--destination'))throw Error('Usage: --source <complete candidate> --destination <atlas-editions root> [--find <compatible bank>]');
console.log(JSON.stringify(stage(get('--source'),get('--destination'),{findFile:get('--find'),sharedAssets:get('--shared-assets')}),null,2));
