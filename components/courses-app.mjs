"use client";
// SIA-016/011/012: catalog, enrollment, course player with practice, lesson checks and resumable progress.
import React,{useEffect,useState} from 'react';
import {useEngineSession} from './engine-session.mjs';
import {api,explain} from './academy-frame.mjs';
const h=React.createElement;
const usd=m=>'$'+(Number(m||0)/1e6).toFixed(2);
export function StatusBadge({course}){
 return course.status==='published'?h('span',{className:'badge badge-published'},'Published'+(course.source==='authoring'?' · editor-approved':'')):
  h('span',{className:'badge badge-preview',title:course.authoredBy||''},'Preview · AI-authored, pending editorial review');
}
function Practice({lesson}){
 const s=useEngineSession();const [out,setOut]=useState(''),[meta,setMeta]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 if(!lesson.practice)return null;
 async function run(){
  setBusy(true);setErr('');setOut('');setMeta(null);
  try{
   const found=await s.client.projects({q:'Academy practice'});
   const p=(found.items||[]).find(x=>x.title==='Academy practice')||await s.client.createProject({title:'Academy practice',kind:'general'});
   let text='',result=null;
   for await(const ev of await s.client.generateStream(p.id,{prompt:lesson.practice.prompt,model:{provider:'deterministic',model:'sim-text'},title:'Practice: '+lesson.title,maxOutputTokens:800})){
    if(ev.event==='token'){text+=ev.data.text;setOut(text)}if(ev.event==='result')result=ev.data;if(ev.event==='error')throw Object.assign(new Error(ev.data.error||ev.data.code),{code:ev.data.code});
   }
   setMeta(result);
  }catch(e){setErr(explain(e))}finally{setBusy(false)}
 }
 return h('section',{className:'practice','aria-label':'Practice'},
  h('h4',null,'Practice'),h('p',null,lesson.practice.prompt),
  s.status==='signed-in'?h('button',{type:'button',onClick:run,disabled:busy},busy?'Running…':'Run a practice example (simulator)'):h('p',null,h('a',{href:'/signin'},'Sign in'),' to run practice examples.'),
  out?h('div',{className:'practice-output'},h('p',{className:'badge badge-preview'},'PRACTICE · SIMULATED — deterministic placeholder output, $0, never counted as your work'),h('pre',null,out)):null,
  meta?h('p',{className:'small'},'Saved in your "Academy practice" project as a simulated artifact.'):null,err?h('p',{role:'alert'},err):null);
}
function LessonCheck({course,lesson,onPassed}){
 const s=useEngineSession();
 const [answers,setAnswers]=useState({}),[projects,setProjects]=useState([]),[projectId,setProjectId]=useState(''),[artifacts,setArtifacts]=useState([]),[artifactId,setArtifactId]=useState('');
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 useEffect(()=>{setAnswers({});setResult(null);setErr('')},[lesson.id]);
 useEffect(()=>{if(lesson.rubric&&s.client)s.client.projects().then(r=>setProjects(r.items||[])).catch(()=>{})},[lesson.id,s.client]);
 useEffect(()=>{if(projectId&&s.client)s.client.artifacts(projectId).then(r=>setArtifacts(r.items||[])).catch(()=>setArtifacts([]));else setArtifacts([])},[projectId,s.client]);
 async function submit(e){
  e.preventDefault();setBusy(true);setErr('');
  try{const r=await api('/api/assessments',{method:'POST',body:{courseId:course.id,lessonId:lesson.id,answers,tenantId:s.tenantId,projectId,artifactId}});setResult(r);if(r.passed)onPassed?.();}
  catch(e){setErr(explain(e))}finally{setBusy(false)}
 }
 return h('form',{className:'lesson-check',onSubmit:submit,'aria-label':'Lesson check'},
  h('h4',null,'Lesson check'),
  ...lesson.quiz.map(q=>h('fieldset',{key:q.id},h('legend',null,q.question),
   ...q.options.map((o,i)=>h('label',{key:i},h('input',{type:'radio',name:lesson.id+'-'+q.id,checked:answers[q.id]===i,onChange:()=>setAnswers(a=>({...a,[q.id]:i}))}),' ',o)),
   result?.quiz?.find(r=>r.id===q.id&&!r.correct)?h('p',{className:'feedback'},'Not quite: '+result.quiz.find(r=>r.id===q.id).explain):null)),
  lesson.rubric?h('fieldset',null,h('legend',null,'Your work: '+lesson.rubric.description),
   h('label',null,'Project ',h('select',{value:projectId,onChange:e=>{setProjectId(e.target.value);setArtifactId('')}},h('option',{value:''},'Choose…'),...projects.map(p=>h('option',{key:p.id,value:p.id},p.title)))),
   h('label',null,' Artifact ',h('select',{value:artifactId,onChange:e=>setArtifactId(e.target.value)},h('option',{value:''},'Choose…'),...artifacts.map(a=>h('option',{key:a.id,value:a.id},a.title+' (r'+a.revision+')')))),
   h('p',{className:'small'},'Checks: '+lesson.rubric.checks.map(c=>c.type+(c.value!==undefined?' '+c.value:'')+(c.terms?' ['+c.terms.join(', ')+']':'')+(c.term?' "'+c.term+'"':'')).join(' · '))):null,
  h('button',{type:'submit',disabled:busy||s.status!=='signed-in'||Object.keys(answers).length<lesson.quiz.length||(lesson.rubric&&!artifactId)},busy?'Checking…':'Submit for checking'),
  result?h('div',{className:result.passed?'result pass':'result'},h('p',null,h('strong',null,result.passed?'Passed':'Not passed yet'),' · quiz '+Math.round(result.quizScore*100)+'% (need '+Math.round(result.passScore*100)+'%)'),
   result.rubric?h('ul',null,...result.rubric.results.map((r,i)=>h('li',{key:i},(r.passed?'✓ ':'✗ ')+r.type+': '+r.detail))):null,h('p',{className:'small'},result.note)):null,
  err?h('p',{role:'alert'},err):null);
}
export function CoursePlayer({courseId}){
 const s=useEngineSession();
 const [course,setCourse]=useState(null),[records,setRecords]=useState(null),[lessonId,setLessonId]=useState(''),[err,setErr]=useState('');
 const load=async()=>{try{const c=await api('/api/courses/'+encodeURIComponent(courseId));setCourse(c);
  let r=null;try{r=await api('/api/me')}catch{}setRecords(r);
  const resume=r?.progress?.find(p=>p.course_id===courseId&&p.status==='started');setLessonId(prev=>prev||resume?.lesson_id||c.lessons[0].id);}catch(e){setErr(explain(e))}};
 useEffect(()=>{load()},[courseId,s.status]);
 const enrolled=course?.enrolledVersion!=null;
 const done=new Set((records?.progress||[]).filter(p=>p.course_id===courseId&&p.status==='completed').map(p=>p.lesson_id));
 const lesson=course?.lessons.find(l=>l.id===lessonId);
 useEffect(()=>{if(enrolled&&lesson&&!done.has(lesson.id))api('/api/progress',{method:'POST',body:{courseId,lessonId:lesson.id,status:'started',checkpoint:{at:'lesson'}}}).catch(()=>{})},[enrolled,lessonId]);
 async function enroll(upgrade){try{await api('/api/enrollments',{method:'POST',body:{courseId,upgrade}});await load()}catch(e){setErr(explain(e))}}
 if(err&&!course)return h('p',{role:'alert'},err);if(!course)return h('p',null,'Loading course…');
 return h('div',{className:'course-player'},
  h('p',null,h('a',{href:'/courses'},'← All courses')),
  h('h1',null,course.title),h(StatusBadge,{course}),h('p',null,course.summary),
  h('p',{className:'small'},'Version '+course.version+(course.updateAvailable?' · a newer version ('+course.latestVersion+') is available':'')+' · needs: '+course.requiredCapabilities.join(', ')+' · estimated compute '+usd(course.estimatedComputeMicro)+' with paid models'),
  course.status!=='published'?h('p',{className:'notice'},'This course is a preview written with AI assistance. It has not yet passed human editorial review for factual accuracy, rights and accessibility.'):null,
  !enrolled?h('button',{type:'button',onClick:()=>enroll(false),disabled:s.status!=='signed-in'},s.status==='signed-in'?'Enroll (free)':'Sign in to enroll'):
   course.updateAvailable?h('button',{type:'button',onClick:()=>enroll(true)},'Move to version '+course.latestVersion):null,
  h('div',{className:'player-grid'},
   h('ol',{className:'lesson-list','aria-label':'Lessons'},...course.lessons.map(l=>h('li',{key:l.id},h('button',{type:'button','aria-current':l.id===lessonId?'step':undefined,onClick:()=>setLessonId(l.id)},(done.has(l.id)?'✓ ':'')+l.title+' · '+l.minutes+' min')))),
   lesson?h('article',{className:'lesson'},h('h2',null,lesson.title),
    lesson.prerequisites.length?h('p',{className:'small'},'Builds on: '+lesson.prerequisites.join(', ')):null,
    ...lesson.body.split('\n\n').map((p,i)=>h('p',{key:i},p)),
    h(Practice,{lesson}),
    enrolled?h(LessonCheck,{course,lesson,onPassed:load}):h('p',{className:'notice'},'Enroll to take the lesson check and save progress.')):null),
  err?h('p',{role:'alert'},err):null);
}
export default function CoursesApp(){
 const [data,setData]=useState(null),[err,setErr]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{const id=new URL(window.location.href).searchParams.get('course');if(id)setOpen(id);api('/api/courses').then(setData).catch(e=>setErr(explain(e)))},[]);
 if(open)return h(CoursePlayer,{courseId:open});
 return h('div',null,h('h1',null,'Courses'),
  h('p',null,'Hands-on courses that use the same tools as the workspaces. Lesson checks are graded by fixed rules against your saved work.'),
  err?h('p',{role:'alert'},err):!data?h('p',null,'Loading catalog…'):
  h('div',{className:'course-grid'},...data.items.map(c=>h('article',{key:c.id,className:'course-card'},
   h('h2',null,c.title),h(StatusBadge,{course:c}),h('p',null,c.summary),
   h('p',{className:'small'},c.lessonCount+' lessons · '+c.level+' · v'+c.latestVersion+(c.enrolledVersion!=null?' · enrolled (v'+c.enrolledVersion+')':'')+(c.updateAvailable?' · update available':'')),
   h('a',{className:'button-link',href:'/courses?course='+encodeURIComponent(c.id)},c.enrolledVersion!=null?'Continue':'View course')))),
  data&&!data.recordsEnabled?h('p',{className:'notice'},'Learning records are not configured on this deployment, so enrollment and progress are unavailable.'):null);
}
