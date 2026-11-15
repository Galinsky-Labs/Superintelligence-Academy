import {learnerRoute,body,ApiError} from '../../../../lib/api.mjs';
import {isEditor,serializeDraft,startingContent,checkDraftContent} from '../../../../lib/authoring.mjs';
export const dynamic='force-dynamic';
const ID=/^[a-z0-9-]{3,100}$/;
export const GET=request=>learnerRoute(request,async({q,learner,env})=>{
 const editor=isEditor(learner.identity_id,env);
 const rows=(await q.query(`SELECT * FROM authoring_drafts WHERE author_id=$1 ${editor?"OR status='submitted'":''} ORDER BY updated_at DESC LIMIT 200`,[learner.identity_id])).rows;
 return {editor,items:rows.map(serializeDraft)};
});
/** {courseId, fromCourseId?} copies an existing course (e.g. an AI-authored preview) as the starting draft. */
export const POST=request=>learnerRoute(request,async({q,learner,catalog})=>{
 const b=await body(request);const courseId=String(b.courseId||b.fromCourseId||'');
 if(!ID.test(courseId))throw new ApiError(400,'invalid_course_id');
 const content=b.fromCourseId?startingContent(catalog,String(b.fromCourseId)):(b.content||{title:'Untitled course',summary:'',domain:'research',level:'L2',status:'draft',
  lessons:[{id:courseId+'-1',title:'First lesson',minutes:10,prerequisites:[],body:'Write the lesson here: what the learner will do, why it matters and how they will know they succeeded.',quiz:[],rubric:null}]});
 if(!content)throw new ApiError(404,'course_not_found');
 checkDraftContent(content,courseId);
 const d=(await q.query('INSERT INTO authoring_drafts(author_id,course_id,content,ai_assisted) VALUES($1,$2,$3,$4) RETURNING *',[learner.identity_id,courseId,content,Boolean(b.fromCourseId&&content.authoredBy&&/AI-authored/.test(content.authoredBy))])).rows[0];
 return serializeDraft(d);
});
