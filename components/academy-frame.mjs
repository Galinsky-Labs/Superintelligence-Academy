"use client";
import React from 'react';
import {EngineSessionProvider,SessionBadge} from './engine-session.mjs';
const LINKS=[['/','Workspaces'],['/courses','Courses'],['/learning','My learning'],['/authoring','Authoring']];
export const api=async(path,{method='GET',body}={})=>{
 const r=await fetch(path,{method,cache:'no-store',headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.message||d.code||('HTTP '+r.status)),{code:d.code,status:r.status});return d;
};
export const ERRORS={unauthenticated:'Sign in to keep learning records.',learning_records_unconfigured:'Learning records are not configured on this deployment yet.',
 not_enrolled:'Enroll in the course first.',artifact_required:'Choose the project artifact the rubric should check.',assessment_required:'Pass the lesson check to complete this lesson.',
 editor_required:'Only editors can review.',peer_review_required:'Another editor must review your own draft.',checks_incomplete:'Confirm all four editorial checks to approve.'};
export const explain=e=>ERRORS[e?.code]||e?.message||'Something went wrong';
export default function AcademyFrame({current,children}){
 const h=React.createElement;
 return h(EngineSessionProvider,null,h('div',{className:'app-frame'},
  h('a',{className:'skip-link',href:'#main'},'Skip to main content'),
  h('header',{className:'app-header'},
   h('div',{className:'brand'},h('span',{className:'brand-mark','aria-hidden':'true'},'◎'),h('span',null,'Superintelligence Academy')),
   h('nav',{'aria-label':'Academy',className:'academy-links'},...LINKS.map(([href,label])=>h('a',{key:href,href,'aria-current':current===href?'page':undefined},label))),
   h('div',{className:'header-tools'},h(SessionBadge))),
  h('main',{id:'main',className:'academy-page',tabIndex:-1},children)));
}
