// SIA-011/013/016: versioned course catalog, deterministic assessment and learning-path recommendation.
import catalogDoc from '../content/courses.json' with {type:'json'};
import {verified} from './lessons.mjs';

const ID=/^[a-z0-9-]{3,100}$/;
export const CHECK_TYPES=new Set(['minWords','includesAll','minRevisions','minQuestionMarks','minLinks','minOccurrences']);

export function validateCourse(course,{knownLessonIds=new Set()}={}){
 const errors=[];const lessonIds=new Set();
 if(!ID.test(course?.id||''))errors.push('invalid course id');
 if(!Number.isInteger(course?.version)||course.version<1)errors.push('invalid version');
 if(typeof course?.title!=='string'||course.title.length<5)errors.push('title too short');
 if(!Array.isArray(course?.lessons)||!course.lessons.length)errors.push('course needs lessons');
 for(const l of course?.lessons||[]){
  if(!ID.test(l.id||'')||lessonIds.has(l.id))errors.push('invalid or duplicate lesson id '+l.id);lessonIds.add(l.id);
  if(typeof l.body!=='string'||l.body.length<40)errors.push(l.id+': body too short');
  for(const p of l.prerequisites||[])if(!lessonIds.has(p)&&!knownLessonIds.has(p))errors.push(l.id+': unknown prerequisite '+p);
  for(const q of l.quiz||[]){
   if(!Array.isArray(q.options)||q.options.length<2||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)errors.push(l.id+'/'+q.id+': invalid question');
  }
  for(const c of l.rubric?.checks||[])if(!CHECK_TYPES.has(c.type))errors.push(l.id+': unknown rubric check '+c.type);
 }
 return errors;
}
const registryLessonIds=new Set(verified.publicLessons.map(l=>l.id));
export function loadRepositoryCatalog(doc=catalogDoc){
 if(doc.schemaVersion!==1||!Array.isArray(doc.courses))throw new Error('Invalid course catalog');
 const seen=new Set();
 for(const c of doc.courses){
  if(seen.has(c.id))throw new Error('Duplicate course '+c.id);seen.add(c.id);
  const errors=validateCourse(c,{knownLessonIds:registryLessonIds});if(errors.length)throw new Error(c.id+': '+errors.join('; '));
 }
 return doc.courses;
}
export const REPOSITORY_COURSES=Object.freeze(loadRepositoryCatalog());

/** All versions of every course: repository versions plus published authoring versions from the database. */
export function mergeCatalog(dbVersions=[]){
 const by=new Map();
 for(const c of REPOSITORY_COURSES)by.set(c.id,[{...c,source:'repository'}]);
 for(const v of dbVersions){const c={...v.content,id:v.course_id,version:v.version,status:'published',approvedBy:v.approved_by,publishedAt:v.published_at,source:'authoring'};
  by.set(c.id,[...(by.get(c.id)||[]),c]);}
 for(const list of by.values())list.sort((a,b)=>a.version-b.version);
 return by;
}
export function latest(versions){return versions?.[versions.length-1]||null}
/** Learner-facing view: no answer keys. */
export function publicCourse(course){
 return {id:course.id,version:course.version,title:course.title,summary:course.summary,domain:course.domain,level:course.level,status:course.status,
  authoredBy:course.authoredBy||null,approvedBy:course.approvedBy||null,source:course.source,requiredCapabilities:course.requiredCapabilities||[],
  estimatedComputeMicro:course.estimatedComputeMicro||0,passScore:course.passScore??0.67,
  lessons:course.lessons.map(l=>({id:l.id,title:l.title,minutes:l.minutes,prerequisites:l.prerequisites||[],body:l.body,practice:l.practice||null,
   quiz:(l.quiz||[]).map(q=>({id:q.id,question:q.question,options:q.options})),rubric:l.rubric?{description:l.rubric.description,checks:l.rubric.checks}:null}))};
}

