// Enroll (free access) in the latest version; re-enrolling with {upgrade:true} moves to the latest version.
import {learnerRoute,body,ApiError} from '../../../lib/api.mjs';
import {latest} from '../../../lib/courses.mjs';
import {recordEvent} from '../../../lib/db.mjs';
export const dynamic='force-dynamic';
export const POST=request=>learnerRoute(request,async({q,learner,catalog})=>{
 const b=await body(request);const versions=catalog.get(String(b.courseId||''));if(!versions)throw new ApiError(404,'course_not_found');
 const v=latest(versions).version;
 const r=await q.query(`INSERT INTO enrollments(identity_id,course_id,course_version) VALUES($1,$2,$3)
  ON CONFLICT(identity_id,course_id) DO UPDATE SET course_version=CASE WHEN $4 THEN EXCLUDED.course_version ELSE enrollments.course_version END RETURNING *`,[learner.identity_id,b.courseId,v,b.upgrade===true]);
 await recordEvent(q,learner,'enroll',{courseId:b.courseId});
 return {courseId:r.rows[0].course_id,courseVersion:r.rows[0].course_version,enrolledAt:r.rows[0].enrolled_at};
});
