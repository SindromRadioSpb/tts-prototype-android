#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");const root=path.resolve(__dirname,"..","..");const home=fs.readFileSync(path.join(root,"public/js/mentor-home.js"),"utf8"),html=fs.readFileSync(path.join(root,"public/library.html"),"utf8");new vm.Script(home,{filename:"mentor-home.js"});
const must=["mentor-memory-wrap","mentor-memory-card","mentor-memory-later","memoryLaterButton(\"AGENT_TASK\"","memoryLaterButton(\"AGENT_EXPLANATION\"","status=ANNULLED","status=EXPIRED","statusAnnulled","document.body.appendChild(a)","exportReady","mentor_memory_store","mentor_memory_unfinished","mentor_memory_candidates","/api/agent/memory/proposals","DELETE MEMORY","room.mentor.memory.title"];
for(const x of must)if(!home.includes(x)&&!html.includes(x))throw new Error("missing UI contract: "+x);
if(!home.includes('find.addEventListener("click"')||home.includes("renderMemory(memB, memBox);\n    jpost(\"/api/agent/memory/proposals"))throw new Error("proposal must be explicit only");
for(const loc of ["ru","en","he"]){const s=fs.readFileSync(path.join(root,"public/i18n/locales",loc+".js"),"utf8");if(!s.includes("memory: {")||!s.includes("deleteAll:")||!s.includes("why:")||!s.includes("savedLater:"))throw new Error("locale incomplete "+loc);}
if(!html.includes("width: auto !important")||!html.includes("@media (max-width: 480px)"))throw new Error("mobile CSS guard missing");
console.log("smoke:f1 UI OK — syntax · explicit proposal trigger · lifecycle controls · ru/en/he · mobile width guard");
