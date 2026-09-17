const test=require('node:test'),assert=require('node:assert/strict');
const {markup}=require('../public/js/subtitle-row-language');
test('foreign speech badge requires subtitle provenance and does not modify row text',()=>{
 const row={he:'שלום',ru:'Привет',translation_meta_json:JSON.stringify({provider:'subtitle-track',speech_language:'other',speech_language_named:'<script>'})};
 const before=JSON.stringify(row);
 for(const lang of ['ru','en','he']){const html=markup(row,lang);assert.match(html,/data-speech-language="other"/);assert.ok(!html.includes('<script>'));}
 assert.equal(JSON.stringify(row),before);
 for(const meta of [{provider:'subtitle-track',speech_language:'target_assumed'},{provider:'subtitle-track',speech_language:'unknown'},{provider:'gemini',speech_language:'other'},null,'broken'])assert.equal(markup({translation_meta_json:meta},'ru'),'');
});
