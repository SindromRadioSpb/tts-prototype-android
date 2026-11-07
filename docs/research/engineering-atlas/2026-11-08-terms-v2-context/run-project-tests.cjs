'use strict';
// Same discovery/concurrency/sanitized environment as scripts/test-unit.js.
// An explicit local dependency path supplies KaTeX missing from the shared install.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),{smokeServerEnv}=require(path.join(root,'scripts/smoke-server-env'));
const deps=process.argv[2];if(!deps)throw Error('Usage: node run-project-tests.cjs <local node_modules containing katex>');
const dependencyRoot=path.resolve(deps);require.resolve('katex',{paths:[dependencyRoot]});
function discover(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?discover(p):/\.test\.[cm]?js$/.test(e.name)||e.name==='i18n.smoke.js'?[p]:[];}).sort();}
fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});const data=fs.mkdtempSync(path.join(root,'.tmp/unit-acceptance-'));
const r=spawnSync(process.execPath,['--test','--test-concurrency=4',...discover(path.join(root,'tests'))],{cwd:root,env:{...smokeServerEnv(data,0),NODE_PATH:dependencyRoot},stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status??1;
