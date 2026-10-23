import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
function setup({uploaded=true,success=true,persisted=true,number='123456',failure=false,automaticUpload=false}={}){
 const job={publicId:'close1',reference:'APP-close1',phase:'encerrar',ready:true,externalNumber:number,report:{observations:'Serviço feito',photos:[{url:'/api/photos/a'}]}};const state={pending:{publicId:job.publicId,phase:'encerrar',tabId:2,audit:{ok:true},job}},ops=[],clicked=[],downloads=[];let listener;const event={addListener(){}};
 const chrome={runtime:{id:'ext',getManifest:()=>({version:'new'}),onMessage:{addListener(f){listener=f}},onInstalled:event,onStartup:event},alarms:{onAlarm:event,async get(){},async clear(){},async create(){}},storage:{local:{async get(k){return Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,state[x]]))},async set(v){Object.assign(state,structuredClone(v))},async remove(k){delete state[k]}}},tabs:{async get(){return {id:2,url:`https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=${number}`,status:'complete'}},async query(){return [{id:1,url:'https://rco-manutencao.fernandorosa-mb.chatgpt.site/'}]},async reload(){ops.push('reload')},async sendMessage(id,m){if(m.action==='fila')return {data:{jobs:[job]}};if(m.action==='baixar')downloads.push(m);return {data:{received:true}}}},scripting:{async executeScript(a){if(a.func?.name==='imasDocumentReady')return [{result:{ready:true}}];if(a.files)return [];if(a.world==='MAIN'){if(a.func.name==='func')return [{result:0}];if(a.func.name==='notifyClosingPhotos'){ops.push('notify-photo');return [{result:{notified:true,automaticUpload}}];}if(['clickClosingTarget','clickCreationSave'].includes(a.func.name)){clicked.push(a.args[0]);return [{result:{clicked:true}}]}if(['confirmCreationSuccess','confirmClosingSuccess'].includes(a.func.name))return [{result:{clicked:success}}];return [{result:{}}]};const op=a.args[0],payload=a.args[1];ops.push(op);let data={};if(op==='audit')data={ok:payload.verifyUploaded?persisted:!failure,errors:['observation']};if(op==='closingSelection')data={selector:'#file1',before:0,count:job.report.photos.length};if(op==='closingTarget')data={selector:payload.operation,before:0};if(op==='linkedPhotos')data={count:uploaded?1:0};return [{result:{data}}]}}};
 const context={chrome,URL,Date,crypto:webcrypto,setTimeout:f=>setTimeout(f,0),safeJob:j=>j,nextSlot:()=>0,installedUpdate:async()=>({reload:false})};vm.createContext(context);vm.runInContext(readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);return {context,state,ops,clicked,downloads,call:()=>new Promise(r=>listener({action:'close-save',publicId:job.publicId},{id:'ext'},r))};
}
test('encerra somente após envio, OK e releitura; baixa com número oficial e bloqueia repetição',async()=>{const s=setup();assert.match((await s.call()).message,/Baixa registrada/);assert.deepEqual(s.clicked,['upload','save']);assert.equal(s.downloads[0].osNumber,'123456');assert.ok(s.ops.indexOf('reload')<s.ops.lastIndexOf('audit'));assert.equal(s.state.pending,undefined);assert.match((await s.call()).error,/não repetirá/);assert.equal(s.clicked.length,2)});
test('upload sem confirmação não salva nem marca baixa',async()=>{const s=setup({uploaded:false});assert.match((await s.call()).error,/não confirmou/);assert.deepEqual(s.clicked,['upload']);assert.equal(s.downloads.length,0)});
test('Salvar sem OK ou dados persistidos divergentes não marca baixa',async()=>{for(const options of [{success:false},{persisted:false}]){const s=setup(options);assert.ok((await s.call()).error);assert.equal(s.downloads.length,0)}});
test('OS 323902 protegida não recebe clique nem alteração',async()=>{const s=setup({number:'323902'});assert.match((await s.call()).error,/protegida/);assert.equal(s.clicked.length,0);assert.equal(s.ops.length,0)});
test('dados alterados após preparo não enviam fotos',async()=>{const s=setup({failure:true});assert.match((await s.call()).error,/mudaram/);assert.equal(s.clicked.length,0)});
test('ordem das propriedades do Chrome e alteração do nome do arquivo não simulam troca de foto',async()=>{
 const s=setup();Object.assign(s.state.pending.job.report.photos[0],{publicId:'photo-a',fileName:'antes.jpg'});s.state.pending.job=structuredClone(s.state.pending.job);s.state.pending.job.report.photos[0]={fileName:'renomeado.jpg',publicId:'photo-a',url:'/api/photos/a'};assert.match((await s.call()).message,/Baixa registrada/);assert.deepEqual(s.clicked,['upload','save']);
});
test('troca real de foto bloqueia antes do envio',async()=>{
 for(const replacement of [{url:'/api/photos/b'},{url:'/api/photos/a',publicId:'outra'}]){const s=setup();s.state.pending.job=structuredClone(s.state.pending.job);s.state.pending.job.report.photos[0]=replacement;assert.match((await s.call()).error,/As fotos mudaram/);assert.equal(s.clicked.length,0);assert.equal(s.downloads.length,0);}
});
test('mudança na ordem das evidências continua exigindo novo preparo',async()=>{
 const s=setup();s.state.pending.job.report.photos.push({url:'/api/photos/b'});s.state.pending.job=structuredClone(s.state.pending.job);s.state.pending.job.report.photos.reverse();assert.match((await s.call()).error,/As fotos mudaram/);assert.equal(s.clicked.length,0);
});
test('retomada local autorizada só executa a 323930 e não se repete',async()=>{
 const s=setup({number:'323930'}),id='3bddfdcd-3e60-4b44-b630-698fd364fbab';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.lastDiagnostic={runId:'ad2de5c5-e361-4df1-90dd-19c7c9de05ba',state:'failed',step:'Localizar Enviar arquivos'};s.context.chrome.tabs.query=async({url})=>String(url).includes('admin.')?[{id:2,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323930'}]:[{id:1,url:'https://rco-manutencao.fernandorosa-mb.chatgpt.site/'}];
 await vm.runInContext('resumeLocalUploadTest()',s.context);assert.deepEqual(s.clicked,['upload','save']);assert.equal(s.downloads.length,1);await vm.runInContext('resumeLocalUploadTest()',s.context);assert.equal(s.clicked.length,2);
});
test('retomada local não navega nem executa OS diferente ou envio já tentado',async()=>{
 for(const block of ['outra-aba','tentado']){const s=setup({number:'323930'}),id='3bddfdcd-3e60-4b44-b630-698fd364fbab';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.lastDiagnostic={runId:'ad2de5c5-e361-4df1-90dd-19c7c9de05ba',state:'failed',step:'Localizar Enviar arquivos'};if(block==='tentado')s.state.closeAttempts={[id]:{step:'upload'}};s.context.chrome.tabs.query=async()=>[{id:2,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323902'}];await vm.runInContext('resumeLocalUploadTest()',s.context);assert.equal(s.clicked.length,0);assert.equal(s.downloads.length,0);}
});

test('notifica a seleção antes de localizar Enviar arquivos e não duplica envio iniciado pelo componente',async()=>{
 const normal=setup();await normal.call();assert.ok(normal.ops.indexOf('closingSelection')<normal.ops.indexOf('closingTarget'));
 const auto=setup({automaticUpload:true});assert.match((await auto.call()).message,/Baixa registrada/);assert.deepEqual(auto.clicked,['save']);
});
test('notificação valida a OS, o campo, o contador e dispara change uma única vez',()=>{
 const s=setup(),events=[];let linked=0;const section={get textContent(){return `Esta O.S tem (${linked}) fotos vinculadas`;},querySelectorAll:()=>[input]};
 const input={type:'file',disabled:false,files:[{}],closest:()=>section,dispatchEvent:e=>events.push(e.type)};
 Object.assign(s.context,{location:{origin:'https://admin.rcoengenharia.com',pathname:'/ordem_servico_form.php',href:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323162'},window:{jQuery:{active:0}},document:{querySelectorAll:()=>[input]},Event:class{constructor(type){this.type=type;}}});
 const invoke=number=>vm.runInContext(`notifyClosingPhotos('#file1','${number}',1)`,s.context);
 assert.ok(invoke('323902').error);assert.equal(events.length,0);linked=4;assert.ok(invoke('323162').error);assert.equal(events.length,0);linked=0;assert.equal(invoke('323162').notified,true);assert.deepEqual(events,['input','change']);
});

test('recupera somente a falha da 323162 anterior ao clique e preserva bloqueios de envios reais',async()=>{
 const id='f5c0b70b-abee-41a3-a280-f84e19de1ec5';
 for(const actualClick of [false,true]){const s=setup({number:'323162'});s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.closeAttempts={[id]:{step:'upload'}};s.state.lastDiagnostic={runId:'476319f1-568f-46fb-be62-6acddbc4ddac',state:'failed',step:'Localizar Enviar arquivos',events:[{step:'Notificar seleção de fotos ao IMAS',status:'ok'},...(actualClick?[{step:'Enviar arquivos clicado',status:'ok'}]:[])]};
 const result=await vm.runInContext(`closeAndSave('${id}')`,s.context).catch(e=>({error:e.message}));
 if(actualClick){assert.match(result.error,/não repetirá/);assert.equal(s.clicked.length,0)}else{assert.match(result.message,/Baixa registrada/);assert.deepEqual(s.clicked,['upload','save']);}
 }
});

test('retomada da seção preserva o preparo da 323162, não notifica as fotos de novo e só roda uma vez',async()=>{
 const s=setup({number:'323162'}),id='f5c0b70b-abee-41a3-a280-f84e19de1ec5';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.closeAttempts={[id]:{step:'upload'}};s.state.lastDiagnostic={runId:'476319f1-568f-46fb-be62-6acddbc4ddac',state:'failed',step:'Localizar Enviar arquivos',events:[{step:'Notificar seleção de fotos ao IMAS',status:'ok'}]};s.context.chrome.tabs.query=async({url})=>String(url).includes('admin.')?[{id:2,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323162'}]:[{id:1,url:'https://rco-manutencao.fernandorosa-mb.chatgpt.site/'}];
 await vm.runInContext('resume323162PhotoSection()',s.context);assert.deepEqual(s.clicked,['upload','save']);assert.equal(s.ops.includes('notify-photo'),false);assert.equal(s.downloads.length,1);await vm.runInContext('resume323162PhotoSection()',s.context);assert.equal(s.clicked.length,2);
});


test('falha anterior ao fluxo de envio entra na auditoria atual sem clicar',async()=>{
 const s=setup();s.state.closeAttempts={[s.state.pending.publicId]:{step:'upload'}};const r=await s.call();assert.ok(r.error);assert.equal(s.clicked.length,0);assert.equal(s.state.lastDiagnostic.state,'failed');assert.equal(s.state.lastDiagnostic.step,'Conferir encerramento antes do envio');assert.equal(s.state.lastDiagnostic.version,'new');
});

test('retomada da aba executa apenas 323140 e uma única vez',async()=>{
 const s=setup({number:'323140'}),id='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.closeAttempts={[id]:{step:'upload'}};s.state.lastDiagnostic={runId:'a8d3e15e-f407-47f8-993f-244eeb46b43b',state:'failed',step:'Aguardar fotos vinculadas'};
 s.context.chrome.tabs.query=async({url})=>String(url).includes('admin.')?[{id:2,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140'}]:[{id:1,url:'https://rco-manutencao.fernandorosa-mb.chatgpt.site/'}];
 await vm.runInContext('resume323140TabTest()',s.context);assert.deepEqual(s.clicked,['save']);assert.equal(s.downloads.length,1);await vm.runInContext('resume323140TabTest()',s.context);assert.equal(s.clicked.length,1);
});
test('teste automático recusa outra aba e grava erro da conferência sem reenviar',async()=>{
 for(const mode of ['aba','fotos']){const s=setup({number:'323140'}),id='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.closeAttempts={[id]:{step:'upload'}};s.state.lastDiagnostic={runId:'a8d3e15e-f407-47f8-993f-244eeb46b43b',state:'failed',step:'Aguardar fotos vinculadas'};
 s.context.chrome.tabs.query=async()=>[{id:2,url:`https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=${mode==='aba'?'323080':'323140'}`}];
 if(mode==='fotos')vm.runInContext("engine=async()=>{throw Error('Esta OS já possui fotos vinculadas. Nada foi reenviado.');}",s.context);
 await vm.runInContext('resume323140TabTest()',s.context);assert.equal(s.clicked.length,0);assert.equal(s.downloads.length,0);if(mode==='fotos')assert.equal(s.state.lastDiagnostic.step,'Conferir encerramento antes do envio');else assert.equal(s.state.tabRecovery323140,undefined);
 }
});


test('reconecta a aba fechada pelo número oficial e salva sem reenviar fotos existentes',async()=>{
 const s=setup({number:'323140'}),id='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484';s.state.pending.publicId=id;s.state.pending.job.publicId=id;s.state.closeAttempts={[id]:{step:'upload'}};
 s.context.chrome.tabs.get=async tabId=>{if(tabId===2)throw Error('No tab with id: 2');return {id:22,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140',status:'complete'};};
 s.context.chrome.tabs.query=async({url})=>String(url).includes('admin.')?[{id:22,url:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140'}]:[{id:1,url:'https://rco-manutencao.fernandorosa-mb.chatgpt.site/'}];
 vm.runInContext('openForm=async()=>{}',s.context);assert.match((await s.call()).message,/Baixa registrada/);assert.deepEqual(s.clicked,['save']);assert.equal(s.ops.includes('notify-photo'),false);assert.equal(s.downloads.length,1);
});
