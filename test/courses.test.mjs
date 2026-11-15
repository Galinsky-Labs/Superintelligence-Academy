import test from 'node:test';import assert from 'node:assert/strict';
import {REPOSITORY_COURSES,mergeCatalog,publicCourse,assess,gradeArtifact,recommendNext,validateCourse,latest} from '../lib/courses.mjs';
test('repository catalog is valid, preview-labelled and answer keys are not exposed',()=>{
 assert.ok(REPOSITORY_COURSES.length>=4);
 for(const c of REPOSITORY_COURSES){assert.equal(c.status,'preview');assert.match(c.authoredBy,/pending human editorial review/);}
 const view=publicCourse({...REPOSITORY_COURSES[0],source:'repository'});
 assert.ok(view.lessons[0].quiz.length);assert.equal(JSON.stringify(view).includes('"answer"'),false);assert.equal(JSON.stringify(view).includes('"explain"'),false);
 assert.ok(validateCourse({id:'x-course',version:1,title:'Broken course',lessons:[{id:'a-lesson',body:'b'.repeat(50),prerequisites:['missing'],quiz:[{id:'q1',options:['a'],answer:3}]}]}).length>=2);
});
test('assessment is deterministic and simulator evidence is practice only',()=>{
 const course=REPOSITORY_COURSES.find(c=>c.id==='foundations-research');const lesson=course.lessons[0];
 const right=Object.fromEntries(lesson.quiz.map(q=>[q.id,q.answer]));
 const text='What drives urban heat? Which materials matter? How do trees change it? '+'evidence '.repeat(60);
 const live=assess(course,lesson.id,{answers:right,artifact:{id:'a',revision:1,body:text,provenance:{source:'user'}}});
 assert.equal(live.passed,true);assert.equal(live.practiceOnly,false);
 const sim=assess(course,lesson.id,{answers:right,artifact:{id:'a',revision:1,body:text,provenance:{simulated:true}}});
 assert.equal(sim.practiceOnly,true);
 const wrong=assess(course,lesson.id,{answers:{},artifact:{body:text}});assert.equal(wrong.passed,false);assert.ok(wrong.feedback.length>=2);
 assert.equal(gradeArtifact({checks:[{type:'minRevisions',value:2}]},{revision:2,currentRevision:2,body:''}).passed,true);
 assert.equal(gradeArtifact({checks:[{type:'minLinks',value:2}]},{body:'see https://a.example and https://b.example'}).passed,true);
});
test('recommendations follow prerequisites and goals; opt-out uses course order',()=>{
 const catalog=mergeCatalog();
 assert.equal(recommendNext({catalog,goal:'research'}).lessonId,'micro-research-objective');
 const done=new Set(['micro-research-objective','short-research-objective']);
 assert.equal(recommendNext({catalog,goal:'research',completed:done}).lessonId,'fr-questions');
 assert.equal(recommendNext({catalog,goal:'research',completed:new Set([...done,'fr-questions'])}).lessonId,'fr-cite');
 const off=recommendNext({catalog,enrolled:['foundations-code'],adaptive:false});
 assert.equal(off.lessonId,'fc-spec');assert.match(off.reason,/adaptive recommendations are off/);
});
test('published authoring versions extend the catalog without replacing history',()=>{
 const c=REPOSITORY_COURSES[0];
 const catalog=mergeCatalog([{course_id:c.id,version:2,content:{...c,version:2},approved_by:'00000000-0000-4000-8000-000000000001',published_at:new Date().toISOString()}]);
 const vs=catalog.get(c.id);assert.deepEqual(vs.map(v=>v.version),[1,2]);assert.equal(latest(vs).status,'published');assert.equal(vs[0].status,'preview');
});
