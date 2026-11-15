import {learnerRoute,body,ApiError,engineCall} from '../../../../../lib/api.mjs';
import {loadDraft,canRead,serializeDraft,checkDraftContent,review,isEditor} from '../../../../../lib/authoring.mjs';
export const dynamic='force-dynamic';
export const GET=(request,{params})=>learnerRoute(request,async({q,learner,env})=>{
 const {id}=await params;const d=await loadDraft(q,id);if(!canRead(d,learner,env))throw new ApiError(404,'draft_not_found');
 const reviews=(await q.query('SELECT reviewer_id,decision,checks,notes,draft_revision,created_at FROM authoring_reviews WHERE draft_id=$1 ORDER BY created_at',[d.id])).rows;
 return {...serializeDraft(d),validation:checkDraftContent(d.content,d.course_id),reviews,canReview:isEditor(learner.identity_id,env)};
});
export const PUT=(request,{params})=>learnerRoute(request,async({q,learner})=>{
 const {id}=await params;const d=await loadDraft(q,id);
 if(d.author_id!==learner.identity_id)throw new ApiError(403,'author_only');
 if(!['draft','changes_requested'].includes(d.status))throw new ApiError(409,'not_editable');
 const b=await body(request);if(b.expectedRevision!==d.revision)throw new ApiError(409,'revision_conflict');
 checkDraftContent(b.content,d.course_id);
 const r=(await q.query("UPDATE authoring_drafts SET content=$2,revision=revision+1,status='draft',ai_assisted=ai_assisted OR $3,updated_at=now() WHERE id=$1 RETURNING *",[d.id,b.content,b.aiAssisted===true])).rows[0];
 return serializeDraft(r);
});
/** {action:'submit'} | {action:'review',decision,checks,notes} | {action:'ai-assist',tenantId,instruction} */
export const POST=(request,{params})=>learnerRoute(request,async({q,session,learner,env})=>{
 const {id}=await params;const d=await loadDraft(q,id);const b=await body(request);
 if(b.action==='submit'){
  if(d.author_id!==learner.identity_id)throw new ApiError(403,'author_only');
  if(!['draft','changes_requested'].includes(d.status))throw new ApiError(409,'not_editable');
  const errors=checkDraftContent(d.content,d.course_id);if(errors.length)throw new ApiError(422,'invalid_course',errors.join('; '));
  await q.query("UPDATE authoring_drafts SET status='submitted',updated_at=now() WHERE id=$1",[d.id]);return {status:'submitted'};
 }
 if(b.action==='review')return review(q,d,learner,b,env);
 if(b.action==='ai-assist'){
  if(d.author_id!==learner.identity_id)throw new ApiError(403,'author_only');
  const instruction=String(b.instruction||'').trim();if(!instruction||instruction.length>2000)throw new ApiError(400,'invalid_instruction');
  const found=await engineCall(session,{tenantId:b.tenantId,env},'GET','/v1/projects?q='+encodeURIComponent('Academy authoring'));
  const project=(found.items||[]).find(p=>p.title==='Academy authoring')||await engineCall(session,{tenantId:b.tenantId,env},'POST','/v1/projects',{title:'Academy authoring',kind:'writing'});
  const out=await engineCall(session,{tenantId:b.tenantId,env},'POST',`/v1/projects/${project.id}/generate`,{stream:false,maxOutputTokens:1500,budgetCeilingMicro:100000,title:'Authoring: '+instruction.slice(0,60),
   system:'You help an Academy author draft lesson text. Write clear, accurate, accessible prose for adult learners. Mark any fact you are not certain of with [verify]. Do not invent statistics, prices or citations.',
   prompt:'Course: '+d.content.title+'\nInstruction: '+instruction});
  return {suggestion:out.output?.text||'',simulated:Boolean(out.output?.simulated),costMicro:out.costMicro,note:'AI suggestion: an editor must still verify facts, rights and accessibility before publishing.'};
 }
 throw new ApiError(400,'invalid_action');
});
