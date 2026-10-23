import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import vm from 'node:vm';
const root=new URL('../',import.meta.url);
test('published worker starts as a standalone classic script and registers wakeup handlers',async()=>{
 const source=readFileSync(new URL('public/extension-source/background.js',root),'utf8'),manifest=JSON.parse(readFileSync(new URL('public/extension-source/manifest.json',root),'utf8'));
 assert.equal(manifest.background.type,undefined);assert.doesNotMatch(source,/^import |^export /m);
 const events={},alarms=new Map(),data={};const listener=name=>({addListener:handler=>events[name]=handler});
 const chrome={alarms:{onAlarm:listener('alarm'),get:async name=>alarms.get(name),clear:async name=>alarms.delete(name),create:async(name,value)=>alarms.set(name,value)},runtime:{onInstalled:listener('installed'),onStartup:listener('startup'),onMessage:listener('message'),getManifest:()=>manifest},storage:{local:{get:async()=>({...data}),set:async value=>Object.assign(data,value),remove:async()=>{}}},tabs:{query:async()=>[]}};
 new vm.Script(source).runInNewContext({chrome,Date,Intl,URL,Set,Map,Promise,setTimeout,clearTimeout,console,crypto,TextEncoder});
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(typeof events.message,'function');assert.equal(typeof events.alarm,'function');assert.equal(typeof events.startup,'function');assert.ok(alarms.has('rco-intake'));assert.ok(alarms.has('rco-source-update'));assert.ok(alarms.has('rco-imas'));
 const release=JSON.parse(readFileSync(new URL('public/extension-release.json',root),'utf8')),worker=release.files.find(f=>f.name==='background.js');assert.equal(worker.size,Buffer.byteLength(source));assert.equal(worker.sha256,createHash('sha256').update(source).digest('hex'));
 const original=readFileSync(new URL('tools/imas-extension/background.js',root),'utf8');assert.ok(source.endsWith(original.split('\n').slice(2).join('\n')),'Operational worker body must be preserved verbatim');
});

test('new entrypoint records an import failure and responds instead of leaving the popup hanging',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('public/extension-source/manifest.json',root),'utf8'));
 assert.equal(manifest.background.service_worker,'schedule.js');
 const listeners=[],data={};const chrome={runtime:{id:'rco',getManifest:()=>manifest,onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{set:async value=>Object.assign(data,value)}}};
 new vm.Script(readFileSync(new URL('public/extension-source/schedule.js',root),'utf8')).runInNewContext({chrome,Date,importScripts(){throw Error('falha de importação simulada')}});
 assert.equal(data.workerStartup.state,'failed');assert.equal(data.workerStartup.version,manifest.version);
 let response;listeners[0]({action:'queue'},{id:'rco'},r=>response=r);assert.match(response.error,/falha de importação simulada/);
 response=null;listeners[0]({action:'queue'},{id:'outro'},r=>response=r);assert.equal(response,null);
});
test('bootstrap records ready only after importing the bundled worker and lets it answer normally',()=>{
 const listeners=[],data={};let imported='';const chrome={runtime:{id:'rco',getManifest:()=>({version:'2.1.72'}),onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{set:async value=>Object.assign(data,value)}}};
 new vm.Script(readFileSync(new URL('public/extension-source/schedule.js',root),'utf8')).runInNewContext({chrome,Date,importScripts(name){imported=name}});
 assert.equal(imported,'background.js');assert.equal(data.workerStartup.state,'ready');let response;listeners[0]({action:'status'},{id:'rco'},r=>response=r);assert.equal(response,undefined);
});
