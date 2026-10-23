import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8');
function setup({active=true,tabId=2,publicId='next',open=false,recorded=[],expectedNumber='123456'}={}){
 const state={finalRecording:{active,runId:'rec',tabId,publicId,expectedNumber,recorded,events:[],controls:[]}},calls=[];
 const chrome={storage:{local:{async get(k){return Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,state[x]]));},async set(v){Object.assign(state,structuredClone(v));}}},scripting:{async executeScript(){calls.push('observe');return [{result:{open}}];}}};
 const c={chrome,Date,crypto:{randomUUID:()=> 'rec'},activeRun:{publicId:'next'},running:false,IMAS:'https://admin.rcoengenharia.com/',safeJob:x=>x,queue:async()=>({jobs:[{publicId:'next',externalNumber:expectedNumber}]}),rcoTab:async()=>({id:1}),message:async()=>({received:true}),audit:async()=>{calls.push('audit');},trace:async()=>{},wait:async()=>{},confirmCreationSuccess(){}};
 vm.createContext(c);vm.runInContext(src.slice(src.indexOf('let recordingWrites='),src.indexOf('chrome.runtime.onMessage.addListener(')),c);
 return {c,state,calls,run:(number='123456')=>vm.runInContext(`manualFinalConfirmation(2,'${number}')`,c),event:e=>vm.runInContext('saveRecordingEvent(payload,sender)',Object.assign(c,{payload:{runId:'rec',event:e},sender:{tab:{id:2}}}))};
}
const events=[{kind:'salvar',at:'2026-10-07T13:00:00Z',osNumber:'123456',trusted:false},{kind:'ok',at:'2026-10-07T13:00:01Z',osNumber:'123456',trusted:true},{kind:'ok-fechado',at:'2026-10-07T13:00:02Z',osNumber:'123456',trusted:true}];
test('OK manual exige Salvar, gesto humano e fechamento; não repete confirmação já consumida',async()=>{const s=setup({recorded:events});assert.equal((await s.run()).result.clicked,true);assert.equal(s.state.finalRecording.consumedAt,events[2].at);assert.equal((await s.run()).result.clicked,false);assert.deepEqual(s.calls,['observe','audit','observe']);});
test('modo normal mantém confirmação automática; gravação recusa outra aba/OS',async()=>{const normal=setup({active:false});assert.equal(await normal.run(),null);for(const opts of [{tabId:7},{publicId:'other'}]){const s=setup(opts);await assert.rejects(s.run(),/outra aba ou OS/);assert.deepEqual(s.calls,[]);}});
test('OK sintético, ausência de Salvar e número divergente não confirmam baixa',async()=>{for(const recorded of [events.map(e=>({...e,trusted:false})),events.slice(1),events.map(e=>({...e,osNumber:'654321'}))]){const s=setup({recorded});assert.equal((await s.run()).result.clicked,false);}});
test('registra apenas metadados finais e coordenadas, sem valores de formulário',async()=>{const s=setup();await s.event({kind:'ok',osNumber:'123456',trusted:true,selector:'#ok',tag:'BUTTON',point:{x:100,y:200,cx:110,cy:210,w:50,h:30},viewport:{w:1200,h:800,dpr:1,sx:0,sy:100},password:'secret',observation:'private'});const r=s.state.finalRecording.recorded[0];assert.equal(r.point.x,100);assert.equal(r.selector,'#ok');assert.equal(r.password,undefined);assert.equal(r.observation,undefined);assert.equal(s.state.finalRecording.controls[0].type,'button');});
test('outra OS, evento genérico e remetente de outra aba não entram na gravação',async()=>{const s=setup();await s.event({kind:'ok',osNumber:'654321'});await s.event({kind:'input',osNumber:'123456'});s.c.payload={runId:'rec',event:{kind:'ok',osNumber:'123456'}};s.c.sender={tab:{id:9}};await vm.runInContext('saveRecordingEvent(payload,sender)',s.c);assert.equal(s.state.finalRecording.recorded.length,0);});
test('observador captura clique manual e desaparecimento do OK sem tocar o formulário',async()=>{
 const source=readFileSync(new URL('../tools/imas-extension/imas.js',import.meta.url),'utf8').split('// DOM adapter:')[0];
 const sent=[],listeners={};let mutate;
 const panel={tagName:'DIV',innerText:'Sucesso Registro gravado!',parentElement:null,offsetWidth:100};
 const button={id:'ok',tagName:'BUTTON',innerText:'OK',parentElement:panel,offsetWidth:30,isConnected:true,disabled:false,closest:()=>button,getBoundingClientRect:()=>({x:100,y:200,width:30,height:20})};
 const document={addEventListener:(kind,fn)=>listeners[kind]=fn,querySelectorAll:()=>[button],getElementById:()=>null,activeElement:button};
 const c={document,location:{href:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=123456',pathname:'/ordem_servico_form.php'},URL,CSS:{escape:s=>s},MutationObserver:class{constructor(fn){mutate=fn;}observe(){}},chrome:{storage:{local:{get:async()=>({finalRecording:{active:true,runId:'rec'}})},onChanged:{addListener(){}}},runtime:{sendMessage:async m=>sent.push(m)}},innerWidth:1200,innerHeight:800,devicePixelRatio:1,scrollX:0,scrollY:100};
 vm.createContext(c);vm.runInContext(source,c);await Promise.resolve();
 listeners.click({target:button,isTrusted:true,clientX:111,clientY:211,type:'click'});
 button.isConnected=false;mutate();
 assert.deepEqual(sent.map(x=>x.event.kind),['ok','ok-fechado']);assert.equal(sent[0].event.point.x,111);assert.equal(sent[0].event.selector,'#ok');
 assert.equal(button.offsetWidth,30);assert.equal(button.innerText,'OK');
});
