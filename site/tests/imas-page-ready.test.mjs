import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function imasDocumentReady('),source.indexOf('function syncObservationEditor('));
test('documento pronto aceita recursos pendentes, mas exige endereço atual correto e conteúdo',()=>{
 const context={URL,location:{href:'https://admin.rcoengenharia.com/login.php'},document:{readyState:'interactive',body:{children:[1]},querySelector:()=>null}};vm.createContext(context);vm.runInContext(code,context);
 assert.equal(vm.runInContext("imasDocumentReady('https://admin.rcoengenharia.com/login.php').ready",context),true);
 assert.equal(vm.runInContext("imasDocumentReady('https://admin.rcoengenharia.com/ordem_servico_form.php').ready",context),false);
 context.document.readyState='loading';assert.equal(vm.runInContext("imasDocumentReady(location.href).ready",context),false);
 context.document.readyState='complete';context.document.body.children=[];assert.equal(vm.runInContext("imasDocumentReady(location.href).ready",context),false);
});
test('aba que fica loading mas documento pronto prossegue sem reload ou clique',async()=>{
 let waits=0,probes=0;const c={URL,wait:async()=>waits++,audit:async()=>{},chrome:{tabs:{get:async()=>({status:'loading',url:'https://admin.rcoengenharia.com/'})},scripting:{executeScript:async()=>{probes++;return [{result:{ready:true}}];}}}};
 vm.createContext(c);vm.runInContext(code,c);await vm.runInContext('loaded(2)',c);assert.equal(waits,0);assert.equal(probes,1);
});
test('documento não pronto continua bloqueado; pendingUrl orienta a conferência',async()=>{
 const args=[];const c={URL,wait:async()=>{},audit:async()=>{},chrome:{tabs:{get:async()=>({status:'loading',url:'https://admin.rcoengenharia.com/',pendingUrl:'https://admin.rcoengenharia.com/login.php'})},scripting:{executeScript:async a=>{args.push(a.args[0]);return [{result:{ready:false}}];}}}};
 vm.createContext(c);vm.runInContext(code,c);await assert.rejects(vm.runInContext('loaded(2)',c),/não ficou pronto/);assert.equal(args.length,91);assert.ok(args.every(u=>u.endsWith('/login.php')));
});
test('aba complete ainda exige documento correto e acessível',async()=>{
 const c={wait:async()=>{},audit:async()=>{},chrome:{tabs:{get:async()=>({status:'complete',url:'https://admin.rcoengenharia.com/'})},scripting:{executeScript:async()=>[{result:{ready:true}}]}}};vm.createContext(c);vm.runInContext(code,c);await vm.runInContext('loaded(2)',c);
});
test('redirecionamento ao login e fragmento não causam falso timeout; outra OS continua bloqueada',()=>{
 const c={URL,location:{href:'https://admin.rcoengenharia.com/login.php'},document:{readyState:'interactive',body:{children:[1]},querySelector:()=>({})}};vm.createContext(c);vm.runInContext(code,c);assert.equal(vm.runInContext("imasDocumentReady('https://admin.rcoengenharia.com/').ready",c),true);c.location.href='https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323157#fotos';assert.equal(vm.runInContext("imasDocumentReady('https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323157').ready",c),true);assert.equal(vm.runInContext("imasDocumentReady('https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323081').ready",c),false);
});
test('erro de permissão fica explícito e auditado em vez de ser escondido como timeout',async()=>{
 const events=[];const c={wait:async()=>{},audit:async(k,d)=>events.push({k,d}),chrome:{tabs:{get:async()=>({status:'loading',url:'https://admin.rcoengenharia.com/'})},scripting:{executeScript:async()=>{throw Error('Cannot access contents of the page. Extension manifest must request permission');}}}};vm.createContext(c);vm.runInContext(code,c);await assert.rejects(vm.runInContext('loaded(2)',c),/Chrome bloqueou/);assert.match(events[0].d.reason,/permission/);
});
function recordingStart(tabs){
 const calls=[],state={};const c={URL,IMAS:'https://admin.rcoengenharia.com/',running:false,safeJob:j=>j,queue:async()=>({jobs:[{publicId:'next',externalNumber:'123456'}]}),crypto:{randomUUID:()=> 'rec'},Date,loaded:async id=>calls.push(['loaded',id]),audit:async()=>{},chrome:{runtime:{getManifest:()=>({version:'2.1.54'})},storage:{local:{get:async()=>state,set:async s=>Object.assign(state,s)}},tabs:{query:async()=>tabs,create:async o=>{calls.push(['create',o.url]);return {id:2};},update:async(id,o)=>calls.push(['activate',id,o.active])},scripting:{executeScript:async a=>calls.push(['inject',a.target.tabId])}}};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('async function imasTab('),source.indexOf('function imasDocumentReady('))+source.slice(source.indexOf('const finishedTestNumbers='),source.indexOf('async function saveRecordingEvent(')),c);
 return {state,calls,run:()=>vm.runInContext("startFinalRecording('next')",c)};
}
test('Gravar abre e ativa IMAS quando fechado, aguarda documento e instala observador',async()=>{const s=recordingStart([]);await s.run();assert.deepEqual(s.calls,[['create','https://admin.rcoengenharia.com/'],['activate',2,true],['loaded',2],['inject',2]]);assert.equal(s.state.finalRecording.tabId,2);});
test('Gravar reutiliza aba existente sem abrir duplicada; múltiplas abas continuam bloqueadas',async()=>{const s=recordingStart([{id:5}]);await s.run();assert.deepEqual(s.calls,[['activate',5,true],['loaded',5],['inject',5]]);const multiple=recordingStart([{id:5},{id:6}]);await assert.rejects(multiple.run(),/única aba/);assert.equal(multiple.calls.length,0);});
