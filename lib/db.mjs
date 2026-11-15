// Academy learning-records database (ACADEMY_DATABASE_URL). Absent → learning records are disabled (503).
import pg from 'pg';
let pool=null;
export function db(env=process.env){
 if(!env.ACADEMY_DATABASE_URL)return null;
 if(!pool){pool=new pg.Pool({connectionString:env.ACADEMY_DATABASE_URL,max:Number(env.ACADEMY_DB_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:10000});pool.on('error',()=>{});}
 return pool;
}
export async function closeDb(){if(pool){const p=pool;pool=null;await p.end();}}
export async function ensureLearner(q,session){
 await q.query(`INSERT INTO learners(identity_id,display_name) VALUES($1,$2) ON CONFLICT(identity_id) DO NOTHING`,[session.identityId,String(session.name||'').slice(0,160)]);
 return (await q.query('SELECT * FROM learners WHERE identity_id=$1',[session.identityId])).rows[0];
}
export async function publishedVersions(q){return q?(await q.query('SELECT course_id,version,content,approved_by,published_at FROM course_versions ORDER BY course_id,version')).rows:[];}
export async function recordEvent(q,learner,kind,{courseId=null,lessonId=null}={}){
 if(learner?.analytics_consent)await q.query('INSERT INTO learning_events(identity_id,kind,course_id,lesson_id) VALUES($1,$2,$3,$4)',[learner.identity_id,kind,courseId,lessonId]);
}
