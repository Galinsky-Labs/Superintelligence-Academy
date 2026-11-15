"use client";
// SIA-013/014: my progress, resume, recommended next lesson, privacy settings, export and deletion.
import React,{useEffect,useState} from 'react';
import {WORKSPACE_DOMAINS} from '@superintelligence/ui';
import {useEngineSession} from './engine-session.mjs';
import {api,explain} from './academy-frame.mjs';
const h=React.createElement;
export default function LearningApp(){
 const s=useEngineSession();
 const [goal,setGoal]=useState(''),[data,setData]=useState(null),[err,setErr]=useState(''),[confirm,setConfirm]=useState(''),[msg,setMsg]=useState('');
 const load=()=>api('/api/me'+(goal?'?goal='+encodeURIComponent(goal):'')).then(d=>{setData(d);setErr('')}).catch(e=>setErr(explain(e)));
 useEffect(()=>{if(s.status==='signed-in')load()},[s.status,goal]);
 async function setting(k,v){try{await api('/api/me',{method:'PATCH',body:{[k]:v}});await load()}catch(e){setErr(explain(e))}}
 async function remove(){try{await api('/api/me',{method:'DELETE',body:{confirm}});setMsg('All Academy learning records were deleted. Your engine projects are unaffected.');setData(null);setConfirm('')}catch(e){setErr(explain(e))}}
 if(s.status!=='signed-in')return h('div',null,h('h1',null,'My learning'),h('p',null,s.status==='checking'?'Checking your session…':h('a',{href:'/signin'},'Sign in to see your learning records.')));
 const rec=data?.recommendation;
 return h('div',{className:'learning'},h('h1',null,'My learning'),
  err?h('p',{role:'alert'},err):null,msg?h('p',{role:'status'},msg):null,
  data?h('section',null,h('h2',null,'Next step'),
   h('label',null,'My goal ',h('select',{value:goal,onChange:e=>setGoal(e.target.value)},h('option',{value:''},'My enrolled courses'),...WORKSPACE_DOMAINS.map(d=>h('option',{key:d,value:d},d)))),
   rec?h('p',null,h('strong',null,rec.lessonId),' — '+rec.reason+' ',rec.courseId?h('a',{href:'/courses?course='+encodeURIComponent(rec.courseId)},'Open course'):'(short lesson in the workspace hints)'):h('p',null,'No recommendation yet: enroll in a course or choose a goal.'),
   data.resume?h('p',null,'Resume where you left off: ',h('a',{href:'/courses?course='+encodeURIComponent(data.resume.course_id)},data.resume.lesson_id)):null):null,
  data?h('section',null,h('h2',null,'Enrollments and progress'),
   data.enrollments.length?h('ul',null,...data.enrollments.map(e=>{const n=data.progress.filter(p=>p.course_id===e.course_id&&p.status==='completed').length;
    return h('li',{key:e.course_id},h('a',{href:'/courses?course='+encodeURIComponent(e.course_id)},e.course_id),' · version '+e.course_version+' · '+n+' lessons completed')})):h('p',null,'Not enrolled in any course yet. ',h('a',{href:'/courses'},'Browse courses')),
   h('h3',null,'Recent lesson checks'),
   data.attempts.length?h('ul',null,...data.attempts.slice(0,10).map(a=>h('li',{key:a.id},a.lesson_id+' · '+(a.passed?'passed':a.practice_only?'practice only (simulated work)':'not passed')+' · quiz '+Math.round(a.quiz_score*100)+'% · '+new Date(a.created_at).toLocaleString()))):h('p',null,'None yet.')):null,
  data?h('section',null,h('h2',null,'Privacy'),
   h('label',{className:'toggle'},h('input',{type:'checkbox',checked:data.settings.adaptiveRecommendations,onChange:e=>setting('adaptiveRecommendations',e.target.checked)}),' Personalised next-lesson recommendations (off = plain course order)'),
   h('label',{className:'toggle'},h('input',{type:'checkbox',checked:data.settings.analyticsConsent,onChange:e=>setting('analyticsConsent',e.target.checked)}),' Allow anonymous-to-others learning analytics (enroll/progress events) to improve courses; turning this off deletes recorded events'),
   h('p',null,h('a',{href:'/api/me/export',download:'academy-learning-records.json'},'Download all my Academy records (JSON)')),
   h('div',{className:'danger-zone'},h('label',null,'Type DELETE to erase all Academy learning records ',h('input',{value:confirm,onChange:e=>setConfirm(e.target.value),'aria-label':'Type DELETE to confirm'})),
    h('button',{type:'button',disabled:confirm!=='DELETE',onClick:remove},'Delete my learning records'))):null);
}
