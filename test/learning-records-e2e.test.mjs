// Learning records against PostgreSQL and the pinned engine: enrollment, progress, deterministic assessment of a
// real artifact, simulator evidence as practice, export/settings/delete, and editorial publishing of a new version.
import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import pg from 'pg';import {randomBytes} from 'node:crypto';
const engineDeps=existsSync(new URL('../vendor/engine/node_modules/pg/package.json',import.meta.url));
const ADMIN=process.env.TEST_ADMIN_DATABASE_URL;
const skip=!ADMIN?'set TEST_ADMIN_DATABASE_URL':!engineDeps?'run npm run engine:deps':false;
test('learning records, assessment evidence and editorial publishing',{skip,timeout:180000},async()=>{
 const {freshDatabase,startApp}=await import('../vendor/engine/test/helpers/harness.mjs');
 const {migrate}=await import('../scripts/migrate.mjs');const {closeDb}=await import('../lib/db.mjs');
 const session=await import('../app/api/session/route.mjs');
 const routes={courses:await import('../app/api/courses/route.mjs'),course:await import('../app/api/courses/[id]/route.mjs'),enroll:await import('../app/api/enrollments/route.mjs'),
  progress:await import('../app/api/progress/route.mjs'),assess:await import('../app/api/assessments/route.mjs'),me:await import('../app/api/me/route.mjs'),
  exp:await import('../app/api/me/export/route.mjs'),drafts:await import('../app/api/authoring/drafts/route.mjs'),draft:await import('../app/api/authoring/drafts/[id]/route.mjs')};
 const engDb=await freshDatabase();const app=await startApp(engDb,{SIE_SIM_DELAY_MS:'1'});
 const ac=new AbortController();const loop=app.worker.run({signal:ac.signal});
 const acName='sia_t_'+randomBytes(4).toString('hex');const admin=new pg.Client({connectionString:ADMIN});await admin.connect();await admin.query(`CREATE DATABASE ${acName}`);
 const u=new URL(ADMIN);u.pathname='/'+acName;
 const saved={...process.env};
 Object.assign(process.env,{ENGINE_API_URL:app.base,SIA_SESSION_SECRET:'7c'.repeat(32),ACADEMY_DATABASE_URL:u.href});
 try{
  assert.equal((await migrate(u.href)).length,1);assert.equal((await migrate(u.href))[0].status,'unchanged');
  const origin='https://academy.test',J={'Content-Type':'application/json','sec-fetch-site':'same-origin'};
  async function signIn(handle){
   const token=(await (await fetch(app.base+'/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})})).json()).token;
   const r=await session.POST(new Request(origin+'/api/session',{method:'POST',headers:J,body:JSON.stringify({token})}));
   const me=await r.json();const cookie=r.headers.get('set-cookie').split(';')[0];
   const tenantId=me.tenants[0].id;
   const engine=async(method,path,body)=>(await fetch(app.base+path,{method,headers:{Authorization:'Bearer '+token,'X-Tenant-Id':tenantId,'Content-Type':'application/json'},body:body&&JSON.stringify(body)})).json();
   const call=async(mod,method,path,body,params)=>{const res=await mod[method](new Request(origin+path,{method,headers:{...J,cookie},body:body===undefined?undefined:JSON.stringify(body)}),params?{params:Promise.resolve(params)}:undefined);return {status:res.status,data:await res.json(),headers:res.headers};};
   return {identityId:me.identity.id,tenantId,engine,call};
  }
  const L=await signIn('learner-a');
  const a0=await L.call(routes.assess,'POST','/api/assessments',{courseId:'foundations-research',lessonId:'fr-questions'});assert.equal(a0.data.code,'not_enrolled');
  const en=await L.call(routes.enroll,'POST','/api/enrollments',{courseId:'foundations-research'});assert.equal(en.status,200);assert.equal(en.data.courseVersion,1);
  assert.equal((await L.call(routes.progress,'POST','/api/progress',{courseId:'foundations-research',lessonId:'fr-questions',status:'started',checkpoint:{at:'practice'}})).status,200);
  assert.equal((await L.call(routes.progress,'POST','/api/progress',{courseId:'foundations-research',lessonId:'fr-questions',status:'completed'})).data.code,'assessment_required');
  const course=(await import('../lib/courses.mjs')).REPOSITORY_COURSES.find(c=>c.id==='foundations-research');
  const right=Object.fromEntries(course.lessons[0].quiz.map(q=>[q.id,q.answer]));
  // simulated artifact: practice only
  const p=await L.engine('POST','/v1/projects',{title:'Heat islands',kind:'research'});
  const gen=await L.engine('POST',`/v1/projects/${p.id}/generate`,{stream:false,prompt:'Write research questions about heat islands',model:{provider:'deterministic',model:'sim-text'}});
  const simTry=await L.call(routes.assess,'POST','/api/assessments',{courseId:'foundations-research',lessonId:'fr-questions',answers:right,tenantId:L.tenantId,projectId:p.id,artifactId:gen.artifactId});
  assert.equal(simTry.status,200);assert.equal(simTry.data.passed,false);
  // the learner's own work passes on verifiable checks
  const art=await L.engine('POST',`/v1/projects/${p.id}/artifacts`,{title:'My questions',text:'What raises night temperatures in dense districts? Which roof materials store most heat? How much do street trees cool a block? '+'Evidence: city sensor data and peer-reviewed field studies. '.repeat(8)});
  const pass=await L.call(routes.assess,'POST','/api/assessments',{courseId:'foundations-research',lessonId:'fr-questions',answers:right,tenantId:L.tenantId,projectId:p.id,artifactId:art.id});
  assert.equal(pass.data.passed,true,JSON.stringify(pass.data));assert.equal(pass.data.practiceOnly,false);assert.equal(pass.data.rubric.evidence.artifactId,art.id);
  const me=await L.call(routes.me,'GET','/api/me?goal=research');
  assert.ok(me.data.progress.some(x=>x.lesson_id==='fr-questions'&&x.status==='completed'));
  assert.equal(me.data.attempts.length,2);assert.ok(me.data.attempts.some(a=>a.practice_only));
  assert.equal(me.data.recommendation.lessonId,'fr-cite','next lesson in the enrolled course whose prerequisite is now complete');
  assert.equal((await L.call(routes.me,'PATCH','/api/me',{analyticsConsent:true})).data.analyticsConsent,true);
  await L.call(routes.enroll,'POST','/api/enrollments',{courseId:'foundations-code'});
  const ex=await L.call(routes.exp,'GET','/api/me/export');assert.match(ex.headers.get('content-disposition'),/attachment/);assert.equal(ex.data.enrollments.length,2);assert.ok(ex.data.events.length>=1);
  // authoring: learner-a drafts from the preview course; editor (learner-b) approves with all checks
  const E=await signIn('editor-b');process.env.SIA_EDITOR_IDENTITY_IDS=E.identityId;
  const d=(await L.call(routes.drafts,'POST','/api/authoring/drafts',{fromCourseId:'foundations-research'})).data;assert.equal(d.status,'draft');
  assert.equal((await L.call(routes.draft,'POST','/x',{action:'submit'},{id:d.id})).data.status,'submitted');
  assert.equal((await L.call(routes.draft,'POST','/x',{action:'review',decision:'approve',checks:{factual:true,rights:true,plagiarism:true,accessibility:true}},{id:d.id})).data.code,'editor_required');
  assert.equal((await E.call(routes.draft,'POST','/x',{action:'review',decision:'approve',checks:{factual:true,rights:true}},{id:d.id})).data.code,'checks_incomplete');
  const pub=await E.call(routes.draft,'POST','/x',{action:'review',decision:'approve',checks:{factual:true,rights:true,plagiarism:true,accessibility:true},notes:'Checked sources'},{id:d.id});
  assert.equal(pub.data.status,'published');assert.equal(pub.data.version,2);
  const cat=(await L.call(routes.courses,'GET','/api/courses')).data.items.find(c=>c.id==='foundations-research');
  assert.equal(cat.latestVersion,2);assert.equal(cat.status,'published');assert.equal(cat.enrolledVersion,1);assert.equal(cat.updateAvailable,true);
  assert.equal((await L.call(routes.course,'GET','/api/courses/foundations-research',undefined,{id:'foundations-research'})).data.version,1,'enrolled learners keep their version');
  
  assert.equal((await L.call(routes.me,'DELETE','/api/me',{confirm:'nope'})).status,400);
  assert.equal((await L.call(routes.me,'DELETE','/api/me',{confirm:'DELETE'})).data.deleted,true);
  const after=await L.call(routes.me,'GET','/api/me');assert.equal(after.data.enrollments.length,0);assert.equal(after.data.attempts.length,0);
  // cross-site writes are refused
  const res=await routes.enroll.POST(new Request(origin+'/api/enrollments',{method:'POST',headers:{'Content-Type':'application/json','sec-fetch-site':'cross-site'},body:'{}'}));assert.equal(res.status,403);
 }finally{
  for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);
  await closeDb();ac.abort();await loop;await app.stop();await engDb.drop();
  await admin.query(`DROP DATABASE IF EXISTS ${acName} WITH (FORCE)`);await admin.end();
 }
});
