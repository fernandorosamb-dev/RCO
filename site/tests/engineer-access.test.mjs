import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const compile=file=>ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(file,mocks={}){
 const exports={};const unused=new Proxy({}, {get:()=>()=>{throw Error('Unexpected dependency use');}});
 vm.runInNewContext(compile(file),{exports,require:name=>mocks[name]||unused,Request,Response,URL,Date,crypto,console,TextEncoder,TextDecoder,btoa,atob,Uint8Array});return exports;
}
const access=load('app/access.ts');
test('named engineer login maps to separate role; generic engineer and supervisor aliases do not elevate',()=>{
 assert.equal(access.loginRole('Eng_Luis_Gimenes'),'engenheiro');assert.equal(access.loginRole('engenheiro'),null);assert.equal(access.loginRole('Eng_Luis_Gimenes_supervisor'),null);assert.equal(access.loginRole('supervisor'),'supervisor');assert.equal(access.loginRole(null),null);
});
function routeFiles(dir='app/api'){return readdirSync(new URL(dir+'/',root),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?routeFiles(dir+'/'+entry.name):entry.name==='route.ts'?[dir+'/'+entry.name]:[]);}
for(const file of routeFiles()){
 if(/auth\/(login|logout)\//.test(file))continue;
 const source=readFileSync(new URL(file,root),'utf8');
 const methods=[...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\(/g)].map(m=>m[1]);
 // Estas duas rotas aceitam o engenheiro apenas para registrar PEDIDOS ao supervisor (ver engineer-changes.test.mjs).
 const engineerRequestRoutes=['app/api/reports/proposals/route.ts','app/api/imas/batch-request/route.ts'];
 for(const method of methods.filter(m=>!(m==='POST'&&engineerRequestRoutes.includes(file))))test(`engineer denied ${method} ${file} before reading payload or changing records`,async()=>{
  const auth={getRole:async()=> 'engenheiro',requireRole:async allowed=>allowed.includes('engenheiro')?'engenheiro':null};
  const imports=[...source.matchAll(/from ["']([^"']+)["']/g)].map(m=>m[1]);
  const mocks=Object.fromEntries(imports.filter(n=>n.endsWith('/auth')).map(n=>[n,auth]));
  const endpoint=load(file,mocks);const request=new Request('https://test/api',{method});
  const response=await endpoint[method](request);assert.ok([401,403].includes(response.status),`Got ${response.status}`);
 });
}
test('engineer login sets engineer session and wrong password cannot establish one',async()=>{
 let signedRole=null,cookie=null;
 const endpoint=load('app/api/auth/login/route.ts',{'../../../access':access,'../../../auth':{createSession:async role=>{signedRole=role;return 'signed-engineer-token';}},'../../../passwords':{verifyRolePassword:async(role,password)=>role==='engenheiro'&&password==='fixture-only-password'},'next/headers':{cookies:async()=>({set:(...args)=>cookie=args})}});
 const req=password=>new Request('https://test/api/auth/login',{method:'POST',body:JSON.stringify({username:'Eng_Luis_Gimenes',password})});
 assert.equal((await endpoint.POST(req('wrong'))).status,401);assert.equal(cookie,null);
 const result=await endpoint.POST(req('fixture-only-password'));assert.equal(result.status,200);assert.equal((await result.json()).role,'engenheiro');assert.equal(signedRole,'engenheiro');assert.equal(cookie[2].httpOnly,true);
});
test('engineer report view uses all areas with same pending scope as supervisor',async()=>{
 const table={serviceReports:{createdAt:'createdAt'},reportPhotos:{createdAt:'createdAt',id:'id'},workOrders:{},imasAutomationRequests:{}};
 const rows=[{publicId:'civil',area:'civil',origin:'app',status:'Concluída',createdAt:new Date(),downloadedAt:null},{publicId:'electric',area:'eletrica',origin:'app',status:'Concluída',createdAt:new Date(),downloadedAt:null},{publicId:'deleted',status:'Excluída',createdAt:new Date()},{publicId:'done',status:'Concluída',createdAt:new Date(),downloadedAt:new Date()}];
 const db={select:()=>({from(t){const data=t===table.serviceReports?rows:[];return {orderBy:async()=>data,then:(resolve,reject)=>Promise.resolve(data).then(resolve,reject)};}})};
 const endpoint=load('app/api/reports/route.ts',{'../../auth':{requireRole:async allowed=>allowed.includes('engenheiro')?'engenheiro':null},'../../../db':{getDb:()=>db},'../../../db/schema':table,'drizzle-orm':{asc:v=>v,desc:v=>v,eq:()=>null}});
 const response=await endpoint.GET();assert.equal(response.status,200);assert.deepEqual((await response.json()).reports.map(r=>r.publicId),['civil','electric']);
});