// ---- assessment (deterministic; a model's opinion never decides a pass) ----
export function gradeQuiz(lesson,answers={}){
 const items=lesson.quiz||[];if(!items.length)return {score:1,results:[]};
 const results=items.map(q=>({id:q.id,correct:Number(answers[q.id])===q.answer,explain:q.explain}));
 return {score:results.filter(r=>r.correct).length/items.length,results};
}
const textOf=a=>typeof a?.body==='string'?a.body:'';
export function gradeArtifact(rubric,artifact){
 if(!rubric)return null;
 const text=textOf(artifact),lower=text.toLowerCase(),words=(text.match(/\S+/g)||[]).length;
 const results=rubric.checks.map(c=>{
  switch(c.type){
   case 'minWords':return {check:c,passed:words>=c.value,detail:`${words} words (need ${c.value})`};
   case 'includesAll':{const missing=c.terms.filter(t=>!lower.includes(t.toLowerCase()));return {check:c,passed:!missing.length,detail:missing.length?'missing: '+missing.join(', '):'all terms present'};}
   case 'minRevisions':return {check:c,passed:(artifact?.currentRevision||artifact?.revision||0)>=c.value,detail:`revision ${artifact?.currentRevision||artifact?.revision||0} (need ${c.value})`};
   case 'minQuestionMarks':{const n=(text.match(/\?/g)||[]).length;return {check:c,passed:n>=c.value,detail:`${n} questions (need ${c.value})`};}
   case 'minLinks':{const n=(text.match(/https?:\/\/\S+/g)||[]).length;return {check:c,passed:n>=c.value,detail:`${n} links (need ${c.value})`};}
   case 'minOccurrences':{const n=lower.split(c.term.toLowerCase()).length-1;return {check:c,passed:n>=c.value,detail:`"${c.term}" ×${n} (need ${c.value})`};}
   default:return {check:c,passed:false,detail:'unknown check'};
  }
 });
 const simulated=Boolean(artifact?.provenance?.simulated);
 return {passed:results.every(r=>r.passed),results,evidence:{artifactId:artifact?.id,revision:artifact?.revision,mediaType:artifact?.mediaType,simulated}};
}
export function assess(course,lessonId,{answers,artifact}){
 const lesson=course.lessons.find(l=>l.id===lessonId);if(!lesson)return null;
 const quiz=gradeQuiz(lesson,answers);const rubric=gradeArtifact(lesson.rubric,artifact);
 const passScore=course.passScore??0.67;
 const passed=quiz.score>=passScore&&(!lesson.rubric||Boolean(rubric?.passed));
 const feedback=[...quiz.results.filter(r=>!r.correct).map(r=>({kind:'quiz',id:r.id,text:r.explain})),...(rubric?.results||[]).filter(r=>!r.passed).map(r=>({kind:'rubric',text:r.detail}))];
 return {lesson,quiz,rubric,passed,practiceOnly:Boolean(rubric?.evidence?.simulated),feedback};
}

// ---- curriculum graph and path (SIA-013) ----
export function lessonGraph(catalog){
 const nodes=new Map();
 for(const l of verified.publicLessons)nodes.set(l.id,{id:l.id,title:l.title,domain:l.domain,level:l.level,prerequisites:l.prerequisites,courseId:null});
 for(const versions of catalog.values()){const c=latest(versions);for(const l of c.lessons)nodes.set(l.id,{id:l.id,title:l.title,domain:c.domain,level:c.level,prerequisites:l.prerequisites||[],courseId:c.id});}
 return nodes;
}
/** Next lesson: in the goal domain (or enrolled courses), prerequisites met, not completed. With adaptive
 * recommendations off, simply the next lesson in course order. Returns the reason shown to the learner. */
export function recommendNext({catalog,completed=new Set(),enrolled=[],goal=null,adaptive=true}){
 const graph=lessonGraph(catalog);
 const ready=n=>!completed.has(n.id)&&n.prerequisites.every(p=>completed.has(p));
 const courseOrder=[...enrolled.map(e=>latest(catalog.get(e)) ).filter(Boolean)];
 if(!adaptive){
  for(const c of courseOrder)for(const l of c.lessons)if(!completed.has(l.id))return {lessonId:l.id,courseId:c.id,reason:'Next lesson in course order (adaptive recommendations are off).'};
  return null;
 }
 const candidates=[...graph.values()].filter(n=>ready(n)&&(goal?n.domain===goal:courseOrder.some(c=>c.id===n.courseId)));
 const rank=n=>(n.courseId&&enrolled.includes(n.courseId)?0:1)*10+Number(String(n.level).slice(1));
 candidates.sort((a,b)=>rank(a)-rank(b));
 const pick=candidates[0];if(!pick)return null;
 const why=pick.prerequisites.length?'its prerequisites ('+pick.prerequisites.join(', ')+') are complete':'it has no prerequisites';
 return {lessonId:pick.id,courseId:pick.courseId,reason:(goal?'Matches your goal "'+goal+'" and ':'In a course you are enrolled in and ')+why+'.'};
}
