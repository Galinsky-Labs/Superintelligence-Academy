// The learner's records (SIA-014): progress, enrollments, attempts, settings; settings update; full deletion.
import {learnerRoute,body,ApiError} from '../../../lib/api.mjs';
import {recommendNext} from '../../../lib/courses.mjs';
import {loadRecords} from '../../../lib/records.mjs';
export const dynamic='force-dynamic';
export const GET=request=>learnerRoute(request,async({q,learner,catalog})=>{
 const r=await loadRecords(q,learner.identity_id);
 const goal=new URL(request.url).searchParams.get('goal')||null;
 const completed=new Set(r.progress.filter(p=>p.status==='completed').map(p=>p.lesson_id));
 const resume=r.progress.find(p=>p.status==='started')||null;
 return {settings:{adaptiveRecommendations:learner.adaptive_recommendations,analyticsConsent:learner.analytics_consent},...r,resume,
  recommendation:recommendNext({catalog,completed,enrolled:r.enrollments.map(e=>e.course_id),goal,adaptive:learner.adaptive_recommendations})};
});
export const PATCH=request=>learnerRoute(request,async({q,learner})=>{
 const b=await body(request);
 for(const k of ['adaptiveRecommendations','analyticsConsent'])if(b[k]!==undefined&&typeof b[k]!=='boolean')throw new ApiError(400,'invalid_setting');
 const r=(await q.query(`UPDATE learners SET adaptive_recommendations=coalesce($2,adaptive_recommendations),analytics_consent=coalesce($3,analytics_consent),updated_at=now() WHERE identity_id=$1 RETURNING *`,
  [learner.identity_id,b.adaptiveRecommendations??null,b.analyticsConsent??null])).rows[0];
 if(b.analyticsConsent===false)await q.query('DELETE FROM learning_events WHERE identity_id=$1',[learner.identity_id]);
 return {adaptiveRecommendations:r.adaptive_recommendations,analyticsConsent:r.analytics_consent};
});
/** Deletes every Academy record for this identity. Engine projects are owned by the engine and are untouched. */
export const DELETE=request=>learnerRoute(request,async({q,learner})=>{
 const b=await body(request);if(b.confirm!=='DELETE')throw new ApiError(400,'confirmation_required');
 await q.query('DELETE FROM learners WHERE identity_id=$1',[learner.identity_id]);
 return {deleted:true,scope:'Academy learning records (enrollments, progress, attempts, events, settings)'};
});
