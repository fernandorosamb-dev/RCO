import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../app/api/reports/edit/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function pure(name){const exports={};const code=ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,Date});return exports;}
const imasConfig=pure('imas-config');const imasSchedule=pure('imas-schedule');
const locationFields=pure('location-fields');
const photoPolicy=pure('photo-policy');
function setup(role, origin='app', fail=false){
 const batches=[];
 const report={origin,area:'civil',created_by_role:'civil',work_order_public_id:origin==='app'?null:'system1',os_number:'123'};
 const env={DB:{prepare:sql=>({bind:(...args)=>({sql,args,first:async()=>sql.includes('assigned_area')?{assigned_area:'civil'}:report,all:async()=>({results:['p1','p2','p3'].map(public_id=>({public_id}))})})}),batch:async ops=>{if(fail)throw Error('failure');batches.push(ops);}},BUCKET:{delete:async()=>{}}};
 const uploaded={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/uploaded-photos.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:uploaded,require:()=>({env}),File,FormData});
 const exports={};vm.runInNewContext(compiled,{exports,require:name=>name==='cloudflare:workers'?{env}:name.includes('photo-policy')?photoPolicy:name.includes('uploaded-photos')?uploaded:name.includes('imas-intake')?{submitToImas:async()=>({message:'ok'})}:name.includes('imas-config')?imasConfig:name.includes('imas-schedule')?imasSchedule:name.includes('location-fields')?locationFields:{requireRole:async allowed=>allowed.includes(role)?role:null},Response,Request,File,FormData,Date,crypto,console:{error(){}}});
 return {patch:exports.PATCH,batches};
}
function request(overrides={}){const f=new FormData();for(const [k,v] of Object.entries({publicId:'r1',collaborator:'FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO',executionStartedAt:'2026-09-04T10:00',completedAt:'2026-09-04T11:00',environment:'Sala',floor:'Térreo',observations:'Correção',keepPhotos:'["p1","p2","p3"]',imasSystem:'Elétrico',imasSubject:'Assunto informado',imasOpenedAt:'2026-09-04T09:00',imasActivation:'',imasClientReference:'',activityType:'Corretiva',description:'Descrição',equipment:'TAG',area:'eletrica',...overrides}))f.set(k,v);return new Request('https://example.test/api/reports/edit',{method:'PATCH',body:f});}
test('supervisor edits all reports; collaborator edits own team without changing ownership',async()=>{for(const origin of ['app','sistema'])for(const role of ['supervisor','civil']){const app=setup(role,origin);assert.equal((await app.patch(request())).status,200);assert.equal(app.batches.length,1);assert.ok(!app.batches[0][0].sql.includes('os_number='));if(origin==='app')assert.equal(app.batches[0][1].args[3],role==='supervisor'?'eletrica':'civil');}});
test('rejects anonymous and cross-team edits before writes',async()=>{for(const origin of ['app','sistema'])for(const role of [null,'eletrica','hidraulica','refrigeracao']){const app=setup(role,origin);assert.equal((await app.patch(request())).status,role?403:401);assert.equal(app.batches.length,0);}});
test('rejects invalid evidence and dates; failed transaction reports failure',async()=>{for(const overrides of [{keepPhotos:'["p1","p2","foreign"]'},{keepPhotos:'[]'},{completedAt:'data inválida'}]){const app=setup('civil');assert.equal((await app.patch(request(overrides))).status,400);assert.equal(app.batches.length,0);}assert.equal((await setup('civil','app',true).patch(request())).status,500);});
