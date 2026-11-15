// Academy against the pinned engine (PostgreSQL + simulator): token sign-in, same-origin proxy and the
// lesson-scoped tutor with and without a consented artifact. Needs TEST_ADMIN_DATABASE_URL and `npm run engine:deps`.
import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const engineDeps=existsSync(new URL('../vendor/engine/node_modules/pg/package.json',import.meta.url));
const skip=!process.env.TEST_ADMIN_DATABASE_URL?'set TEST_ADMIN_DATABASE_URL':!engineDeps?'run npm run engine:deps':false;
async function sse(res){const t=await res.text();return t.split('\n\n').map(f=>({event:/^event: (.*)$/m.exec(f)?.[1],data:/^data: (.*)$/m.exec(f)?.[1]})).filter(x=>x.event&&x.data).map(x=>({event:x.event,data:JSON.parse(x.data)}));}

test('sign in, then ask the tutor about a lesson with and without a shared artifact',{skip,timeout:120000},async()=>{
 const {freshDatabase,startApp}=await import('../vendor/engine/test/helpers/harness.mjs');
 const {POST:signIn}=await import('../app/api/session/route.mjs');
 const {POST:tutor}=await import('../app/api/tutor/route.mjs');
 const {proxyToEngine}=await import('../lib/engine-proxy.mjs');
 const db=await freshDatabase();const app=await startApp(db,{SIE_SIM_DELAY_MS:'1'});
 const ac=new AbortController();const loop=app.worker.run({signal:ac.signal});
 const saved={ENGINE_API_URL:process.env.ENGINE_API_URL,SIA_SESSION_SECRET:process.env.SIA_SESSION_SECRET};
 process.env.ENGINE_API_URL=app.base;process.env.SIA_SESSION_SECRET='6b'.repeat(32);
 try{
  const token=(await (await fetch(app.base+'/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"handle":"learner"}'})).json()).token;
  const origin='https://academy.test',json={'Content-Type':'application/json','sec-fetch-site':'same-origin'};
  const ok=await signIn(new Request(origin+'/api/session',{method:'POST',headers:json,body:JSON.stringify({token})}));
  assert.equal(ok.status,200);const cookie=ok.headers.get('set-cookie').split(';')[0];
  const proxied=async(method,path,body)=>{const r=await proxyToEngine(new Request(origin+path,{method,headers:{...json,cookie,...(tenantId?{'x-tenant-id':tenantId}:{})},body:body===undefined?undefined:JSON.stringify(body)}));return r.json();};
  let tenantId;tenantId=(await proxied('GET','/v1/tenants')).items[0].id;
  const ask=body=>tutor(new Request(origin+'/api/tutor',{method:'POST',headers:{...json,cookie},body:JSON.stringify({tenantId,...body})}));
  assert.equal((await tutor(new Request(origin+'/api/tutor',{method:'POST',headers:json,body:'{}'}))).status,401);
  assert.equal((await ask({lessonId:'nope',question:'?'})).status,404);
  const r=await ask({lessonId:'short-research-objective',question:'How should I choose sources?'});
  assert.equal(r.status,200);
  const evs=await sse(r);
  const ctx=evs.find(e=>e.event==='context');assert.ok(ctx.data.lessons.some(l=>l.id==='short-research-objective'));assert.equal(ctx.data.artifact,null);
  assert.match(evs.filter(e=>e.event==='token').map(e=>e.data.text).join(''),/SIMULATED/);
  const result=evs.find(e=>e.event==='result');assert.ok(result,'tutor run succeeded');assert.equal(result.data.output.simulated,true);
  // consented artifact
  const project=await proxied('POST','/v1/projects',{title:'My essay',kind:'writing'});
  const art=await proxied('POST',`/v1/projects/${project.id}/artifacts`,{title:'Draft',text:'Wetlands store carbon in peat.'});
  const shared=await sse(await ask({lessonId:'short-research-objective',question:'Is my claim sourced?',shareArtifact:true,projectId:project.id,artifactId:art.id}));
  assert.equal(shared.find(e=>e.event==='context').data.artifact.title,'Draft');
  // the tutor's questions live in the learner's own "Academy tutor" project
  const projects=await proxied('GET','/v1/projects');assert.equal(projects.items.filter(p=>p.title==='Academy tutor').length,1);
 }finally{
  for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  ac.abort();await loop;await app.stop();await db.drop();
 }
});
