import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {nextSlot,safeJob} from '../tools/imas-extension/schedule.js';
const dir=mkdtempSync(join(tmpdir(),'rco-imas-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
for(const name of ['imas-config','imas-schedule','supervisor-holds','photo-policy','uploaded-photos','imas-jobs']){
 const source=readFileSync(new URL(`../app/${name}.ts`,import.meta.url),'utf8').replace('"./imas-config"','"./imas-config.mjs"').replace('"./imas-schedule"','"./imas-schedule.mjs"').replace('"./supervisor-holds"','"./supervisor-holds.mjs"').replace('"./photo-policy"','"./photo-policy.mjs"').replace('"cloudflare:workers"','"./host.mjs"');
 writeFileSync(join(dir,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {imasJob}=await import(pathToFileURL(join(dir,'imas-jobs.mjs')));
const {IMAS_RESPONSIBLE,APP_RESPONSIBLE}=await import(pathToFileURL(join(dir,'imas-config.mjs')));
const report={publicId:'app-id',origin:'app',osNumber:'APP-20261005-12345678',area:'eletrica',collaborator:'FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO',environment:'Galpão 01 - Portão 03',floor:'Térreo',executionStartedAt:'2026-10-05T09:35',completedAt:'2026-10-05T10:30',observations:'Instalação realizada.\nTestes OK.',photos:[{publicId:'photo',url:'/api/photos/photo'}],imasSubject:'Instalação de painel de comando',imasSystem:'Elétrico',imasOpenedAt:'2026-10-05T09:32',imasOsNumber:'',workOrder:null};
test('APP começa em criação Aberta e passa ao encerramento somente com número vinculado',()=>{const job=imasJob(report);assert.equal(job.phase,'criar');assert.equal(job.fixed.status,'1 - Aberta');assert.equal(job.fixed.creationJustification,'Abertura de OS');assert.equal(job.responsible,IMAS_RESPONSIBLE.supervisor);assert.ok(job.ready);assert.equal(imasJob({...report,imasOsNumber:'323999'}).phase,'encerrar');});
test('preventivas do sistema só entram na etapa de encerramento',()=>{const job=imasJob({...report,origin:'sistema',osNumber:'323093',imasSubject:'',imasSystem:'',imasOpenedAt:''});assert.equal(job.phase,'encerrar');assert.equal(job.externalNumber,'323093');assert.ok(job.ready);});
test('legados incompletos ficam pendentes, sem inventar dados',()=>{const job=imasJob({...report,imasSubject:'',imasSystem:'',imasOpenedAt:''});assert.equal(job.ready,false);assert.equal(job.errors.length,2);assert.throws(()=>safeJob(job));});
test('não aceita comandos para salvar nem criar uma referência já vinculada',()=>{const job=imasJob(report);assert.throws(()=>safeJob({...job,saveAllowed:true}));assert.throws(()=>safeJob({...job,photoUploadAllowed:true}));assert.throws(()=>safeJob({...job,externalNumber:'123'}));assert.equal(safeJob(job).saveAllowed,false);});
test('agenda hoje às 15h45 e dias seguintes às 07h em São Paulo, pulando fins de semana',()=>{for(const [input,expected] of [['2026-10-08T15:00:00Z','2026-10-08T18:45:00Z'],['2026-10-08T18:45:00Z','2026-10-09T10:00:00Z'],['2026-10-09T09:59:00Z','2026-10-09T10:00:00Z'],['2026-10-09T10:00:00Z','2026-10-12T10:00:00Z'],['2026-10-10T14:00:00Z','2026-10-12T10:00:00Z'],['2026-10-11T14:00:00Z','2026-10-12T10:00:00Z']])assert.equal(new Date(nextSlot(new Date(input))).toISOString(),new Date(expected).toISOString());});
const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
const objects=new Map();
const env={DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},sql,args};}};},async batch(ops){db.exec('BEGIN');try{const rows=ops.map(op=>db.prepare(op.sql).run(...op.args));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}},BUCKET:{async put(key,body){objects.set(key,body);},async delete(key){objects.delete(key);}}};
let role='supervisor';
// Host mocks stay in memory; only route code is transpiled into the temporary directory.
globalThis.__imasTest={env,async requireRole(allowed){return allowed.includes(role)?role:null;}};
writeFileSync(join(dir,'host.mjs'),'export const env=globalThis.__imasTest.env;export const requireRole=globalThis.__imasTest.requireRole;');
for(const [name,path] of [['local','../app/api/local-orders/route.ts'],['link','../app/api/imas/link/route.ts'],['delete','../app/api/reports/delete/route.ts']]){
 const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/"cloudflare:workers"/g,'"./host.mjs"').replace(/"(?:\.\.\/)+auth"/g,'"./host.mjs"').replace(/"(?:\.\.\/)+imas-config"/g,'"./imas-config.mjs"').replace(/"(?:\.\.\/)+imas-schedule"/g,'"./imas-schedule.mjs"').replace(/"(?:\.\.\/)+photo-policy"/g,'"./photo-policy.mjs"').replace(/"(?:\.\.\/)+uploaded-photos"/g,'"./uploaded-photos.mjs"');
 writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const local=await import(pathToFileURL(join(dir,'local.mjs'))),link=await import(pathToFileURL(join(dir,'link.mjs')));
