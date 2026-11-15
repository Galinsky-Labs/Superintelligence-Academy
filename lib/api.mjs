// Shared helpers for Academy's learning-record API routes.
import {currentSession,sameOrigin,engineBase,PRODUCT} from './session.mjs';
import {db,ensureLearner,publishedVersions} from './db.mjs';
import {mergeCatalog} from './courses.mjs';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nostore={'Cache-Control':'no-store'};
export const reply=(body,status=200,headers={})=>Response.json(body,{status,headers:{...nostore,...headers}});
export class ApiError extends Error{constructor(status,code,message){super(message||code);this.status=status;this.code=code;}}
export async function body(request){try{return await request.json()}catch{throw new ApiError(400,'invalid_json')}}
/** Runs fn with {q, session, learner, catalog} or returns the right error response. */
export async function learnerRoute(request,fn,{env=process.env,write=request.method!=='GET'}={}){
 try{
  if(write&&!sameOrigin(request))return reply({code:'cross_site_request'},403);
  const session=currentSession(request,env);if(!session)return reply({code:'unauthenticated'},401);
  const q=db(env);if(!q)return reply({code:'learning_records_unconfigured',message:'ACADEMY_DATABASE_URL is not configured'},503);
  const learner=await ensureLearner(q,session);
  const catalog=mergeCatalog(await publishedVersions(q));
  const out=await fn({q,session,learner,catalog,env});
  return out instanceof Response?out:reply(out);
 }catch(e){
  if(e instanceof ApiError)return reply({code:e.code,message:e.message},e.status);
  console.error(JSON.stringify({event:'api_error',message:e.message}));
  return reply({code:'server_error'},500);
 }
}
/** Calls the engine as the signed-in learner. */
export async function engineCall(session,{tenantId,env=process.env,fetchImpl=fetch},method,path,payload){
 const base=engineBase(env);if(!base)throw new ApiError(503,'engine_unconfigured');
 if(tenantId!==undefined&&!UUID.test(String(tenantId)))throw new ApiError(400,'invalid_tenant');
 let r;
 try{r=await fetchImpl(base+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+session.token,'X-SIE-Product':PRODUCT,Accept:'application/json',...(tenantId?{'X-Tenant-Id':tenantId}:{}),...(payload!==undefined?{'Content-Type':'application/json'}:{})},body:payload===undefined?undefined:JSON.stringify(payload)});}
 catch{throw new ApiError(502,'engine_unreachable')}
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new ApiError(r.status>=500?502:r.status,d?.code||'engine_error',d?.message);
 return d;
}
