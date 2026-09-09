'use strict';
const id=process.argv[2];
if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw new Error('video id required');
fetch('https://www.youtube.com/watch?v='+id).then(r=>r.text()).then(s=>console.log(JSON.stringify({id,length:s.length,duration_seconds:Number(s.match(/"lengthSeconds":"(\d+)"/)?.[1])||null,title:s.match(/<title>(.*?)<\/title>/)?.[1]||null}))).catch(e=>{console.log(e.name);process.exitCode=1;});
