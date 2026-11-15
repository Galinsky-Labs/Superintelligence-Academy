import test from 'node:test';import assert from 'node:assert/strict';
import {retrieveLessonContext,buildTutorRequest,tutorBudgetMicro} from '../lib/tutor.mjs';
import {splitUncertain} from '../components/tutor.mjs';
test('tutor context is limited to published lessons, prerequisites first, same domain only',()=>{
 const c=retrieveLessonContext('short-code-objective','how do I describe failures and tests?');
 assert.equal(c.lesson.id,'short-code-objective');
 assert.ok(c.sources.length>=1&&c.sources.length<=4);
 assert.ok(c.sources.every(s=>s.id.includes('code')),'no other domains');
 assert.equal(retrieveLessonContext('no-such-lesson','x'),null);
});
test('tutor request cites lessons, labels uncertainty and only includes a consented artifact',()=>{
 const c=retrieveLessonContext('micro-research-objective','sources?');
 const plain=buildTutorRequest({context:c,question:'Which sources count?'});
 assert.match(plain.system,/\[L:micro-research-objective\]/);assert.match(plain.system,/Uncertain:/);
 assert.doesNotMatch(plain.system,/LEARNER-SHARED ARTIFACT/);assert.ok(plain.maxOutputTokens<=1200);
 const shared=buildTutorRequest({context:c,question:'Review my draft',artifact:{title:'Draft',revision:3,text:'My research plan'}});
 assert.match(shared.system,/LEARNER-SHARED ARTIFACT/);assert.match(shared.system,/My research plan/);
 assert.throws(()=>buildTutorRequest({context:c,question:''}));
 assert.equal(tutorBudgetMicro({}),50000);assert.equal(tutorBudgetMicro({SIA_TUTOR_BUDGET_MICRO:'999999999'}),50000);
 assert.deepEqual(splitUncertain('Fine.\nUncertain: prices').map(x=>x.uncertain),[false,true]);
});
