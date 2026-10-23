import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
const now=Date.now(),old=now-31*60*1000;
function setup({state='processing',requestAt=old,diagnosticAt=null,downloaded=null,excluded=false}={}){
 const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 db.prepare("INSERT INTO service_reports(public_id,os_number,collaborator,execution_started_at,completed_at,environment,floor,observations,status,created_at,downloaded_at) VALUES ('os','324279','Executor','2026-10-08T08:30','2026-10-08T11:30','Sala','Térreo','Serviço',?,1,?)").run(excluded?'Excluída':'Concluída',downloaded);
 db.prepare("INSERT INTO imas_automation_requests VALUES ('os','approval','fp',?,?,?)").run(state,requestAt,requestAt);
 if(diagnosticAt)db.prepare("INSERT INTO imas_automation_runs VALUES ('existing','os','2.5.1','running','Salvar','[]','[]',?)").run(diagnosticAt);
 let hook;
 const prepare=sql=>{const bind=(...args)=>({sql,args,all:async()=>({results:db.prepare(sql).all(...args)})});return {bind,...bind()};};
 const env={DB:{prepare,async batch(ops){hook?.();hook=null;db.exec('BEGIN');try{for(const op of ops)db.prepare(op.sql).run(...op.args);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/imas-timeout.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({env}),Date,JSON});
 return {db,recover:()=>exports.recoverStalledApprovals(now),race:fn=>hook=fn};
}
test('processing sem diagnóstico por 30 min volta failed, mantém evidências, sem baixa, idempotente',async()=>{
 const s=setup();await s.recover();await s.recover();assert.equal(s.db.prepare('SELECT state FROM imas_automation_requests').get().state,'failed');
 const report=s.db.prepare('SELECT * FROM service_reports').get();assert.equal(report.downloaded_at,null);assert.equal(report.observations,'Serviço');assert.equal(report.status,'Concluída');
 const runs=s.db.prepare('SELECT * FROM imas_automation_runs').all();assert.equal(runs.length,1);assert.match(runs[0].trace_json,/execução sem resposta da extensão/);
});
for(const opts of [{requestAt:now-29*60*1000},{diagnosticAt:now-1000},{state:'queued'},{downloaded:now},{excluded:true}])test('não libera execução recente, heartbeat, queued, baixa ou excluída '+JSON.stringify(opts),async()=>{const s=setup(opts);await s.recover();assert.equal(s.db.prepare('SELECT state FROM imas_automation_requests').get().state,opts.state||'processing');});
test('diagnóstico concorrente impede timeout falso',async()=>{const s=setup();s.race(()=>s.db.prepare("INSERT INTO imas_automation_runs VALUES ('heartbeat','os','2.5.1','running','Salvar','[]','[]',?)").run(now));await s.recover();assert.equal(s.db.prepare('SELECT state FROM imas_automation_requests').get().state,'processing');assert.equal(s.db.prepare("SELECT count(*) n FROM imas_automation_runs WHERE run_id LIKE 'timeout-%'").get().n,0);});
