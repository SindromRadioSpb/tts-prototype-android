import {Workbook} from '@oai/artifact-tool';import fs from 'node:fs/promises';
const w=Workbook.create(),s=w.worksheets.add('Test');s.getRange('A1:C1').values=[[46309,46309,46309]];s.getRange('A1').setNumberFormat('dd.mm.yyyy');s.getRange('B1').setNumberFormat('yyyy-mm-dd');s.getRange('C1').setNumberFormat('mm/dd/yyyy');s.getRange('A1:C1').format.columnWidth=22;
console.log((await w.inspect({kind:'computedStyle',range:'Test!A1:C1',maxChars:1500})).ndjson);
const p=await w.render({sheetName:'Test',range:'A1:C1',scale:2,format:'png'});await fs.writeFile(new URL('./date-test.png',import.meta.url),new Uint8Array(await p.arrayBuffer()));
