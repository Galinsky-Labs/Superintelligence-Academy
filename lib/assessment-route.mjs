// SIA-011/012: deterministic assessment. Quiz answers are graded server-side against the enrolled course
// version; artifact rubrics are checked against the actual engine artifact (fetched as the learner). Evidence
// from simulator output is recorded as practice only and never counted as live work.
import {learnerRoute,body,ApiError,engineCall,UUID} from './api.mjs';
import {assess,latest} from './courses.mjs';
import {recordEvent} from './db.mjs';
export function assessmentHandler(opts={}){return request=>learnerRoute(request,async({q,session,learner,catalog,env})=>{
 const b=await body(request);const courseId=String(b.courseId||''),lessonId=String(b.lessonId||'');
 const e=(await q.query('SELECT course_version FROM enrollments WHERE identity_id=$1 AND course_id=$2',[learner.identity_id,courseId])).rows[0];
 if(!e)throw new ApiError(409,'not_enrolled');
 const course=(catalog.get(courseId)||[]).find(v=>v.version===e.course_version)||latest(catalog.get(courseId)||[]);
 const lesson=course?.lessons.find(l=>l.id===lessonId);if(!lesson)throw new ApiError(404,'lesson_not_found');
 let artifact=null;
 if(lesson.rubric){
  if(!UUID.test(String(b.projectId||''))||!UUID.test(String(b.artifactId||'')))throw new ApiError(400,'artifact_required','Choose the project artifact this rubric should check');
  artifact=await engineCall(session,{tenantId:b.tenantId,env,fetchImpl:opts.fetchImpl},'GET',`/v1/projects/${b.projectId}/artifacts/${b.artifactId}`);
 }
 const answers=b.answers&&typeof b.answers==='object'?Object.fromEntries(Object.entries(b.answers).slice(0,50).map(([k,v])=>[String(k).slice(0,20),Number(v)])):{};
 const result=assess(course,lessonId,{answers,artifact});
 const passedLive=result.passed&&!result.practiceOnly;
 const rubric=result.rubric?{passed:result.rubric.passed,results:result.rubric.results.map(r=>({type:r.check.type,passed:r.passed,detail:r.detail})),evidence:{...result.rubric.evidence,projectId:b.projectId}}:null;
 const row=(await q.query(`INSERT INTO assessment_attempts(identity_id,course_id,course_version,lesson_id,answers,quiz_score,rubric,passed,practice_only,feedback)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,created_at`,[learner.identity_id,courseId,course.version,lessonId,answers,result.quiz.score,rubric,passedLive,result.practiceOnly,JSON.stringify(result.feedback)])).rows[0];
 if(passedLive)await q.query(`INSERT INTO lesson_progress(identity_id,course_id,lesson_id,course_version,status,completed_at) VALUES($1,$2,$3,$4,'completed',now())
  ON CONFLICT(identity_id,course_id,lesson_id) DO UPDATE SET status='completed',completed_at=coalesce(lesson_progress.completed_at,now()),updated_at=now()`,[learner.identity_id,courseId,lessonId,course.version]);
 await recordEvent(q,learner,passedLive?'assessment:passed':'assessment:attempt',{courseId,lessonId});
 return {attemptId:row.id,passed:passedLive,practiceOnly:result.practiceOnly,quizScore:result.quiz.score,passScore:course.passScore??0.67,
  quiz:result.quiz.results.map(r=>({id:r.id,correct:r.correct,explain:r.correct?null:r.explain})),rubric,feedback:result.feedback,
  note:result.practiceOnly?'The checked artifact was produced by the simulator, so this attempt counts as practice only. Create or edit the work yourself (or with a real model) and resubmit.':
   'Graded by fixed rules against your saved work; no AI judgement decides this result.'};
});}
