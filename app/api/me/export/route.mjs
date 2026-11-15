import {learnerRoute,reply} from '../../../../lib/api.mjs';
import {loadRecords} from '../../../../lib/records.mjs';
export const dynamic='force-dynamic';
export const GET=request=>learnerRoute(request,async({q,learner})=>{
 const events=(await q.query('SELECT kind,course_id,lesson_id,created_at FROM learning_events WHERE identity_id=$1 ORDER BY id',[learner.identity_id])).rows;
 const data={exportedAt:new Date().toISOString(),identityId:learner.identity_id,settings:{adaptiveRecommendations:learner.adaptive_recommendations,analyticsConsent:learner.analytics_consent},
  ...await loadRecords(q,learner.identity_id),events};
 return reply(data,200,{'Content-Disposition':'attachment; filename="academy-learning-records.json"'});
});
