"use strict";
function installRoutes(app,{store,requireUser,requireCsrf,limiter=(_q,_s,n)=>n()}) {
  const base='/api/read-together';
  app.use(base,limiter,(_q,res,next)=>{res.set('Cache-Control','no-store');next();});
  const route=(method,path,fn)=>app[method](base+path,async(req,res)=>{
    const auth=await requireUser(req,res);if(!auth)return;
    if(method!=='get'&&!requireCsrf(req,res,auth))return;
    try {
      if(method!=='get'&&(!req.is('application/json')||Buffer.byteLength(JSON.stringify(req.body||{}))>16000)) return res.status(413).json({ok:false,error:'RT_TOO_LARGE'});
      res.json({ok:true,...await fn(auth.user.id,req)});
    }catch(e){const code=/^RT_/.test(e.code||'')?e.code:'RT_ACCESS_REVOKED';res.status(code==='RT_INVALID'?400:code==='RT_TOO_LARGE'?413:code==='RT_UNAVAILABLE'?410:409).json({ok:false,error:code});}
  });
  route('post','/sessions',(u,r)=>store.start(u,r.body));
  route('post','/stop-pending',(u,r)=>store.stopPending(u,r.body));
  route('get','/sessions/:id',(u,r)=>store.read(u,r.params.id,r.query.tab_id));
  route('post','/sessions/:id/context',(u,r)=>store.update(u,r.params.id,r.body));
  route('post','/sessions/:id/stop',(u,r)=>store.stop(u,r.params.id,r.body));
  route('post','/sessions/:id/decision',(u,r)=>store.decide(u,r.params.id,r.body));
}
module.exports={installRoutes};
