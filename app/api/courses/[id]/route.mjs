// One course at a version: the learner's enrolled version (preserved for ongoing learners), ?version=n, or latest.
import {currentSession} from '../../../../lib/session.mjs';
import {db,publishedVersions} from '../../../../lib/db.mjs';
import {mergeCatalog,latest,publicCourse} from '../../../../lib/courses.mjs';
import {reply} from '../../../../lib/api.mjs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){
 const {id}=await params;const q=db();let versions=[],enrolledVersion=null;
 try{if(q){versions=await publishedVersions(q);const s=currentSession(request);
  if(s)enrolledVersion=(await q.query('SELECT course_version FROM enrollments WHERE identity_id=$1 AND course_id=$2',[s.identityId,id])).rows[0]?.course_version??null;}}catch{}
 const all=mergeCatalog(versions).get(id);if(!all)return reply({code:'course_not_found'},404);
 const asked=Number(new URL(request.url).searchParams.get('version'))||enrolledVersion;
 const course=(asked&&all.find(v=>v.version===asked))||latest(all);
 return reply({...publicCourse(course),enrolledVersion,latestVersion:latest(all).version,updateAvailable:enrolledVersion!=null&&enrolledVersion<latest(all).version});
}
