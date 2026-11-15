// Streams a lesson-scoped tutor answer from the engine (SSE). The engine enforces the spend ceiling and
// labels simulator output; this route adds lesson citations and only reads an artifact with explicit consent.
import {currentSession,engineBase,sameOrigin,PRODUCT} from '../../../lib/session.mjs';
import {retrieveLessonContext,buildTutorRequest,tutorBudgetMicro} from '../../../lib/tutor.mjs';
export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,code)=>Response.json({code},{status,headers:{'Cache-Control':'no-store'}});
const TUTOR_PROJECT='Academy tutor';

export async function POST(request,{fetchImpl=fetch,env=process.env}={}){
 const base=engineBase(env);if(!base)return fail(503,'engine_unconfigured');
 if(!sameOrigin(request))return fail(403,'cross_site_request');
 const session=currentSession(request,env);if(!session)return fail(401,'unauthenticated');
 let b;try{b=await request.json()}catch{return fail(400,'invalid_json')}
 const tenantId=String(b.tenantId||'');if(!UUID.test(tenantId))return fail(400,'invalid_tenant');
 const context=retrieveLessonContext(String(b.lessonId||''),b.question);if(!context)return fail(404,'lesson_not_found');
 const headers={Authorization:'Bearer '+session.token,'X-SIE-Product':PRODUCT,'X-Tenant-Id':tenantId,'Content-Type':'application/json',Accept:'application/json'};
 const call=async(method,path,body)=>{const r=await fetchImpl(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.code||'engine_error'),{status:r.status,code:d?.code||'engine_error'});return d;};
 let artifact=null;
 try{
  if(b.shareArtifact===true){
   if(!UUID.test(String(b.projectId||''))||!UUID.test(String(b.artifactId||'')))return fail(400,'invalid_artifact');
   const a=await call('GET',`/v1/projects/${b.projectId}/artifacts/${b.artifactId}`);
   if(typeof a.body!=='string')return fail(422,'artifact_not_text');
   artifact={title:a.title,revision:a.revision,text:a.body};
  }
  const found=await call('GET','/v1/projects?q='+encodeURIComponent(TUTOR_PROJECT));
  const project=(found.items||[]).find(p=>p.title===TUTOR_PROJECT)||await call('POST','/v1/projects',{title:TUTOR_PROJECT,kind:'general',description:'Questions asked to the Academy tutor'});
  const req=buildTutorRequest({context,question:b.question,artifact});
  const upstream=await fetchImpl(base+`/v1/projects/${project.id}/generate`,{method:'POST',headers:{...headers,Accept:'text/event-stream'},cache:'no-store',signal:request.signal,
   body:JSON.stringify({...req,stream:true,budgetCeilingMicro:tutorBudgetMicro(env),...(b.model&&typeof b.model==='object'?{model:{provider:String(b.model.provider),model:String(b.model.model)}}:{})})});
  if(!upstream.ok){const d=await upstream.json().catch(()=>null);return fail(upstream.status,d?.code||'engine_error');}
  const enc=new TextEncoder();
  const citations={lessons:context.sources.map(s=>({id:s.id,title:s.title,version:s.version})),artifact:artifact?{title:artifact.title,revision:artifact.revision}:null,budgetCeilingMicro:tutorBudgetMicro(env)};
  const body=new ReadableStream({async start(controller){
   controller.enqueue(enc.encode(`event: context\ndata: ${JSON.stringify(citations)}\n\n`));
   const reader=upstream.body.getReader();
   try{for(;;){const {done,value}=await reader.read();if(done)break;controller.enqueue(value);}}catch{}finally{controller.close();}
  }});
  return new Response(body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch(err){return fail(err.status&&err.status<500?err.status:502,err.code||'engine_unreachable')}
}
