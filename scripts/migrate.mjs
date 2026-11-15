#!/usr/bin/env node
// Applies db/migrations/*.sql in order (idempotent, checksummed, advisory-locked). Uses ACADEMY_DATABASE_URL.
// Without a database URL it exits 0 so the app can still start with learning records disabled.
import pg from 'pg';import {createHash} from 'node:crypto';import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const DIR=resolve(dirname(fileURLToPath(import.meta.url)),'../db/migrations');
export async function migrate(connectionString=process.env.ACADEMY_DATABASE_URL){
 if(!connectionString)return [];
 const c=new pg.Client({connectionString});await c.connect();
 try{
  await c.query('SELECT pg_advisory_lock(73114215)');
  await c.query("CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const out=[];
  for(const f of readdirSync(DIR).filter(x=>/^\d{3}_[a-z0-9_]+\.sql$/.test(x)).sort()){
   const sql=readFileSync(resolve(DIR,f),'utf8'),sum=createHash('sha256').update(sql).digest('hex');
   const prior=(await c.query('SELECT checksum FROM schema_migrations WHERE filename=$1',[f])).rows[0];
   if(prior){if(prior.checksum!==sum)throw new Error('Applied migration changed: '+f);out.push({f,status:'unchanged'});continue;}
   await c.query('BEGIN');
   try{await c.query(sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[f,sum]);await c.query('COMMIT');out.push({f,status:'applied'});}
   catch(e){await c.query('ROLLBACK');throw e;}
  }
  return out;
 }finally{await c.query('SELECT pg_advisory_unlock(73114215)').catch(()=>{});await c.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(!process.env.ACADEMY_DATABASE_URL)console.log('ACADEMY_DATABASE_URL not set; learning records disabled');
 else migrate().then(r=>console.log(JSON.stringify({migrations:r}))).catch(e=>{console.error('Migration failed:',e.message);process.exit(1);});
}
