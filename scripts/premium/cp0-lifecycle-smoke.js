#!/usr/bin/env node
"use strict";
process.env.CP0_OBSERVER_ENABLED="1";process.env.CP0_OBSERVER_OWNER_IDS="u1,u2";
const dbh=require("./lib/cp0-test-db"),cp0=require("../../agent/controlPlane/observer"),identity=require("../../db/identityRepo"),repo=require("../../db/cp0ObservationRepo");
(async()=>{const ctx=await dbh.setup("cp0-lifecycle");try{for(const userId of["u1","u2"])await cp0.observe({userId,surface:"pwa"},{scenarioId:"agent.plan"},async()=>({ok:true}));await cp0.flushNow();
  const exported=await identity.exportUserData("u1");if(!exported.table_list.includes("cp0_observations"))throw new Error("dynamic export missed cp0 table");const erows=exported.tables.cp0_observations||[];if(erows.length!==2||erows.some(r=>r.user_id!=="u1"))throw new Error("export scope failure");
  await identity.deleteUserData("u1");if((await repo.listForUser("u1")).length)throw new Error("delete left cp0 rows");if((await repo.listForUser("u2")).length!==2)throw new Error("delete crossed tenant");
  await ctx.run("UPDATE cp0_observations SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id='u2'");const purged=await repo.purgeExpired("2026-07-16T00:00:00.000Z");if(purged.observations!==2||(await repo.listForUser("u2")).length)throw new Error("ttl purge failure");
  console.log(JSON.stringify({ok:true,export_rows:erows.length,delete_rows:2,purge_rows:purged.observations,cross_user:0}));}finally{await dbh.cleanup(ctx);}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
