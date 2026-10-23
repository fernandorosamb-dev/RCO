import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync(new URL('../app/ImasPanel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
for(const scenario of ['approved','denied','engineer','returned'])test(`approval transition: ${scenario}`,async()=>{
 const events=[],calls=[],messages=[];const exports={};const jsx=(type,props)=>({type,props});
 const react={useEffect(){},useState:v=>[v,value=>messages.push(value)]};
 class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail;}}
 let saved=0;
 vm.runInNewContext(source,{exports,CustomEvent,window:{dispatchEvent:e=>events.push(e.type)},document:{dispatchEvent:e=>events.push(e.type)},fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:scenario!=='denied',json:async()=>scenario==='denied'?{error:'Dados mudaram'}:{queued:true,requestId:'rq'}};},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='./supervisor-holds'?{requiresSupervisorReview:()=>false}:name==='./imas-jobs'?{imasJob:()=>({externalNumber:'323200'})}:name==='./imas-approval'?{approvalFingerprint:async()=> 'fp'}:{default:name}});
 const tree=exports.default({report:{publicId:'report-1',photos:[{publicId:'p1'}],osNumber:'323200',status:scenario==='returned'?'Devolvida':'Concluída'},onSaved:async()=>{saved++;},mode:scenario==='engineer'?'engineer':'supervisor'});
 const approve=nodes(tree).find(n=>n.type==='button'&&n.props.children==='Aprovar');assert.ok(approve);assert.equal(approve.props.disabled,false);
 approve.props.onClick();await new Promise(r=>setImmediate(r));
 if(scenario==='approved'||scenario==='returned'){assert.deepEqual(events,['rco-report-queued','rco-imas-approved']);assert.equal(calls[0].url,'/api/imas/approve');assert.equal(saved,1);}
 if(scenario==='denied'){assert.deepEqual(events,[]);assert.equal(saved,0);assert.ok(messages.includes('Dados mudaram'));}
 if(scenario==='engineer'){assert.deepEqual(events,[]);assert.equal(calls[0].url,'/api/reports/proposals');assert.equal(calls[0].body.action,'approve');}
});
