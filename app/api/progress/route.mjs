// Lesson progress and resumable checkpoints (SIA-014). courseId 'registry' covers the short contextual lessons.
import {learnerRoute,body,ApiError} from '../../../lib/api.mjs';
import {latest} from '../../../lib/courses.mjs';
import {verified} from '../../../lib/lessons.mjs';
import {recordEvent} from '../../../lib/db.mjs';
export const dynamic='force-dynamic';
export const POST=request=>learnerRoute(request,async({q,learner,catalog})=>{
 const b=await body(request);const courseId=String(b.courseId||''),lessonId=String(b.lessonId||'');
 if(!['started','completed'].includes(b.status))throw new ApiError(400,'invalid_status');
 let version=1;
 if(courseId==='registry'){if(!verified.publicLessons.some(l=>l.id===lessonId))throw new ApiError(404,'lesson_not_found');}
 else{
  const e=(await q.query('SELECT course_version FROM enrollments WHERE identity_id=$1 AND course_id=$2',[learner.identity_id,courseId])).rows[0];
  if(!e)throw new ApiError(409,'not_enrolled');
  const course=(catalog.get(courseId)||[]).find(v=>v.version===e.course_version)||latest(catalog.get(courseId));
  if(!course?.lessons.some(l=>l.id===lessonId))throw new ApiError(404,'lesson_not_found');
  // Course lessons with an assessment are completed only by passing it (POST /api/assessments).
  if(b.status==='completed'&&course.lessons.find(l=>l.id===lessonId).quiz?.length)throw new ApiError(409,'assessment_required');
  version=e.course_version;
 }
 const checkpoint=b.checkpoint&&typeof b.checkpoint==='object'?b.checkpoint:{};
 if(JSON.stringify(checkpoint).length>4000)throw new ApiError(413,'checkpoint_too_large');
 await q.query(`INSERT INTO lesson_progress(identity_id,course_id,lesson_id,course_version,status,checkpoint,completed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5='completed' THEN now() END)
  ON CONFLICT(identity_id,course_id,lesson_id) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,updated_at=now(),
   status=CASE WHEN lesson_progress.status='completed' THEN 'completed' ELSE EXCLUDED.status END,
   completed_at=coalesce(lesson_progress.completed_at,EXCLUDED.completed_at)`,[learner.identity_id,courseId,lessonId,version,b.status,checkpoint]);
 await recordEvent(q,learner,'progress:'+b.status,{courseId,lessonId});
 return {courseId,lessonId,status:b.status};
});
