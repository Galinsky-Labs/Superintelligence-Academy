// Course catalog (SIA-016). Public; with a session and database it adds the learner's enrollments.
import {currentSession} from '../../../lib/session.mjs';
import {db,publishedVersions} from '../../../lib/db.mjs';
import {mergeCatalog,latest} from '../../../lib/courses.mjs';
import {reply} from '../../../lib/api.mjs';
export const dynamic='force-dynamic';
export async function GET(request){
 const q=db();let versions=[];let enrolled=new Map();
 try{
  if(q){versions=await publishedVersions(q);const s=currentSession(request);
   if(s)enrolled=new Map((await q.query('SELECT course_id,course_version FROM enrollments WHERE identity_id=$1',[s.identityId])).rows.map(r=>[r.course_id,r.course_version]));}
 }catch{}
 const catalog=mergeCatalog(versions);
 const items=[...catalog.values()].map(vs=>{const c=latest(vs);const mine=enrolled.get(c.id);
  return {id:c.id,title:c.title,summary:c.summary,domain:c.domain,level:c.level,status:c.status,authoredBy:c.authoredBy||null,source:c.source,
   latestVersion:c.version,versions:vs.map(v=>({version:v.version,status:v.status,source:v.source})),lessonCount:c.lessons.length,
   requiredCapabilities:c.requiredCapabilities||[],estimatedComputeMicro:c.estimatedComputeMicro||0,access:'free',
   enrolledVersion:mine??null,updateAvailable:mine!=null&&mine<c.version};});
 return reply({items,recordsEnabled:Boolean(q)});
}
