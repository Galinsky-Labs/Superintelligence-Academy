"use client";
import React,{useEffect,useState} from 'react';
import {WorkspaceShell,ToolPanel,DomainTool,WORKSPACE_DOMAINS,ProjectPortal} from '@superintelligence/ui';
import LearningHint from '../components/learning-hint.mjs';
import GoalDirectory from '../components/goal-directory.mjs';
import Tutor from '../components/tutor.mjs';
import {EngineSessionProvider,SessionBadge,useEngineSession} from '../components/engine-session.mjs';
const names={code:'Code',music:'Music',poetry:'Poetry','persuasive-writing':'Persuasive writing',research:'Research',legislation:'Legislation',image:'Images',video:'Film & video',voice:'Voice',data:'Data',workflow:'Workflows'};
const controls=[{id:'objective',kind:'textarea',label:'Project objective',description:'Describe what you want to make. Ask the tutor below how to sharpen it; your notes stay in this browser tab.',rows:5}];
export default function Page(){return React.createElement(EngineSessionProvider,null,React.createElement(Academy))}
function Academy(){
 const session=useEngineSession();
 const [origin,setOrigin]=useState('');
 const [lessons,setLessons]=useState([]);
 useEffect(()=>{setOrigin(window.location.origin)},[]);
 const [engine,setEngine]=useState({status:'checking'});
 const [active,setActive]=useState('research');
 const [drafts,setDrafts]=useState({});
 const [message,setMessage]=useState('');
 const [goalSearch,setGoalSearch]=useState('');
 useEffect(()=>{let mounted=true;fetch('/api/engine',{cache:'no-store'}).then(res=>res.json()).then(data=>{if(mounted)setEngine(data)}).catch(()=>{if(mounted)setEngine({status:'unavailable'})});return()=>{mounted=false}},[]);
 useEffect(()=>{let live=true;fetch('/api/lessons?anchor='+encodeURIComponent(active+'.objective')).then(r=>r.json()).then(d=>{if(live)setLessons(Array.isArray(d.items)?d.items:[])}).catch(()=>{if(live)setLessons([])});return()=>{live=false}},[active]);
 const change=(id,value)=>{setDrafts(prev=>({...prev,[active]:value}));setMessage('')};
 return React.createElement('div',{className:'app-frame'},
   React.createElement('a',{className:'skip-link',href:'#main'},'Skip to main content'),
   React.createElement('header',{className:'app-header'},
     React.createElement('div',{className:'brand'},React.createElement('span',{className:'brand-mark','aria-hidden':'true'},"◎"),React.createElement('span',null,"Superintelligence Academy")),
     React.createElement('nav',{'aria-label':'Academy',className:'academy-links'},React.createElement('a',{href:'/','aria-current':'page'},'Workspaces'),React.createElement('a',{href:'/courses'},'Courses'),React.createElement('a',{href:'/learning'},'My learning'),React.createElement('a',{href:'/authoring'},'Authoring')),
     React.createElement('div',{className:'header-tools'},React.createElement('span',{className:'connection-status',role:'status','aria-live':'polite'},'Engine: '+engine.status),React.createElement(SessionBadge))),
   React.createElement('div',{className:'app-columns'},
     React.createElement('nav',{'aria-label':'AI workspaces',className:'app-nav'},
       React.createElement('div',{className:'nav-heading'},'Workspaces'),
       ...WORKSPACE_DOMAINS.map(domain=>React.createElement('button',{key:domain,type:'button','aria-current':active===domain?'page':undefined,'data-domain-option':domain,className:active===domain?'nav-link active':'nav-link',onClick:()=>{setActive(domain);setMessage('')}},names[domain]))),
     React.createElement('main',{id:'main',className:'app-main',tabIndex:-1},
       React.createElement('div',{className:'hero'},React.createElement('p',{className:'eyebrow'},"LEARN • CREATE • EXPLORE"),React.createElement('h1',null,"Turn your ideas into real projects"),React.createElement('p',null,"Choose a creative or technical workspace. Interactive lessons become available only when approved teaching materials are published.")),
       React.createElement(ProjectPortal,{product:"academy",domain:active,engineOrigin:origin,companionOrigin:process.env.NEXT_PUBLIC_COMMAND_ORIGIN||'',onOpenProject:project=>{if(WORKSPACE_DOMAINS.includes(project.kind))setActive(project.kind);setMessage('')}}),
       React.createElement(GoalDirectory,{query:goalSearch,setQuery:setGoalSearch,availability:{},onChoose:domain=>{setActive(domain);setMessage('')}}),
       React.createElement(WorkspaceShell,{product:"academy",domain:active,title:names[active]},
         React.createElement(ToolPanel,{title:'Prepare your work'},
           React.createElement('p',{className:'status-note'},engine.status==='connected'?'The engine is reachable.':'The engine is '+(engine.status==='checking'?'being checked':'not available right now')+'; your notes stay in this browser tab.'),
           React.createElement(DomainTool,{product:"academy",domain:active,title:'Project brief',controls,values:{objective:drafts[active]||''},onFieldChange:change,onSubmit:()=>setMessage('Notes kept for this tab. Ask the tutor how to improve them.'),submitLabel:'Keep notes'}),
           React.createElement(LearningHint,{anchor:active+'.objective'}),
           React.createElement(Tutor,{lessons}),
           React.createElement('p',{role:'status','aria-live':'polite',className:'action-message'},message))
       ))
   )
 );
}
