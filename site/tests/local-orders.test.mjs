import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/local-orders/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function pure(name){const exports={};const code=ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,Date});return exports;}
const imasConfig=pure('imas-config');const imasSchedule=pure('imas-schedule');
const locationFields=pure('location-fields');
const photoPolicy=pure('photo-policy');
function setup(role, failUpload = false) {
  const batches = [], uploaded = [], removed = [];
  const env = {
    DB: { prepare: sql => ({ bind: (...args) => ({ sql, args, first: async () => (globalThis.__dupOrder ? { os_number: 'APP-DUP' } : null) }) }), batch: async statements => { batches.push(statements); } },
    BUCKET: { put: async key => { if (failUpload) throw Error('upload unavailable'); uploaded.push(key); }, delete: async key => { removed.push(key); } }
  };
  const photoSources={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/uploaded-photos.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:photoSources,require:()=>({env}),File,FormData});
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => name === 'cloudflare:workers' ? { env } : name.includes('photo-policy')?photoPolicy:name.includes('uploaded-photos')?photoSources:name.includes('imas-intake')?{submitToImas:async()=>({message:'ok'})}:name.includes('imas-config')?imasConfig:name.includes('imas-schedule')?imasSchedule:name.includes('location-fields')?locationFields: { requireRole: async allowed => allowed.includes(role) ? role : null }, Response, Request, File, FormData, Date, crypto, console: { error() {} } });
  return { post: exports.POST, batches, uploaded, removed };
}
function request(overrides = {}, photoCount = 3) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ imasSystem:'Elétrico',imasSubject:'Assunto informado',imasOpenedAt:'2026-09-04T09:00',imasActivation:'',imasClientReference:'',activityType:'Corretiva', area:'civil', collaborator:'IVAN RIVALDIR DE SOUZA SANTOS - AUXILIAR DE MANUTENÇÃO', environment:'Ambiente de teste', floor:'Térreo', equipment:'TAG teste', description:'Descrição', observations:'Resultado', executionStartedAt:'2026-09-04T10:00', completedAt:'2026-09-04T11:00', ...overrides })) form.set(key,value);
  for(let i=0;i<photoCount;i++) form.append('photos',new File(['test-bytes'], `foto-${i}.jpg`, {type:'image/jpeg'}));
  return new Request('https://example.test/api/local-orders',{method:'POST',body:form});
}
test('supervisor and all teams create local reports without system OS', async () => {
  for(const role of ['supervisor','eletrica','hidraulica','refrigeracao','civil']) {
    const app=setup(role); const response=await app.post(request());
    assert.equal(response.status,201); const body=await response.json();
    assert.match(body.osNumber,/^APP-\d{8}-[A-F0-9]{8}$/);
    assert.equal(app.uploaded.length,3); assert.equal(app.batches.length,1);
    const insert=app.batches[0][0]; assert.equal(insert.args[12],role==='supervisor'?'civil':role);
    assert.equal(insert.args[13],role); assert.equal(app.batches[0].length,4);
  }
});
test('equipment test requires equipment and supports five photos',async()=>{
  const app=setup('supervisor');
  assert.equal((await app.post(request({activityType:'Teste de equipamento',equipment:''}))).status,400);
  assert.equal((await app.post(request({activityType:'Teste de equipamento'},5))).status,201);
});
test('rejects unauthenticated, invalid dates, type and missing evidence before writes',async()=>{
  assert.equal((await setup(null).post(request())).status,401);
  for(const [overrides,count] of [[{activityType:'Preventiva'},3],[{completedAt:'data inválida'},3],[{description:''},3],[{},0]]) {
    const app=setup('civil');assert.equal((await app.post(request(overrides,count))).status,400);assert.equal(app.batches.length,0);assert.equal(app.uploaded.length,0);
  }
});
test('failed upload does not save a partial report',async()=>{
  const app=setup('civil',true);assert.equal((await app.post(request())).status,500);assert.equal(app.batches.length,0);assert.equal(app.removed.length,1);
});

test('reenvio idêntico em poucos minutos não cria outra OS e horário fora da janela não bloqueia',async()=>{
  const app=setup('civil');
  const early=await app.post(request({executionStartedAt:'2026-09-04T06:00',completedAt:'2026-09-04T06:10'}));assert.equal(early.status,201);
  globalThis.__dupOrder=true;try{const again=await app.post(request());assert.equal(again.status,409);assert.match((await again.json()).error,/APP-DUP/);}finally{globalThis.__dupOrder=false;}
});
