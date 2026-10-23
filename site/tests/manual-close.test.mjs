import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=p=>ts.transpileModule(readFileSync(new URL('../'+p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.prepare("INSERT INTO work_orders(public_id,competence,os_number,status,created_at,updated_at) VALUES ('work','2026-10','987654','Aguardando aprovação',1,1)").run();
 db.prepare("INSERT INTO service_reports(public_id,os_number,collaborator,execution_started_at,completed_at,environment,floor,observations,status,work_order_public_id,created_at,photo_approval_status) VALUES ('r','987654','Executor','2026-10-15T09:00','2026-10-17T16:00','Sala','Térreo','Executado','Aguardando aprovação','work',1,'pending')").run();
 for(let i=0;i<6;i++)db.prepare("INSERT INTO report_photos(public_id,report_public_id,object_key,file_name,content_type,created_at) VALUES (?,'r',?,?,'image/jpeg',?)").run('p'+i,'key'+i,'foto'+i,i);
 db.prepare("INSERT INTO imas_automation_requests VALUES ('r','req','fp','failed',1,1)").run();
 let role='supervisor',race=null;const env={DB:{prepare(sql){const bind=(...args)=>({sql,args,first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)})});return {bind,...bind()};},async batch(ops){race?.();race=null;db.exec('BEGIN');try{const rows=ops.map(o=>({meta:{changes:Number(db.prepare(o.sql).run(...o.args).changes)}}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const fp={};vm.runInNewContext(compile('app/imas-approval.ts'),{exports:fp,crypto,TextEncoder,Uint8Array});
 const api={};vm.runInNewContext(compile('app/api/reports/confirm-closed/route.ts'),{exports:api,require:n=>n==='cloudflare:workers'?{env}:n.endsWith('imas-approval')?fp:{requireRole:async allowed=>allowed.includes(role)?role:null},Response,Date,crypto});
 const report=()=>({...Object.fromEntries(Object.entries(db.prepare("SELECT * FROM service_reports WHERE public_id='r'").get()).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v])),photos:db.prepare("SELECT public_id FROM report_photos WHERE report_public_id='r' ORDER BY created_at,id").all().map(p=>({publicId:p.public_id}))});
 const post=async(extra={})=>api.POST(new Request('https://test/api/reports/confirm-closed',{method:'POST',body:JSON.stringify({publicId:'r',expectedNumber:report().origin==='app'?report().imasOsNumber:report().osNumber,fingerprint:await fp.approvalFingerprint(report()),confirmed:true,...extra})}));
 return {db,post,report,setRole:r=>role=r,race:fn=>race=fn};
}
test('Supervisor confirma baixa local, encerra fila e OS vinculada preservando dados, fotos e auditando a declaração',async()=>{
 const s=setup();const photos=s.db.prepare('SELECT * FROM report_photos').all();const before=s.report();
 assert.equal((await s.post()).status,200);const row=s.report();assert.ok(row.downloadedAt);assert.equal(row.status,'Concluída');
 for(const k of ['collaborator','executionStartedAt','completedAt','environment','floor','observations'])assert.equal(row[k],before[k]);
 assert.deepEqual(s.db.prepare('SELECT * FROM report_photos').all(),photos);assert.equal(s.db.prepare('SELECT state FROM imas_automation_requests').get().state,'completed');assert.equal(s.db.prepare("SELECT status FROM work_orders WHERE public_id='work'").get().status,'Concluída');
 const log=s.db.prepare('SELECT * FROM imas_automation_runs').get();assert.match(log.step,/manual.*Supervisor/);assert.match(log.trace_json,/nenhuma foto ou comando/i);
 assert.equal((await s.post()).status,200);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM imas_automation_runs').get().n,1);
});
test('ninguém além do Supervisor confirma baixa; declaração explícita e número oficial são obrigatórios',async()=>{
 const s=setup();for(const role of [null,'engenheiro','eletrica','civil']){s.setRole(role);assert.equal((await s.post()).status,403);}s.setRole('supervisor');
 for(const body of [{confirmed:false},{expectedNumber:'APP-teste'},{expectedNumber:'987655'},{fingerprint:'divergente'}])assert.ok((await s.post(body)).status>=400);
 assert.equal(s.report().downloadedAt,null);
});
test('baixa local recusa execução concorrente ou conteúdo/fotos alterados antes da transação',async()=>{
 for(const scenario of ['processing','field','photos']){const s=setup();s.race(()=>{if(scenario==='processing')s.db.prepare("UPDATE imas_automation_requests SET state='processing'").run();if(scenario==='field')s.db.prepare("UPDATE service_reports SET observations='Alterado'").run();if(scenario==='photos')s.db.prepare("DELETE FROM report_photos WHERE public_id='p0'").run();});assert.equal((await s.post()).status,409);assert.equal(s.report().downloadedAt,null);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM imas_automation_runs').get().n,0);}
});
test('OS APP exige vínculo oficial; conclusão manual também reconcilia a etapa Aguardando execução',async()=>{
 const s=setup();s.db.prepare("UPDATE service_reports SET origin='app',os_number='APP-r',status='Aguardando execução'").run();assert.equal((await s.post({expectedNumber:'987654'})).status,409);
 s.db.prepare("UPDATE service_reports SET imas_os_number='324500'").run();assert.equal((await s.post()).status,200);assert.equal(s.report().imasOsNumber,'324500');assert.ok(s.report().downloadedAt);
});
