"use client";
// SIA-008 tutor panel: asks about the current approved lesson; optional, explicit artifact sharing.
import React,{useEffect,useRef,useState} from 'react';
import {useEngineSession} from './engine-session.mjs';
import {readEvents} from '../vendor/engine/packages/sdk/src/index.mjs';

export const TUTOR_ERRORS={unauthenticated:'Your session expired. Sign in again.',lesson_not_found:'That lesson is not published.',
 run_budget_exceeded:'The tutor reached its per-question spending ceiling.',global_limit_exceeded:'The operator spending cap is $0 or exhausted; only the simulator can answer right now.',
 tenant_limit_exceeded:'Your workspace has no remaining AI budget.',artifact_not_text:'Only text artifacts can be shared with the tutor.',engine_unreachable:'The engine did not respond; it may be waking up.'};
export function splitUncertain(text){return String(text||'').split('\n').map(line=>({line,uncertain:/^\s*Uncertain:/i.test(line)}))}

export default function Tutor({lessons=[]}){
 const h=React.createElement,s=useEngineSession();
 const [lessonId,setLessonId]=useState(lessons[0]?.id||''),[question,setQuestion]=useState('');
 const [share,setShare]=useState(false),[projects,setProjects]=useState([]),[projectId,setProjectId]=useState(''),[artifacts,setArtifacts]=useState([]),[artifactId,setArtifactId]=useState('');
 const [answer,setAnswer]=useState(''),[context,setContext]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const abort=useRef(null);
 useEffect(()=>{setLessonId(prev=>lessons.some(l=>l.id===prev)?prev:lessons[0]?.id||'')},[lessons]);
 useEffect(()=>{if(!share||!s.client)return;s.client.projects().then(r=>setProjects(r.items||[])).catch(()=>setProjects([]))},[share,s.client]);
 useEffect(()=>{if(!projectId||!s.client){setArtifacts([]);return}s.client.artifacts(projectId).then(r=>setArtifacts((r.items||[]).filter(a=>String(a.mediaType||'').startsWith('text/')))).catch(()=>setArtifacts([]))},[projectId,s.client]);
 if(s.status!=='signed-in')return h('section',{className:'tutor','aria-label':'AI tutor'},h('h2',null,'AI tutor'),
  h('p',null,s.status==='checking'?'Checking your session…':'Sign in with your engine identity to ask the tutor about a lesson. ',s.status==='checking'?null:h('a',{href:'/signin'},'Sign in')));
 async function ask(e){
  e.preventDefault();setBusy(true);setError('');setAnswer('');setContext(null);setResult(null);
  abort.current?.abort();abort.current=new AbortController();
  try{
   const r=await fetch('/api/tutor',{method:'POST',signal:abort.current.signal,headers:{'Content-Type':'application/json'},
    body:JSON.stringify({tenantId:s.tenantId,lessonId,question,...(share&&artifactId?{shareArtifact:true,projectId,artifactId}:{})})});
   if(!r.ok){const d=await r.json().catch(()=>({}));throw Object.assign(new Error(d.code),{code:d.code})}
   for await(const ev of readEvents(r,{signal:abort.current.signal})){
    if(ev.event==='context')setContext(ev.data);
    else if(ev.event==='token')setAnswer(prev=>prev+ev.data.text);
    else if(ev.event==='result')setResult(ev.data);
    else if(ev.event==='error')throw Object.assign(new Error(ev.data.error||ev.data.code),{code:ev.data.code||ev.data.error});
   }
  }catch(err){if(err.name!=='AbortError')setError(TUTOR_ERRORS[err.code]||('The tutor could not answer ('+(err.code||err.message)+').'))}
  finally{setBusy(false)}
 }
 return h('section',{className:'tutor','aria-label':'AI tutor'},
  h('h2',null,'AI tutor'),
  h('p',{className:'tutor-scope'},'The tutor answers from the approved lesson text only, cites lessons like [L:lesson-id], and labels anything the lessons do not cover as Uncertain.'),
  h('form',{onSubmit:ask},
   h('label',null,'Lesson',h('select',{value:lessonId,onChange:e=>setLessonId(e.target.value),'aria-label':'Lesson'},...lessons.map(l=>h('option',{key:l.id,value:l.id},l.level+' · '+l.title)))),
   h('label',null,'Your question',h('textarea',{value:question,onChange:e=>setQuestion(e.target.value),rows:3,maxLength:2000,required:true,'aria-label':'Your question'})),
   h('label',{className:'tutor-consent'},h('input',{type:'checkbox',checked:share,onChange:e=>{setShare(e.target.checked);if(!e.target.checked){setProjectId('');setArtifactId('')}}}),
    ' Share one of my project artifacts with the tutor for this question'),
   share?h('div',{className:'tutor-share'},
    h('label',null,'Project',h('select',{value:projectId,onChange:e=>{setProjectId(e.target.value);setArtifactId('')},'aria-label':'Project to share from'},h('option',{value:''},'Choose…'),...projects.map(p=>h('option',{key:p.id,value:p.id},p.title)))),
    h('label',null,'Artifact',h('select',{value:artifactId,onChange:e=>setArtifactId(e.target.value),'aria-label':'Artifact to share'},h('option',{value:''},'Choose…'),...artifacts.map(a=>h('option',{key:a.id,value:a.id},a.title))))):null,
   h('button',{type:'submit',disabled:busy||!lessonId||!question.trim()||(share&&!artifactId)},busy?'Thinking…':'Ask the tutor')),
  context?h('p',{className:'tutor-sources'},'Sources: ',...context.lessons.map((l,i)=>h('span',{key:l.id},(i?', ':'')+'[L:'+l.id+'] '+l.title)),context.artifact?' · shared artifact "'+context.artifact.title+'" r'+context.artifact.revision:'',' · spend ceiling $'+(context.budgetCeilingMicro/1e6).toFixed(2)):null,
  answer?h('div',{className:'tutor-answer','aria-live':'polite'},...splitUncertain(answer).map((x,i)=>h('p',{key:i,className:x.uncertain?'tutor-uncertain':undefined},x.line))):null,
  result?h('p',{className:'tutor-meta'},result.output?.simulated?'SIMULATED answer from the deterministic simulator — not a real model. ':'','Cost $'+(Number(result.costMicro||0)/1e6).toFixed(4)+'. AI tutoring can be wrong; check it against the lesson.'):null,
  error?h('p',{role:'alert',className:'tutor-error'},error):null);
}
