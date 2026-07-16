"use strict";
const fs=require("fs"),os=require("os"),path=require("path");
const sqlite=require("../../../db/sqlite"),migrate=require("../../../db/migrate");
const run=(db,s,p=[])=>new Promise((res,rej)=>db.run(s,p,function(e){e?rej(e):res(this);}));
const get=(db,s,p=[])=>new Promise((res,rej)=>db.get(s,p,(e,r)=>e?rej(e):res(r||null)));
const all=(db,s,p=[])=>new Promise((res,rej)=>db.all(s,p,(e,r)=>e?rej(e):res(r||[])));
async function setup(label="f2") {const dir=fs.mkdtempSync(path.join(os.tmpdir(),`lp-${label}-`)),dbPath=path.join(dir,"app.db");await sqlite.initDb(dbPath);await migrate.runMigrations({migrationsDir:path.resolve(__dirname,"..","..","..","migrations")});const h=migrate.getMigrationsHealth();if(!h.ok)throw new Error(h.error);const db=sqlite.getDb();await run(db,"INSERT INTO users (id,role,display_name) VALUES ('f2u1','owner','F2 One'),('f2u2','owner','F2 Two')");return {dir,dbPath,db,run:(s,p)=>run(db,s,p),get:(s,p)=>get(db,s,p),all:(s,p)=>all(db,s,p)};}
async function cleanup(c){await sqlite.closeDb();if(c&&c.dir&&path.basename(c.dir).startsWith("lp-f2"))fs.rmSync(c.dir,{recursive:true,force:true});}
module.exports={setup,cleanup};
