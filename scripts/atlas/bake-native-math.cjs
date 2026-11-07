'use strict';
// Build-time only: preserve source LaTeX and add real MathML. Run before hashing/search/staging.
const fs=require('node:fs'),katex=require('katex');
function mathml(latex){const html=katex.renderToString(String(latex).replace(/\\\\\[/g,'\\\\ ['),{output:'mathml',displayMode:true,throwOnError:true,strict:'ignore',trust:false});return html.slice(html.indexOf('<math'),html.lastIndexOf('</math>')+7);}
function processSections(input){
 const sections=JSON.parse(JSON.stringify(input)),report={sections:sections.length,formulas:0,variables:0};
 for(const section of sections)for(const page of section.pages||[])for(const item of page.items||[]){
   if(item.type==='formula'&&item.latex){try{item.mathml=mathml(item.latex);}catch(e){throw Error(item.id+': '+e.message);}report.formulas++;}
   for(const variable of item.vars||[])if(variable.latex){try{variable.mathml=mathml(variable.latex);}catch(e){throw Error((variable.ref||item.id)+': '+e.message);}report.variables++;}
 }
 return {sections,report};
}
if(require.main===module){
 if(process.argv[2]!=='--stdio')throw Error('Usage: JSON sections array | node bake-native-math.cjs --stdio');
 const input=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(processSections(input))+'\n');
}
module.exports={mathml,processSections};
