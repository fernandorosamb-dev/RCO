import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8');
function enterSetup({visible=true,remains=false,wrongAfterAttach=false}={}){
 let attached=false;const calls=[];
 const chrome={scripting:{async executeScript({args}){return [{result:['enter','reserve-enter'].includes(args?.[1])?{enterRequired:visible&&!(attached&&wrongAfterAttach)}:{clicked:true}}];}},debugger:{async attach(){attached=true;calls.push('attach');},async sendCommand(target,method,args){calls.push(args.type);if(args.type==='keyUp'&&!remains)visible=false;},async detach(){calls.push('detach');}}};
 const c={manualFinalConfirmation:async()=>null,chrome,wait:async()=>{},trace:async()=>{},audit:async()=>{},activeRun:{publicId:'test'}};vm.createContext(c);vm.runInContext(src.slice(src.indexOf('function confirmCreationSuccess('),src.indexOf('async function createAndSave(')),c);
 return {calls,run:()=>vm.runInContext("acknowledgeSuccess(2,'123456')",c)};
}
test('Enter real é enviado somente se o OK continua aberto e confirma fechamento',async()=>{const s=enterSetup();assert.equal((await s.run()).result.clicked,true);assert.deepEqual(s.calls,['attach','keyDown','keyUp','detach']);});
test('não envia Enter se o clique já fechou ou se a janela mudou após conectar',async()=>{const a=enterSetup({visible:false});await a.run();assert.deepEqual(a.calls,[]);const b=enterSetup({wrongAfterAttach:true});await b.run();assert.deepEqual(b.calls,['attach','detach']);});
test('janela que continua aberta não é tratada como confirmação',async()=>{const s=enterSetup({remains:true});await assert.rejects(s.run(),/continua aberta/);assert.deepEqual(s.calls,['attach','keyDown','keyUp','detach']);});
function completeSetup({creationFails=false,recoverNavigation=false,uploadAttempted=false}={}){
 const id='d6dcc54e-0d1c-4fc6-9372-5862941c0dba',state={},calls=[];let phase=recoverNavigation?'encerrar':'criar';
 if(recoverNavigation){state.completeD6Test={publicId:id,state:'failed',message:'Há outro formulário de OS aberto. Termine ou descarte essa edição antes do teste.'};state.saveAttempts={[id]:{at:'saved'}};if(uploadAttempted)state.closeAttempts={[id]:{step:'upload'}};}
 const c={running:false,chrome:{storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,state[k]]));},async set(v){Object.assign(state,v);},async remove(k){delete state[k];}}}},safeJob:j=>j,queue:async()=>({jobs:[{publicId:id,phase,externalNumber:phase==='encerrar'?(recoverNavigation?'323963':'123456'):null}]}),createAndSave:async()=>{calls.push('create');if(creationFails)throw Error('OK não confirmado');phase='encerrar';state.pending={publicId:id,phase:'criar',successAcknowledged:true,externalNumber:'123456'};},closeAndSave:async()=>{assert.equal(state.pending,undefined);calls.push('close');return {message:'baixada'};},audit:async()=>{}};
 vm.createContext(c);vm.runInContext(src.slice(src.indexOf('let completeTestRunning='),src.indexOf('chrome.runtime.onMessage.addListener(')),c);return {state,calls,run:(target=id)=>vm.runInContext(`completeAuthorizedTest('${target}')`,c)};
}
test('teste único cria, vincula número e só então encerra a OS autorizada',async()=>{const s=completeSetup();assert.equal((await s.run()).message,'baixada');assert.deepEqual(s.calls,['create','close']);assert.equal(s.state.completeD6Test.osNumber,'123456');await assert.rejects(s.run(),/já foi iniciado/);assert.deepEqual(s.calls,['create','close']);});
test('falha na criação impede envio, encerramento e repetição; outra OS não participa',async()=>{const s=completeSetup({creationFails:true});await assert.rejects(s.run(),/OK não confirmado/);await assert.rejects(s.run(),/já foi iniciado/);assert.deepEqual(s.calls,['create']);const other=completeSetup();await assert.rejects(other.run('other'),/não autorizado/);assert.deepEqual(other.calls,[]);});
test('retoma somente a falha de navegação após criar 323963, sem recriar e sem repetir envio',async()=>{const s=completeSetup({recoverNavigation:true});await s.run();assert.deepEqual(s.calls,['close']);assert.equal(s.state.navigationRecoveryD6.osNumber,'323963');await assert.rejects(s.run(),/já foi iniciado/);const blocked=completeSetup({recoverNavigation:true,uploadAttempted:true});await assert.rejects(blocked.run(),/já foi iniciado/);assert.deepEqual(blocked.calls,[]);});
