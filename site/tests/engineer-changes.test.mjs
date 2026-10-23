import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'rco-eng-'));after(()=>rmSync(dir,{recursive:true,force:true}));
const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
const env={DB:{prepare(sql){const direct={async first(){return db.prepare(sql).get()||null;},async all(){return {results:db.prepare(sql).all()};},async run(){const r=db.prepare(sql).run();return {meta:{changes:Number(r.changes)}};}};return {...direct,bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},sql,args};}};},async batch(ops){const hook=globalThis.__beforeEngineerBatch;globalThis.__beforeEngineerBatch=null;hook?.();db.exec('BEGIN');try{const rows=ops.map(op=>db.prepare(op.sql).run(...op.args));db.exec('COMMIT');return rows.map(r=>({meta:{changes:Number(r.changes)}}));}catch(e){db.exec('ROLLBACK');throw e;}}}};
let role='engenheiro';const calls=[];
globalThis.__eng={env,async requireRole(a){return a.includes(role)?role:null;},calls};
writeFileSync(join(dir,'host.mjs'),'export const env=globalThis.__eng.env;export const requireRole=globalThis.__eng.requireRole;');
writeFileSync(join(dir,'stubs.mjs'),'const c=globalThis.__eng.calls;export const GET=async()=>Response.json({reports:[{publicId:"e4",photos:[{publicId:"p1"}]}]});export const POST=async(req)=>{c.push(await req.json());return Response.json({message:"ok"});};export const approvalFingerprint=async()=>"fp";');
const map=[[/"cloudflare:workers"/g,'"./host.mjs"'],[/"(?:\.\.\/)+auth"/g,'"./host.mjs"'],[/"(?:\.\.\/)+imas-config"/g,'"./imas-config.mjs"'],[/"(?:\.\.\/)+imas-schedule"/g,'"./imas-schedule.mjs"'],[/"(?:\.\.\/)+location-fields"/g,'"./location-fields.mjs"'],[/"(?:\.\.\/)+report-actions"/g,'"./report-actions.mjs"'],[/"\.\.\/\.\.\/route"/g,'"./stubs.mjs"'],[/"(?:\.\.\/)+imas\/approve\/route"/g,'"./stubs.mjs"'],[/"(?:\.\.\/)+return\/route"/g,'"./stubs.mjs"'],[/"(?:\.\.\/)+imas-approval"/g,'"./stubs.mjs"'],[/"\.\/imas-config"/g,'"./imas-config.mjs"'],[/"\.\/imas-schedule"/g,'"./imas-schedule.mjs"'],[/"\.\/location-fields"/g,'"./location-fields.mjs"']];
for(const [name,path] of [['role-roster-server','../app/role-roster-server.ts'],['role-roster','../app/role-roster.ts'],['preventive-schedule-server','../app/preventive-schedule-server.ts'],['preventive-schedule','../app/preventive-schedule.ts'],['maintenance-plan','../app/maintenance-plan.ts'],['imas-config','../app/imas-config.ts'],['imas-schedule','../app/imas-schedule.ts'],['location-fields','../app/location-fields.ts'],['report-actions','../app/report-actions.ts'],['proposals','../app/api/reports/proposals/route.ts'],['decide','../app/api/reports/proposals/decide/route.ts'],['reject','../app/api/reports/reject/route.ts'],['batch','../app/api/imas/batch-request/route.ts']]){
 let source=readFileSync(new URL(path,import.meta.url),'utf8');for(const [a,b] of map)source=source.replace(a,b);
 writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source.replace(/"(?:\.\.?\/)+(role-roster-server|role-roster|preventive-schedule-server|preventive-schedule|maintenance-plan)"/g,'"./$1.mjs"'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const imp=n=>import(pathToFileURL(join(dir,n+'.mjs')));
const proposals=await imp('proposals'),decide=await imp('decide'),reject=await imp('reject'),batch=await imp('batch'),actions=await imp('report-actions');
const EXEC='FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO';
const seed=(id,origin='sistema',extra={})=>{const o={os:'323200',imas:'',wo:'wo-'+id,status:'Concluída',...extra};
 db.prepare("INSERT OR IGNORE INTO work_orders (public_id,competence,os_number,client,unit,environment,floor,opened_at,due_at,original_status,description,equipment,assigned_area,assigned_responsible,status,imported_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('wo-'+id,'2026-10',o.os,'c','u','','','','','Aberta','','','civil','x','Aguardando aprovação','',1,1);
 db.prepare("INSERT INTO service_reports (public_id,os_number,collaborator,execution_started_at,completed_at,environment,floor,observations,status,work_order_public_id,origin,activity_type,description,equipment,area,created_by_role,created_at,imas_system,imas_subject,imas_opened_at,imas_os_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,origin==='app'?'APP-1-'+id:o.os,EXEC,'2026-10-08T09:00','2026-10-08T13:00','Sala 1','Térreo','Serviço feito',o.status,origin==='app'?null:o.wo,origin,origin==='app'?'Corretiva':'',origin==='app'?'Desc':'','','civil','civil',Date.now(),origin==='app'?'Civil':'',origin==='app'?'Assunto':'','2026-10-08T08:00',o.imas);};
const post=(mod,body,method='POST',url='https://rco.test/x')=>mod[method](new Request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
const state=id=>db.prepare('SELECT * FROM change_requests WHERE report_public_id=? ORDER BY created_at DESC').all(id);

test('engenheiro propõe edição: nada muda na OS e só ele vê "enviado"; supervisor vê antes/depois',async()=>{
  seed('e1');role='engenheiro';
  const r=await post(proposals,{publicId:'e1',action:'edit',fields:{observations:'Serviço corrigido pelo engenheiro',floor:'Térreo'}});
  assert.equal(r.status,201);assert.equal((await r.json()).message,'Enviado.');
  assert.equal(db.prepare('SELECT observations FROM service_reports WHERE public_id=?').get('e1').observations,'Serviço feito');
  const mine=await (await proposals.GET()).json();assert.deepEqual(mine.sent,['e1']);assert.equal(mine.proposals,undefined);
  role='supervisor';const list=await (await proposals.GET()).json();
  assert.deepEqual(list.proposals[0].before,{observations:'Serviço feito'});assert.deepEqual(list.proposals[0].after,{observations:'Serviço corrigido pelo engenheiro'});
});
test('sem mudança real é recusado; papéis indevidos não propõem nem decidem',async()=>{
  seed('e2');role='engenheiro';assert.equal((await post(proposals,{publicId:'e2',action:'edit',fields:{floor:'Térreo'}})).status,400);
  role='civil';assert.equal((await post(proposals,{publicId:'e2',action:'approve'})).status,403);
  role='engenheiro';assert.equal((await post(decide,{publicId:'x',decision:'apply'})).status,403);
});
test('supervisor autoriza a edição: aplica, registra e não aplica duas vezes',async()=>{
  role='supervisor';const p=db.prepare("SELECT public_id FROM change_requests WHERE report_public_id='e1' AND state='pending'").get().public_id;
  const r=await post(decide,{publicId:p,decision:'apply'});assert.equal(r.status,200);
  assert.equal(db.prepare('SELECT observations FROM service_reports WHERE public_id=?').get('e1').observations,'Serviço corrigido pelo engenheiro');
  assert.equal(state('e1')[0].state,'applied');assert.equal((await post(decide,{publicId:p,decision:'apply'})).status,409);
});
test('edição de horário é padronizada (08:30–16:00, 3 h) e proposta desatualizada é barrada',async()=>{
  seed('e3');role='engenheiro';await post(proposals,{publicId:'e3',action:'edit',fields:{executionStartedAt:'2026-10-08T07:00',completedAt:'2026-10-08T07:30'}});
  const pr=state('e3')[0];assert.deepEqual(JSON.parse(pr.after_json),{executionStartedAt:'2026-10-08T08:30',completedAt:'2026-10-08T11:30'});
  db.prepare("UPDATE service_reports SET completed_at='2026-10-08T14:00' WHERE public_id='e3'").run();
  role='supervisor';assert.equal((await post(decide,{publicId:pr.public_id,decision:'apply'})).status,409);assert.equal(state('e3')[0].state,'pending');
  assert.equal((await post(decide,{publicId:pr.public_id,decision:'dismiss'})).status,200);assert.equal(state('e3')[0].state,'dismissed');
});
test('aprovar/devolver propostos chamam o fluxo existente só quando o supervisor autoriza',async()=>{
  seed('e4');role='engenheiro';await post(proposals,{publicId:'e4',action:'approve'});
  assert.equal((await post(proposals,{publicId:'e4',action:'return'})).status,400);
  role='supervisor';calls.length=0;const id=state('e4')[0].public_id;assert.equal(calls.length,0);
  assert.equal((await post(decide,{publicId:id,decision:'apply'})).status,200);assert.equal(calls.length,1);assert.equal(calls[0].publicId,'e4');
  role='engenheiro';await post(proposals,{publicId:'e4',action:'return',reason:'Faltou foto'});role='supervisor';calls.length=0;
  await post(decide,{publicId:state('e4')[0].public_id,decision:'apply'});assert.equal(calls[0].reason,'Faltou foto');
});
test('rejeitar OS nova do app exclui e não cria; OS do IMAS zera e volta à fila',async()=>{
  seed('n1','app');seed('s1','sistema',{os:'323201'});role='supervisor';
  assert.equal((await post(reject,{publicId:'n1'})).status,200);assert.equal(db.prepare("SELECT status FROM service_reports WHERE public_id='n1'").get().status,'Excluída');
  assert.equal((await post(reject,{publicId:'s1'})).status,200);
  assert.equal(db.prepare("SELECT status FROM service_reports WHERE public_id='s1'").get().status,'Excluída');
  assert.equal(db.prepare("SELECT status FROM work_orders WHERE public_id='wo-s1'").get().status,'Atribuída');
  assert.equal((await post(reject,{publicId:'s1'})).status,409);
  seed('n2','app',{imas:'323999'});assert.equal((await post(reject,{publicId:'n2'})).status,409);
  seed('s2','sistema',{os:'323202'});db.prepare("INSERT INTO imas_automation_requests VALUES ('s2','rq','','processing',1,1)").run();assert.equal((await post(reject,{publicId:'s2'})).status,409);
  role='engenheiro';assert.equal((await post(reject,{publicId:'s2'})).status,403);
});
test('pedido de lote do engenheiro: um só pedido, supervisor pega uma vez',async()=>{
  role='engenheiro';assert.equal((await post(batch,{month:'2026-10'})).status,201);await post(batch,{month:'2026-10'});
  assert.equal(db.prepare("SELECT count(*) n FROM batch_requests").get().n,1);assert.equal((await post(batch,{month:'xx'})).status,400);
  role='supervisor';const got=await (await batch.GET()).json();assert.equal(got.requests[0].month,'2026-10');assert.equal(db.prepare("SELECT state FROM batch_requests").get().state,'authorized');assert.equal(got.requests[0].authorized,true);assert.equal((await post(batch,{id:got.requests[0].id},'PATCH')).status,400);
  assert.equal((await post(batch,{id:got.requests[0].id,decision:'apply'},'PATCH')).status,200);assert.equal((await post(batch,{id:got.requests[0].id,decision:'apply'},'PATCH')).status,409);assert.equal((await (await batch.GET()).json()).requests.length,0);
  role='engenheiro';assert.equal((await batch.GET()).status,403);
});

test('supervisor recusa lote e pedido vencido não é executável',async()=>{
 role='engenheiro';await post(batch,{month:'2026-11'});role='supervisor';const id=(await(await batch.GET()).json()).requests[0].id;
 assert.equal((await post(batch,{id,decision:'dismiss'},'PATCH')).status,200);assert.equal((await post(batch,{id,decision:'apply'},'PATCH')).status,409);
 role='engenheiro';await post(batch,{month:'2026-12'});db.prepare("UPDATE batch_requests SET created_at=1 WHERE month='2026-12'").run();role='supervisor';
 assert.equal((await(await batch.GET()).json()).requests.length,0);const expired=db.prepare("SELECT public_id FROM batch_requests WHERE month='2026-12'").get().public_id;
 assert.equal((await post(batch,{id:expired,decision:'apply'},'PATCH')).status,409);
});

test('claim concorrente impede rejeição e edição sem excluir ou alterar a OS',async()=>{
 seed('race-reject','app');role='supervisor';
 globalThis.__beforeEngineerBatch=()=>db.prepare("INSERT INTO imas_automation_requests VALUES ('race-reject','rq-race-reject','','processing',1,1)").run();
 assert.equal((await post(reject,{publicId:'race-reject'})).status,409);
 assert.equal(db.prepare("SELECT status FROM service_reports WHERE public_id='race-reject'").get().status,'Concluída');
 assert.equal(db.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id='race-reject'").get().state,'processing');
 seed('race-edit');role='engenheiro';await post(proposals,{publicId:'race-edit',action:'edit',fields:{observations:'Novo texto'}});
 const pr=state('race-edit')[0];role='supervisor';
 globalThis.__beforeEngineerBatch=()=>db.prepare("INSERT INTO imas_automation_requests VALUES ('race-edit','rq-race-edit','','processing',1,1)").run();
 assert.equal((await post(decide,{publicId:pr.public_id,decision:'apply'})).status,409);
 assert.equal(db.prepare("SELECT observations FROM service_reports WHERE public_id='race-edit'").get().observations,'Serviço feito');
});
