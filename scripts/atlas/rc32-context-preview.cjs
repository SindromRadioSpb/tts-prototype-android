'use strict';
// Local acceptance only. A fresh server environment never inherits owner credentials or production paths.
const path=require('node:path'),{fork}=require('node:child_process'),E=require('../../public/js/atlas-edition');
const {prepare}=require('./rc32-context.cjs'),{smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const [dataArg,sourceArg,portArg='3217']=process.argv.slice(2);let child;
(async()=>{
 if(!dataArg||!sourceArg||!/^\d+$/.test(portArg))throw Error('Usage: node rc32-context-preview.cjs <isolated runtime data> <verified full source export> [port]');
 const data=path.resolve(dataArg),source=path.resolve(sourceArg),repo=path.resolve(__dirname,'../..');
 if(data===path.join(repo,'data')||data===source)throw Error('Use isolated acceptance data');
 await prepare(source,path.join(repo,'atlas-context/a97001rc32',E.contextPinFor('a97001rc32')));
 child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:repo,env:smokeServerEnv(data,Number(portArg)),silent:true,windowsHide:true});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 child.on('exit',code=>{process.exitCode=code||0;});
 process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());process.on('exit',()=>child.kill());
 const base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);await waitForSmokeHealth(base,{timeoutMs:60000});
 console.log('Local acceptance: '+base+'/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1');
})().catch(e=>{console.error(e);if(child)child.kill();process.exitCode=1;});
