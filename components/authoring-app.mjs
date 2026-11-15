"use client";
// SIA-015: AI-assisted course drafts with human editorial review before publication.
import React,{useEffect,useState} from 'react';
import {useEngineSession} from './engine-session.mjs';
import {api,explain} from './academy-frame.mjs';
const h=React.createElement;
const CHECKS=[['factual','Facts verified against sources'],['rights','Rights and provider terms cleared'],['plagiarism','Original or properly attributed'],['accessibility','Accessible (alt text, plain language, captions/alternatives)']];
function Draft({id,onBack}){
 const s=useEngineSession();
 const [d,setD]=useState(null),[text,setText]=useState(''),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 const [instruction,setInstruction]=useState(''),[suggestion,setSuggestion]=useState(null),[checks,setChecks]=useState({}),[notes,setNotes]=useState('');
 const load=()=>api('/api/authoring/drafts/'+id).then(x=>{setD(x);setText(JSON.stringify(x.content,null,2))}).catch(e=>setErr(explain(e)));
 useEffect(()=>{load()},[id]);
 if(!d)return h('p',null,err||'Loading draft…');
 const editable=['draft','changes_requested'].includes(d.status)&&d.authorId===s.identity?.id;
 async function save(){setErr('');try{const content=JSON.parse(text);await api('/api/authoring/drafts/'+id,{method:'PUT',body:{content,expectedRevision:d.revision,aiAssisted:Boolean(suggestion)}});setMsg('Saved revision');await load()}catch(e){setErr(e instanceof SyntaxError?'The draft is not valid JSON: '+e.message:explain(e))}}
 async function act(body){setErr('');try{const r=await api('/api/authoring/drafts/'+id,{method:'POST',body});setMsg(r.status?'Status: '+r.status+(r.version?' (version '+r.version+')':''):'');await load()}catch(e){setErr(explain(e))}}
 async function assist(){setErr('');try{const r=await api('/api/authoring/drafts/'+id,{method:'POST',body:{action:'ai-assist',instruction,tenantId:s.tenantId}});setSuggestion(r)}catch(e){setErr(explain(e))}}
 return h('div',{className:'draft'},h('button',{type:'button',onClick:onBack},'← Drafts'),
  h('h2',null,d.content.title+' · '+d.courseId),h('p',null,'Status: '+d.status+' · revision '+d.revision+(d.aiAssisted?' · AI-assisted':'')),
  d.validation.length?h('ul',{className:'validation'},...d.validation.map((v,i)=>h('li',{key:i},v))):h('p',{className:'small'},'Structure valid.'),
  h('label',null,'Course content (JSON: title, summary, domain, level, lessons[{id,title,minutes,prerequisites,body,practice,quiz,rubric}])',
   h('textarea',{value:text,onChange:e=>setText(e.target.value),rows:18,readOnly:!editable,spellCheck:false,className:'json-editor'})),
  editable?h('div',{className:'row'},h('button',{type:'button',onClick:save},'Save'),h('button',{type:'button',onClick:()=>act({action:'submit'})},'Submit for editorial review')):null,
  editable?h('section',{className:'assist'},h('h3',null,'AI assistant'),h('input',{value:instruction,onChange:e=>setInstruction(e.target.value),placeholder:'e.g. draft a 150-word lesson on checking citations','aria-label':'Instruction for the AI assistant'}),
   h('button',{type:'button',onClick:assist,disabled:!instruction.trim()},'Suggest text'),
   suggestion?h('div',null,h('p',{className:'small'},(suggestion.simulated?'SIMULATED suggestion (simulator). ':'')+suggestion.note),h('pre',null,suggestion.suggestion)):null):null,
  d.canReview&&d.status==='submitted'?h('section',{className:'review'},h('h3',null,'Editorial review'),
   ...CHECKS.map(([k,l])=>h('label',{key:k,className:'toggle'},h('input',{type:'checkbox',checked:!!checks[k],onChange:e=>setChecks(c=>({...c,[k]:e.target.checked}))}),' '+l)),
   h('textarea',{value:notes,onChange:e=>setNotes(e.target.value),rows:3,placeholder:'Review notes','aria-label':'Review notes'}),
   h('div',{className:'row'},h('button',{type:'button',onClick:()=>act({action:'review',decision:'approve',checks,notes})},'Approve and publish'),h('button',{type:'button',onClick:()=>act({action:'review',decision:'request_changes',checks,notes})},'Request changes'))):null,
  d.reviews.length?h('section',null,h('h3',null,'Review history'),h('ul',null,...d.reviews.map((r,i)=>h('li',{key:i},r.decision+' on revision '+r.draft_revision+' · '+Object.entries(r.checks).filter(([,v])=>v).map(([k])=>k).join(', ')+(r.notes?' · '+r.notes:''))))):null,
  msg?h('p',{role:'status'},msg):null,err?h('p',{role:'alert'},err):null);
}
export default function AuthoringApp(){
 const s=useEngineSession();
 const [list,setList]=useState(null),[courses,setCourses]=useState([]),[open,setOpen]=useState(''),[from,setFrom]=useState(''),[newId,setNewId]=useState(''),[err,setErr]=useState('');
 const load=()=>api('/api/authoring/drafts').then(setList).catch(e=>setErr(explain(e)));
 useEffect(()=>{if(s.status==='signed-in'){load();api('/api/courses').then(d=>setCourses(d.items)).catch(()=>{})}},[s.status]);
 if(s.status!=='signed-in')return h('div',null,h('h1',null,'Authoring'),h('p',null,s.status==='checking'?'Checking your session…':h('a',{href:'/signin'},'Sign in to author courses.')));
 if(open)return h(Draft,{id:open,onBack:()=>{setOpen('');load()}});
 async function create(body){setErr('');try{const d=await api('/api/authoring/drafts',{method:'POST',body});setOpen(d.id)}catch(e){setErr(explain(e))}}
 return h('div',null,h('h1',null,'Authoring'),
  h('p',null,'Draft courses with AI assistance. Nothing is published until an editor other than the author confirms factual accuracy, rights, originality and accessibility; each approval creates a new course version and learners keep the version they enrolled in.'),
  list?h('p',{className:'small'},list.editor?'You are an editor: submitted drafts from other authors appear below for review.':'Editors are configured by the operator (SIA_EDITOR_IDENTITY_IDS).'):null,
  h('div',{className:'row'},h('label',null,'Start from an existing course ',h('select',{value:from,onChange:e=>setFrom(e.target.value)},h('option',{value:''},'Choose…'),...courses.map(c=>h('option',{key:c.id,value:c.id},c.title+' ('+c.status+')')))),
   h('button',{type:'button',disabled:!from,onClick:()=>create({fromCourseId:from})},'Create draft')),
  h('div',{className:'row'},h('label',null,'Or a new course id ',h('input',{value:newId,onChange:e=>setNewId(e.target.value.toLowerCase()),placeholder:'e.g. data-basics'})),h('button',{type:'button',disabled:!/^[a-z0-9-]{3,100}$/.test(newId),onClick:()=>create({courseId:newId})},'New draft')),
  err?h('p',{role:'alert'},err):null,
  list?h('table',null,h('thead',null,h('tr',null,h('th',null,'Course'),h('th',null,'Status'),h('th',null,'Revision'),h('th',null,''))),
   h('tbody',null,...list.items.map(d=>h('tr',{key:d.id},h('td',null,d.content.title+' ('+d.courseId+')'),h('td',null,d.status+(d.authorId!==s.identity?.id?' · by another author':'')),h('td',null,d.revision),h('td',null,h('button',{type:'button',onClick:()=>setOpen(d.id)},'Open')))))):h('p',null,'Loading drafts…'));
}
