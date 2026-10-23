import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import ts from 'typescript';import {readFileSync,readdirSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const compile=p=>ts.transpileModule(readFileSync(new URL('../'+p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const db=new DatabaseSync(':memory:');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));
 let role='supervisor';const env={DB:{prepare(sql){const bind=(...args)=>({sql,args,first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});return {...bind(),bind};},async batch(ops){db.exec('BEGIN');try{const result=ops.map(o=>({meta:{changes:Number(db.prepare(o.sql).run(...o.args).changes)}}));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const base={publicId:'one',origin:'sistema',osNumber:'324000',environment:'Galpão',floor:'Térreo',observations:'Serviço concluído',collaborator:'IVAN RIVALDIR DE SOUZA SANTOS - AUXILIAR DE MANUTENÇÃO',executionStartedAt:'2026-10-08T09:00',completedAt:'2026-10-08T10:00',activityType:'Preventiva',photos:[],workOrder:null};
 db.prepare("INSERT INTO service_reports(public_id,os_number,collaborator,execution_started_at,completed_at,environment,floor,observations,status,created_at,photo_approval_status) VALUES ('one','324000',?,?,?,?,?,?,'Concluída',0,'pending')").run(base.collaborator,base.executionStartedAt,base.completedAt,base.environment,base.floor,base.observations);
 for(let i=0;i<6;i++)db.prepare("INSERT INTO report_photos(public_id,report_public_id,object_key,file_name,content_type,created_at) VALUES (?,'one',?,?,'image/jpeg',0)").run('p'+i,'k'+i,'p'+i);
 const report=()=>({...base,status:db.prepare("SELECT status FROM service_reports WHERE public_id='one'").get().status,photoApprovalStatus:db.prepare("SELECT photo_approval_status FROM service_reports WHERE public_id='one'").get().photo_approval_status,photos:db.prepare("SELECT public_id FROM report_photos ORDER BY public_id").all().map(r=>({publicId:r.public_id,url:'/api/photos/'+r.public_id}))});
 const modules={};function load(path){if(modules[path])return modules[path];const exports={};const require=name=>name==='cloudflare:workers'?{env}:name.endsWith('role-roster-server')?load('app/role-roster-server.ts'):name.endsWith('role-roster')?load('app/role-roster.ts'):name.endsWith('preventive-schedule-server')?load('app/preventive-schedule-server.ts'):name.endsWith('preventive-schedule')?load('app/preventive-schedule.ts'):name.endsWith('maintenance-plan')?load('app/maintenance-plan.ts'):name.endsWith('auth')?{requireRole:async allowed=>allowed.includes(role)?role:null}:name==='../../reports/route'?{GET:async()=>Response.json({reports:[report()]})}:name.endsWith('photo-approval/route')?load('app/api/reports/photo-approval/route.ts'):name.endsWith('imas-queue-admission')?load('app/imas-queue-admission.ts'):name.endsWith('imas-timeout')?load('app/imas-timeout.ts'):name.endsWith('imas-jobs')?load('app/imas-jobs.ts'):name.endsWith('imas-approval')?load('app/imas-approval.ts'):name.endsWith('imas-config')?load('app/imas-config.ts'):name.endsWith('imas-schedule')?load('app/imas-schedule.ts'):name.endsWith('supervisor-holds')?load('app/supervisor-holds.ts'):name.endsWith('imas-intake')?{submitToImas:async()=>({message:'ok'})}:name.endsWith('imas-approval')&&false?0:name.endsWith('photo-policy')?load('app/photo-policy.ts'):(()=>{throw Error(name)})();vm.runInNewContext(compile(path),{exports,require,Request,Response,Date,crypto,TextEncoder,Uint8Array});return modules[path]=exports;}
 const api=load('app/api/imas/approve/route.ts'),fp=load('app/imas-approval.ts').approvalFingerprint,queue=load('app/api/imas/queue/route.ts');const req=body=>new Request('https://test/api/imas/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {db,base,report,fp,queue,setRole:r=>role=r,post:body=>api.POST(req(body)),approve:async()=>api.POST(req({publicId:'one',photoIds:report().photos.map(p=>p.publicId),fingerprint:await fp(report())}))};
}
test('Aprovar OS aprova fotos e cria uma única solicitação durável sem marcar baixa',async()=>{const s=setup();const r=await s.approve();assert.equal(r.status,200);const first=await r.json();const second=await (await s.approve()).json();assert.equal(first.requestId,second.requestId);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM imas_automation_requests').get().n,1);assert.equal(s.report().photoApprovalStatus,'approved');assert.equal(s.db.prepare("SELECT downloaded_at FROM service_reports WHERE public_id='one'").get().downloaded_at,null);const job=(await (await s.queue.GET()).json()).jobs[0];assert.equal(job.approvalRequest.requestId,first.requestId);});
test('apenas supervisor pode aprovar e dados antigos/fotos alteradas não entram na fila',async()=>{const s=setup();s.setRole('civil');assert.equal((await s.approve()).status,403);s.setRole('supervisor');const hash=await s.fp(s.report());s.base.observations='Texto alterado';assert.equal((await s.post({publicId:'one',photoIds:s.report().photos.map(p=>p.publicId),fingerprint:hash})).status,409);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM imas_automation_requests').get().n,0);});
test('claim atômico permite um único executor e bloqueia nova aprovação em processamento',async()=>{const s=setup();const {requestId}=await (await s.approve()).json();assert.equal((await s.post({action:'claim',publicId:'one',requestId})).status,200);assert.equal((await s.post({action:'claim',publicId:'one',requestId})).status,409);assert.equal((await s.approve()).status,409);});
test('edição depois da aprovação remove solicitação executável e recusa claim antigo',async()=>{const s=setup();const {requestId}=await (await s.approve()).json();s.base.floor='Outro pavimento';assert.equal((await (await s.queue.GET()).json()).jobs[0].approvalRequest,null);assert.equal((await s.post({action:'claim',publicId:'one',requestId})).status,409);});
test('campos faltantes e OS protegida não são liberados',async()=>{for(const patch of [{collaborator:''},{environment:''},{osNumber:'323902'}]){const s=setup();Object.assign(s.base,patch);assert.equal((await s.approve()).status,409);assert.equal(s.report().photoApprovalStatus,'pending');}});

test('supervisor aprova OS devolvida: encerra devolução, libera fotos, sai da revisão e vai à fila',async()=>{
 const s=setup();s.base.activityType='';s.db.prepare("UPDATE service_reports SET status='Devolvida',return_reason='Corrigir fotos',photo_approval_status='not_required' WHERE public_id='one'").run();
 s.db.prepare("INSERT INTO imas_automation_requests VALUES ('one','returned-rq','','returned',1,1)").run();
 assert.equal((await s.post({action:'claim',publicId:'one',requestId:'returned-rq'})).status,409);
 const response=await s.approve();assert.equal(response.status,200);const result=await response.json();
 const row=s.db.prepare("SELECT * FROM service_reports WHERE public_id='one'").get();assert.equal(row.status,'Concluída');assert.equal(row.return_reason,'');assert.equal(row.photo_approval_status,'approved');assert.equal(row.downloaded_at,null);
 assert.equal(s.db.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id='one'").get().state,'queued');
 const job=(await(await s.queue.GET()).json()).jobs[0];assert.equal(job.approvalRequest.requestId,result.requestId);assert.equal(job.ready,true);
 assert.equal((await s.post({action:'claim',publicId:'one',requestId:result.requestId})).status,200);
});
test('devolvida inválida ou com fotos antigas não é liberada nem perde motivo',async()=>{
 for(const invalid of ['field','photos']){
  const s=setup();s.db.prepare("UPDATE service_reports SET status='Devolvida',return_reason='Corrigir' WHERE public_id='one'").run();
  if(invalid==='field')s.base.environment='';
  const r=await s.post({publicId:'one',fingerprint:await s.fp(s.report()),photoIds:invalid==='photos'?['old']:s.report().photos.map(p=>p.publicId)});
  assert.equal(r.status,409);const row=s.db.prepare("SELECT status,return_reason FROM service_reports WHERE public_id='one'").get();assert.equal(row.status,'Devolvida');assert.equal(row.return_reason,'Corrigir');assert.equal(s.db.prepare('SELECT COUNT(*) n FROM imas_automation_requests').get().n,0);
 }
});

test('processing abandonado é retirado da fila executável e permite nova aprovação sem baixa',async()=>{const s=setup();const {requestId}=await(await s.approve()).json();await s.post({action:'claim',publicId:'one',requestId});s.db.prepare("UPDATE imas_automation_requests SET updated_at=?").run(Date.now()-31*60*1000);const q=await s.queue.GET();assert.equal(q.status,200);assert.equal((await q.json()).jobs[0].approvalRequest.state,'failed');assert.equal(s.db.prepare('SELECT state FROM imas_automation_requests').get().state,'failed');const approved=await s.approve();assert.equal(approved.status,200);assert.notEqual((await approved.json()).requestId,requestId);assert.equal(s.db.prepare('SELECT downloaded_at FROM service_reports').get().downloaded_at,null);});

test('fila não anuncia como pronta OS apenas válida sem aprovação executável',async()=>{
 const s=setup();s.db.prepare("UPDATE service_reports SET photo_approval_status='approved'").run();
 for(const state of [null,'review','failed','rejected','completed','processing']){
  s.db.prepare('DELETE FROM imas_automation_requests').run();
  if(state)s.db.prepare("INSERT INTO imas_automation_requests VALUES ('one','request','fp',?,1,1)").run(state);
  const job=(await(await s.queue.GET()).json()).jobs[0];assert.equal(job.ready,false,state);assert.equal(job.approvalRequest,null,state);
 }
});
test('falha após aprovação bloqueia lote e nova aprovação explícita gera request novo',async()=>{
 const s=setup();const first=await(await s.approve()).json();
 const stamp=Date.now();s.db.prepare("INSERT INTO imas_automation_runs VALUES ('failure','one','2.5.8','failed','Preencher campo',?,'[]',?)").run(JSON.stringify([{at:new Date(stamp).toISOString(),status:'failed',message:'Não preenchido'}]),stamp);
 const blocked=(await(await s.queue.GET()).json()).jobs[0];assert.equal(blocked.ready,false);assert.equal(blocked.approvalRequest.requestId,first.requestId);assert.match(blocked.errors.join(' '),/Erro do IMAS/);assert.equal((await s.post({action:'claim',publicId:'one',requestId:first.requestId})).status,409);
 await new Promise(resolve=>setTimeout(resolve,2));const second=await(await s.approve()).json();assert.notEqual(second.requestId,first.requestId);
 const ready=(await(await s.queue.GET()).json()).jobs[0];assert.equal(ready.ready,true);assert.equal(ready.approvalRequest.requestId,second.requestId);
});
test('324279 concluída é protegida por número ou referência interna mesmo sem baixa local',async()=>{
 for(const patch of [{osNumber:'324279'},{publicId:'4d2fcf45-fbce-4c0c-9a02-688f1fe24000'}]){
  const s=setup();Object.assign(s.base,patch);assert.ok((await s.approve()).status>=400);const jobs=(await(await s.queue.GET()).json()).jobs;assert.equal(jobs[0].ready,false);assert.match(jobs[0].errors.join(' '),/protegida/);
 }
});

test('extensão consegue reler a própria OS após claim sem perder autorização; segunda claim continua bloqueada',async()=>{
 const s=setup();const {requestId}=await(await s.approve()).json();
 assert.equal((await s.post({action:'claim',publicId:'one',requestId})).status,200);
 const job=(await(await s.queue.GET()).json()).jobs[0];
 assert.equal(job.ready,true,'a releitura durante processing precisa continuar válida');
 assert.equal(job.approvalRequest.requestId,requestId);
 assert.equal(job.approvalRequest.state,'processing');
 assert.equal((await s.post({action:'claim',publicId:'one',requestId})).status,409,'outro executor não pode assumir de novo');
 assert.equal(s.db.prepare('SELECT downloaded_at FROM service_reports').get().downloaded_at,null);
});

test('Voltar à fila retoma falha com mesma aprovação, preserva fotos e recusa conteúdo alterado',async()=>{
 const s=setup();const first=await(await s.approve()).json();s.db.prepare("UPDATE imas_automation_requests SET state='failed'").run();
 const before=s.db.prepare('SELECT public_id FROM report_photos ORDER BY public_id').all();
 const retry=await s.post({publicId:'one',action:'retry',fingerprint:await s.fp(s.report())});assert.equal(retry.status,200);
 assert.notEqual((await retry.json()).requestId,first.requestId);assert.deepEqual(s.db.prepare('SELECT public_id FROM report_photos ORDER BY public_id').all(),before);
 s.db.prepare("UPDATE imas_automation_requests SET state='failed'").run();s.base.observations='Mudou conteúdo';
 assert.equal((await s.post({publicId:'one',action:'force',fingerprint:await s.fp(s.report())})).status,409);
 assert.equal(s.db.prepare('SELECT downloaded_at FROM service_reports').get().downloaded_at,null);
});
test('Forçar fechamento não libera OS protegida, execução em curso ou erro obrigatório',async()=>{
 for(const scenario of ['protected','processing','invalid']){
  const s=setup();await s.approve();s.db.prepare("UPDATE imas_automation_requests SET state=?").run(scenario==='processing'?'processing':'failed');
  if(scenario==='protected')s.base.osNumber='324279';if(scenario==='invalid')s.base.environment='';
  const response=await s.post({publicId:'one',action:'force',fingerprint:await s.fp(s.report())});assert.equal(response.status,409);
 }
});
