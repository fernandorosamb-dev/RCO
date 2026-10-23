import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/extension-source/popup.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',options:[],replaceChildren(){this.options=[]},append(o){this.options.push(o)}});return elements.get(id)};
 const timers=[];const data={audit:[{kind:'preservado'}],lastDiagnostic:{step:'Último passo'}};
 vm.runInNewContext(source,{document:{getElementById:get,createElement:()=>({})},chrome:{runtime:{getManifest:()=>({version:'2.1.71'}),sendMessage:()=>new Promise(()=>{})},storage:{local:{get:async()=>data}}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},console});
 return {get,timers};
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
test('startup and audit remain readable when worker messages never answer; queue timeout releases UI',async()=>{
 const {get,timers}=setup();await flush();assert.match(get('status').textContent,/2.1.71/);
 const query=get('load').onclick();await flush();assert.equal(get('status').textContent,'Executando...');
 const audit=get('diagnostic').onclick();await flush();assert.match(get('status').textContent,/preservado/);assert.match(get('status').textContent,/Último passo/);
 for(const fn of timers)fn();await query;await audit;assert.match(get('status').textContent,/10 segundos/);
 get('load').onclick();await flush();assert.equal(get('status').textContent,'Executando...');
});
