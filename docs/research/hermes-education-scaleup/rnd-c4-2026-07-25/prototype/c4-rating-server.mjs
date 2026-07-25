#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || args[i + 1] === undefined) throw new Error("C4_BAD_ARGUMENTS");
  options[args[i].slice(2)] = args[i + 1];
}
const need = (name) => {
  if (!options[name]) throw new Error(`C4_MISSING_${name.toUpperCase()}`);
  return path.resolve(options[name]);
};
const evaluationFile = need("evaluation");
const ratingsFile = need("ratings");
const port = Number(options.port || 8794);
const evaluation = JSON.parse(fs.readFileSync(evaluationFile, "utf8"));
if (evaluation?.schema_version !== "c4.evaluation.1" || !Array.isArray(evaluation.pairs) || evaluation.pairs.length !== 20) {
  throw new Error("C4_INVALID_EVALUATION");
}

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>C4 — слепая оценка</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#101216;color:#eef1f5}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:32px 22px 70px}h1{font-size:30px;margin:0 0 8px}.lead{color:#aeb6c2;margin:0 0 24px}.bar{position:sticky;top:0;background:#101216e8;backdrop-filter:blur(10px);padding:14px 0;z-index:2}.progress{height:8px;background:#272c35;border-radius:99px;overflow:hidden}.progress i{display:block;height:100%;width:0;background:#61d095;transition:.2s}.counter{margin-top:8px;color:#aeb6c2}.pair{border-top:1px solid #303641;padding:26px 0}.pair h2{font-size:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.answer{white-space:pre-wrap;background:#171b22;border:1px solid #303641;border-radius:10px;padding:18px;line-height:1.55;min-height:110px}.answer strong{display:block;margin-bottom:12px}.choices{display:flex;justify-content:center;gap:10px;margin-top:16px;flex-wrap:wrap}button{border:1px solid #465061;background:#202631;color:#eef1f5;border-radius:8px;padding:10px 16px;font-weight:650;cursor:pointer}button.selected{background:#2d7357;border-color:#61d095}.finish{margin-top:28px;font-size:17px;padding:13px 22px}.finish:disabled{opacity:.45;cursor:not-allowed}.done{color:#61d095;font-weight:700;margin-left:12px}@media(max-width:720px){.grid{grid-template-columns:1fr}}
</style></head><body><main class="wrap"><h1>C4 — слепая оценка 20 пар</h1><p class="lead">Не пытайтесь угадать источник. Выберите объяснение, которое полезнее именно вам; ничья считается против порога C4.</p><div class="bar"><div class="progress"><i></i></div><div class="counter">Оценено 0 из 20</div></div><section id="pairs"></section><button class="finish" disabled>Сохранить 20 оценок</button><span class="done"></span></main>
<script>
const state=new Map(); const root=document.querySelector('#pairs'); const counter=document.querySelector('.counter'); const fill=document.querySelector('.progress i'); const finish=document.querySelector('.finish');
const escText=(el,value)=>{el.textContent=value??''};
function refresh(){counter.textContent='Оценено '+state.size+' из 20';fill.style.width=(state.size*5)+'%';finish.disabled=state.size!==20;}
fetch('/evaluation').then(r=>r.json()).then(data=>data.pairs.forEach((p,i)=>{const sec=document.createElement('article');sec.className='pair';const h=document.createElement('h2');escText(h,'Пара '+(i+1));sec.append(h);const grid=document.createElement('div');grid.className='grid';for(const label of ['X','Y']){const box=document.createElement('div');box.className='answer';const strong=document.createElement('strong');escText(strong,'Вариант '+label);box.append(strong,document.createTextNode(p[label]));grid.append(box)}sec.append(grid);const choices=document.createElement('div');choices.className='choices';for(const [value,label] of [['X','X лучше'],['TIE','Ничья'],['Y','Y лучше']]){const b=document.createElement('button');escText(b,label);b.onclick=()=>{state.set(p.pair_id,value);for(const x of choices.querySelectorAll('button'))x.classList.toggle('selected',x===b);refresh()};choices.append(b)}sec.append(choices);root.append(sec)}));
finish.onclick=async()=>{finish.disabled=true;const ratings={ratings:[...state].map(([pair_id,preferred])=>({pair_id,preferred}))};const r=await fetch('/ratings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ratings)});const out=await r.json();if(!r.ok){document.querySelector('.done').textContent='Ошибка сохранения: '+out.error;finish.disabled=false;return}document.querySelector('.done').textContent='Сохранено. Вернитесь в Codex.';finish.textContent='Оценки сохранены'};
</script></body></html>`;

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
  res.end(body);
};
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") return send(res, 200, "text/html; charset=utf-8", html);
  if (req.method === "GET" && req.url === "/evaluation") return send(res, 200, "application/json; charset=utf-8", JSON.stringify(evaluation));
  if (req.method === "POST" && req.url === "/ratings") {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; if (body.length > 20000) req.destroy(); });
    req.on("end", () => {
      try {
        const value = JSON.parse(body);
        const allowed = new Set(evaluation.pairs.map((row) => row.pair_id));
        if (!Array.isArray(value.ratings) || value.ratings.length !== 20) throw new Error("REQUIRES_20");
        const seen = new Set();
        for (const row of value.ratings) {
          if (!allowed.has(row.pair_id) || seen.has(row.pair_id) || !["X", "Y", "TIE"].includes(row.preferred)) throw new Error("INVALID_RATING");
          seen.add(row.pair_id);
        }
        fs.writeFileSync(ratingsFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        send(res, 201, "application/json", JSON.stringify({ saved: true, ratings: 20 }));
      } catch (error) {
        send(res, 400, "application/json", JSON.stringify({ error: error.code === "EEXIST" ? "ALREADY_SAVED" : error.message }));
      }
    });
    return;
  }
  send(res, 404, "text/plain; charset=utf-8", "Not found");
});
server.listen(port, "127.0.0.1", () => process.stdout.write(`C4_RATING_READY http://127.0.0.1:${port}/\n`));
