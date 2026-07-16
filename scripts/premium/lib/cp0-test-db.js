"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const sqlite = require("../../../db/sqlite");
const migrate = require("../../../db/migrate");
const run = (db, sql, p=[]) => new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this);}));
const get = (db, sql, p=[]) => new Promise((res,rej)=>db.get(sql,p,(e,r)=>e?rej(e):res(r)));
const all = (db, sql, p=[]) => new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r||[])));
async function setup(label="cp0") {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`lp-${label}-`)), dbPath=path.join(dir,"app.db");
  await sqlite.initDb(dbPath); await migrate.runMigrations({migrationsDir:path.resolve(__dirname,"..","..","..","migrations")});
  const mh=migrate.getMigrationsHealth(); if(!mh.ok) throw new Error("migration failed: "+mh.error);
  const db=sqlite.getDb(); await run(db,"INSERT INTO users (id,role,display_name) VALUES ('u1','owner','CP0 One'),('u2','owner','CP0 Two')");
  return {dir,db,dbPath,run:(s,p)=>run(db,s,p),get:(s,p)=>get(db,s,p),all:(s,p)=>all(db,s,p)};
}
async function cleanup(ctx){await sqlite.closeDb();if(ctx&&ctx.dir&&path.basename(ctx.dir).startsWith("lp-cp0"))fs.rmSync(ctx.dir,{recursive:true,force:true});}
module.exports={setup,cleanup};
