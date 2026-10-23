import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/api/reports/downloaded/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function setup(role,found=true,row={origin:"sistema",imas_os_number:"",status:"Concluída"},changes=1){
  const writes=[];
  const env={DB:{prepare:sql=>({bind:(...args)=>({first:async()=>found?{public_id:'r1',...row}:null,run:async()=>{writes.push({sql,args});return {meta:{changes}}}})})}};
  const exports={};
  vm.runInNewContext(compiled,{exports,require:name=>name==='cloudflare:workers'?{env}:{requireRole:async allowed=>allowed.includes(role)?role:null},Response,Request,Date,console:{error(){}}});
  return {patch:exports.PATCH,writes};
}

const request=()=>new Request('https://example.test/api/reports/downloaded',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:'r1'})});

test('only supervisor can mark an existing OS as downloaded',async()=>{
  for(const role of [null,'eletrica','hidraulica','refrigeracao','civil']){const app=setup(role);assert.equal((await app.patch(request())).status,403);assert.equal(app.writes.length,0);}
  const supervisor=setup('supervisor');assert.equal((await supervisor.patch(request())).status,200);assert.equal(supervisor.writes.length,1);assert.match(supervisor.writes[0].sql,/downloaded_at/);
});

test('does not write when OS is missing',async()=>{const app=setup('supervisor',false);assert.equal((await app.patch(request())).status,404);assert.equal(app.writes.length,0);});

test('OS criada no app sem número oficial do IMAS não pode ser baixada',async()=>{
  for(const number of ['', 'APP-20261001-4E9BD0D3', '0', 'erro']){const app=setup('supervisor',true,{origin:'app',imas_os_number:number,status:'Concluída'});assert.equal((await app.patch(request())).status,409);assert.equal(app.writes.length,0);}
  const linked=setup('supervisor',true,{origin:'app',imas_os_number:'323902',status:'Concluída'});assert.equal((await linked.patch(request())).status,200);assert.equal(linked.writes.length,1);assert.equal(linked.writes[0].args[2],'323902');
});
test('OS excluída ou vínculo alterado durante a baixa não retorna sucesso',async()=>{
 const excluded=setup('supervisor',true,{origin:'app',imas_os_number:'323902',status:'Excluída'});assert.equal((await excluded.patch(request())).status,409);assert.equal(excluded.writes.length,0);
 const changed=setup('supervisor',true,{origin:'app',imas_os_number:'323902',status:'Concluída'},0);assert.equal((await changed.patch(request())).status,409);
});