const body=(override={})=>{const data=new FormData();Object.entries({...report,activityType:'Corretiva',description:'Problema identificado',equipment:'',collaborator:'FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO',...override}).forEach(([k,v])=>typeof v==='string'&&data.append(k,v));data.append('photos',new File([new Uint8Array([255,216,255,217])],'photo.jpg',{type:'image/jpeg'}));return data;};
const request=data=>new Request('https://rco.test/api/local-orders',{method:'POST',body:data});
const bind=(publicId,osNumber)=>link.POST(new Request('https://rco.test/api/imas/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId,osNumber})}));
test('criação persiste todos os campos e usa responsável da função no servidor',async()=>{role='eletrica';const response=await local.POST(request(body({area:'civil'})));assert.equal(response.status,201);const saved=await response.json();const row=db.prepare('SELECT * FROM service_reports WHERE public_id=?').get(saved.publicId);assert.equal(row.area,'eletrica');assert.equal(row.collaborator,APP_RESPONSIBLE.supervisor);assert.equal(row.imas_system,'Elétrico');assert.equal(row.imas_subject,report.imasSubject);assert.equal(row.imas_opened_at,report.imasOpenedAt);assert.equal(row.imas_os_number,'');assert.equal(row.downloaded_at,null);assert.equal(db.prepare('SELECT count(*) n FROM report_photos WHERE report_public_id=?').get(saved.publicId).n,1);});
test('servidor rejeita sistema inventado e datas invertidas',async()=>{role='supervisor';assert.equal((await local.POST(request(body({imasSystem:'Inventado'})))).status,400);assert.equal((await local.POST(request(body({completedAt:'2026-10-04T09:00'})))).status,400);});
test('vínculo exige supervisor, não duplica nem permite trocar o número já gravado',async()=>{role='supervisor';const response=await local.POST(request(body()));const first=await response.json();const second=await(await local.POST(request(body()))).json();role='civil';assert.equal((await bind(first.publicId,'999998')).status,403);role='supervisor';assert.equal((await bind(first.publicId,'999998')).status,200);assert.equal((await bind(first.publicId,'999998')).status,200);assert.equal((await bind(first.publicId,'999997')).status,409);assert.equal((await bind(second.publicId,'999998')).status,409);assert.equal((await bind(second.publicId,'APP-TEST')).status,400);assert.equal(db.prepare('SELECT imas_os_number FROM service_reports WHERE public_id=?').get(first.publicId).imas_os_number,'999998');});
test('pacote da extensão não contém mecanismos de gravação automática',()=>{const background=readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8');const adapter=readFileSync(new URL('../tools/imas-extension/imas.js',import.meta.url),'utf8');assert.doesNotMatch(background,/reports\/downloaded|action:\s*['"]baixada/);assert.doesNotMatch(adapter,/\.submit\s*\(|requestSubmit\s*\(|exactButton\(['"]Enviar arquivos/);assert.match(adapter,/input\.files=transfer\.files/);assert.doesNotMatch(adapter,/dispatchEvent\(new Event\('change'[^\n]*transfer/);});

const deletion=await import(pathToFileURL(join(dir,'delete.mjs')));
const remove=publicId=>deletion.DELETE(new Request('https://rco.test/api/reports/delete',{method:'DELETE',body:JSON.stringify({publicId})}));
test('exclusão exige supervisor e preserva fotos; bloqueia OS vinculada e novo vínculo após excluir',async()=>{role='supervisor';const first=await(await local.POST(request(body()))).json();role='civil';assert.equal((await remove(first.publicId)).status,403);role='supervisor';assert.equal((await remove(first.publicId)).status,200);assert.equal(db.prepare('SELECT status FROM service_reports WHERE public_id=?').get(first.publicId).status,'Excluída');assert.equal(db.prepare('SELECT count(*) n FROM report_photos WHERE report_public_id=?').get(first.publicId).n,1);assert.equal((await bind(first.publicId,'999996')).status,404);const second=await(await local.POST(request(body()))).json();assert.equal((await bind(second.publicId,'999995')).status,200);assert.equal((await remove(second.publicId)).status,409);});

test('abertura automática usa horário de São Paulo e recusa executor digitado fora do cadastro',async()=>{role='supervisor';const result=await local.POST(request(body({imasOpenedAt:''})));assert.equal(result.status,201);const saved=await result.json();const row=db.prepare('SELECT imas_opened_at FROM service_reports WHERE public_id=?').get(saved.publicId);assert.match(row.imas_opened_at,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);assert.equal((await local.POST(request(body({collaborator:'Nome livre'})))).status,400);});
test('horário não é impeditivo: abertura posterior ao início e janela fora de 08:30–16:00 saem ajustadas na fila',()=>{
  const job=imasJob({...report,executionStartedAt:'2026-10-08T07:40',completedAt:'2026-10-08T08:10',imasOpenedAt:'2026-10-08T17:42'});
  assert.ok(job.ready,job.errors.join(','));
  assert.equal(job.report.executionStartedAt,'2026-10-08T08:30');assert.equal(job.report.completedAt,'2026-10-08T11:30');assert.equal(job.report.imasOpenedAt,'2026-10-08T08:00');
});
