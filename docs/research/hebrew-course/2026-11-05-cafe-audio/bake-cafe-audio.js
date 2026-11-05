// Bakes the cafe listening manifest with Google Cloud TTS using the local service account
// referenced in the repo .env (path only; credentials never printed).
const fs=require('fs'), crypto=require('crypto');
const repo='E:/projects/tts-prototype-android';
const ref='E:/projects/tts-prototype-android/data/course/ulpan/claude-code-hebrew-reference-2026-11-05/claude-code-hebrew-reference-2026-11-05/lesson-reference';
const out='E:/projects/tts-prototype-android/data/course/ulpan/audio-google-tts-2026-11-05';
const env=fs.readFileSync(repo+'/.env','utf8');
process.env.GOOGLE_APPLICATION_CREDENTIALS=(env.match(/^GOOGLE_APPLICATION_CREDENTIALS=(.*)$/m)||[])[1].trim();
const tts=require(repo+'/node_modules/@google-cloud/text-to-speech');
const manifest=JSON.parse(fs.readFileSync(ref+'/listening-script-manifest.json','utf8'));
// Hand-vocalised forms (to be confirmed by a human reviewer). Keys = manifest ids.
const NIQQUD={
 'a1-01':'שָׁלוֹם.',
 'a1-02':'שָׁלוֹם. אֶפְשָׁר קָפֶה בְּלִי חָלָב, בְּבַקָּשָׁה?',
 'a1-03':'קָטָן אוֹ גָּדוֹל?',
 'a1-04':'גָּדוֹל, בְּבַקָּשָׁה.',
 'a1-05':'לָשֶׁבֶת אוֹ לָקַחַת?',
 'a1-06':'לָשֶׁבֶת, בְּבַקָּשָׁה.',
 'a1-07':'קָפֶה גָּדוֹל בְּלִי חָלָב, לָשֶׁבֶת?',
 'a1-08':'כֵּן, תּוֹדָה.',
 'a2a':'קָטָן אוֹ גָּדוֹל?',
 'a2b':'לָשֶׁבֶת אוֹ לָקַחַת?',
 'a2c':'עִם סֻכָּר אוֹ בְּלִי סֻכָּר?',
 'a3a':'תֵּה עִם סֻכָּר, לָשֶׁבֶת?',
 'a3b':'תֵּה בְּלִי סֻכָּר, לָשֶׁבֶת?',
 'a4':'אֵין קָפֶה. יֵשׁ תֵּה.',
 'a3-extra':'קָפֶה קָטָן עִם חָלָב, לָקַחַת?',
 'a4-extra':'אֵין תֵּה. יֵשׁ מַיִם.',
};
// guard: niqqud-stripped form must equal the manifest text letter-for-letter, except
// known defective-spelling differences (סֻכָּר vs סוכר) which we record explicitly.
const strip=s=>s.normalize('NFC').replace(/[\u0591-\u05C7]/g,'');
const VOICES=(process.argv[2]||'he-IL-Chirp3-HD-Kore:he-IL-Chirp3-HD-Charon').split(',');
const VARIANTS=(process.argv[3]||'plain,niqqud').split(',');
(async()=>{
 const c=new tts.TextToSpeechClient(); const log=[]; let chars=0;
 for(const pair of VOICES){ const [staffV,custV]=pair.split(':');
  for(const variant of VARIANTS){
   const dir=`${out}/${staffV.replace('he-IL-','')}__${custV.replace('he-IL-','')}/${variant}`; fs.mkdirSync(dir,{recursive:true});
   for(const u of manifest.utterances){
     const text= variant==='niqqud'? NIQQUD[u.id] : u.text;
     const diff = strip(NIQQUD[u.id])!==u.text;
     const voice = u.speaker==='staff'? staffV : custV;
     const [r]=await c.synthesizeSpeech({input:{text},voice:{languageCode:'he-IL',name:voice},audioConfig:{audioEncoding:'MP3',sampleRateHertz:24000}});
     const buf=Buffer.from(r.audioContent); fs.writeFileSync(`${dir}/${u.id}.mp3`,buf); chars+=[...text].length;
     log.push({id:u.id,speaker:u.speaker,voice,variant,text,file:`${dir}/${u.id}.mp3`.replace(out+'/',''),bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),niqqudSkeletonDiffers:diff});
   }}}
 fs.writeFileSync(`${out}/bake-log.json`,JSON.stringify({created:new Date().toISOString(),engine:'Google Cloud Text-to-Speech v1 (synthesizeSpeech)',audioEncoding:'MP3 24kHz',billedCharsApprox:chars,clips:log},null,1));
 console.log('clips',log.length,'chars',chars);
})().catch(e=>{console.error('ERR',e.code,String(e.message).slice(0,300));process.exit(1)});
