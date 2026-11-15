// SIA-015: AI-assisted authoring with human editorial approval. Publishing requires an editor (listed in
// SIA_EDITOR_IDENTITY_IDS) other than the author (unless SIA_ALLOW_SELF_REVIEW=1) to confirm factual accuracy,
// rights, plagiarism and accessibility checks. Approved drafts become new immutable course versions.
import {ApiError,UUID} from './api.mjs';
import {validateCourse,latest} from './courses.mjs';
import {verified} from './lessons.mjs';
export const REVIEW_CHECKS=Object.freeze(['factual','rights','plagiarism','accessibility']);
export function editorIds(env=process.env){return new Set(String(env.SIA_EDITOR_IDENTITY_IDS||'').split(',').map(s=>s.trim().toLowerCase()).filter(id=>UUID.test(id)))}
export const isEditor=(identityId,env=process.env)=>editorIds(env).has(String(identityId).toLowerCase());
const knownLessonIds=new Set(verified.publicLessons.map(l=>l.id));
export function checkDraftContent(content,courseId){
 if(!content||typeof content!=='object'||Array.isArray(content))throw new ApiError(400,'invalid_content');
 if(JSON.stringify(content).length>300000)throw new ApiError(413,'content_too_large');
 return validateCourse({...content,id:courseId,version:content.version||1},{knownLessonIds});
}
export const serializeDraft=d=>({id:d.id,authorId:d.author_id,courseId:d.course_id,status:d.status,aiAssisted:d.ai_assisted,revision:d.revision,content:d.content,createdAt:d.created_at,updatedAt:d.updated_at});
export async function loadDraft(q,id){
 if(!UUID.test(String(id)))throw new ApiError(404,'draft_not_found');
 const d=(await q.query('SELECT * FROM authoring_drafts WHERE id=$1',[id])).rows[0];if(!d)throw new ApiError(404,'draft_not_found');return d;
}
export function canRead(d,learner,env){return d.author_id===learner.identity_id||isEditor(learner.identity_id,env)}
export async function review(q,d,learner,{decision,checks={},notes=''},env=process.env){
 if(!isEditor(learner.identity_id,env))throw new ApiError(403,'editor_required');
 if(d.author_id===learner.identity_id&&env.SIA_ALLOW_SELF_REVIEW!=='1')throw new ApiError(403,'peer_review_required','An editor other than the author must review');
 if(d.status!=='submitted')throw new ApiError(409,'not_submitted');
 if(!['approve','request_changes'].includes(decision))throw new ApiError(400,'invalid_decision');
 const confirmed=Object.fromEntries(REVIEW_CHECKS.map(k=>[k,checks[k]===true]));
 if(decision==='approve'&&!REVIEW_CHECKS.every(k=>confirmed[k]))throw new ApiError(400,'checks_incomplete','Approval requires factual, rights, plagiarism and accessibility checks');
 const errors=checkDraftContent(d.content,d.course_id);if(decision==='approve'&&errors.length)throw new ApiError(422,'invalid_course',errors.join('; '));
 await q.query('INSERT INTO authoring_reviews(draft_id,draft_revision,reviewer_id,decision,checks,notes) VALUES($1,$2,$3,$4,$5,$6)',[d.id,d.revision,learner.identity_id,decision,confirmed,String(notes).slice(0,5000)]);
 if(decision==='request_changes'){await q.query("UPDATE authoring_drafts SET status='changes_requested',updated_at=now() WHERE id=$1",[d.id]);return {status:'changes_requested'};}
 const client=await q.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[d.course_id]);
  const dbMax=(await client.query('SELECT max(version) v FROM course_versions WHERE course_id=$1',[d.course_id])).rows[0].v||0;
  const version=Math.max(dbMax,d.content.repositoryVersion||0)+1;
  const content={...d.content,version,status:'published',reviewedChecks:confirmed};delete content.repositoryVersion;
  await client.query('INSERT INTO course_versions(course_id,version,content,approved_by,draft_id) VALUES($1,$2,$3,$4,$5)',[d.course_id,version,content,learner.identity_id,d.id]);
  await client.query("UPDATE authoring_drafts SET status='published',updated_at=now() WHERE id=$1",[d.id]);
  await client.query('COMMIT');
  return {status:'published',courseId:d.course_id,version};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
export function startingContent(catalog,courseId){
 const versions=catalog.get(courseId);if(!versions)return null;
 const c=latest(versions);const {source,approvedBy,publishedAt,reviewedChecks,...rest}=c;
 return {...rest,status:'draft',repositoryVersion:c.version};
}
