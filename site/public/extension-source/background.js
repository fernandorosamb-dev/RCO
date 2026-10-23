// RCO worker: standalone bundle
function nextSlot(now=new Date()) {
  // Fixed São Paulo wall clock: first run today, then Monday-Friday at 07:00.
  const first=new Date('2026-10-08T15:45:00-03:00');
  if(now<first)return first.getTime();
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const base=new Date(`${date}T00:00:00Z`);
  for(let offset=0;offset<8;offset++){
    const day=new Date(base.getTime()+offset*86400000),weekday=day.getUTCDay();
    if(weekday===0||weekday===6)continue;
    const slot=new Date(`${day.toISOString().slice(0,10)}T07:00:00-03:00`);
    if(slot>now&&slot>first)return slot.getTime();
  }
  throw Error('Não foi possível definir a próxima execução.');
}
function safeJob(job) {
  if(job?.externalNumber==='323902'||job?.publicId==='4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1')throw Error('OS 323902 protegida pelo supervisor.');
  if(!job||!job.ready||job.errors?.length)throw Error('Corrija os campos pendentes da OS no app.');
  if(job.saveAllowed!==false||job.photoUploadAllowed!==false||job.mode!=='validation')throw Error('Este pacote aceita apenas modo de validação.');
  if(!['criar','encerrar'].includes(job.phase))throw Error('Etapa inválida.');
  if(job.phase==='criar'&&job.externalNumber)throw Error('OS já vinculada. Não criar novamente.');
  if(job.phase==='encerrar'&&!/^\d+$/.test(job.externalNumber||''))throw Error('Vincule o número do IMAS antes de encerrar.');
  return job;
}

// Reads installed files only. The Windows updater owns authenticated HTTPS downloads
// and verified directory replacement; this module never evaluates remote JavaScript.
async function installedUpdate({read,hash,currentVersion,pending,running}) {
  if(pending||running)return {reload:false,reason:'aguardando revisão da OS'};
  let state;try{state=await read('update-state.json');}catch{return {reload:false,reason:'pasta sem atualizador local'};}
  if(!state||state.mode!=='validation'||state.saveAllowed!==false)return {reload:false,reason:'modo não aprovado'};
  if(state.version===currentVersion)return {reload:false,reason:'versão atual'};
  if(!/^\d+\.\d+\.\d+$/.test(state.version||'')||!/^[a-f0-9]{64}$/.test(state.manifestHash||''))return {reload:false,reason:'identificação inválida'};
  const current=currentVersion.split('.').map(Number),next=state.version.split('.').map(Number);
  const greater=next.some((n,i)=>n!==current[i]&&next.slice(0,i).every((v,j)=>v===current[j])&&n>current[i]);
  if(!greater)return {reload:false,reason:'versão anterior'};
  const manifestText=await read('manifest.json',true),manifest=JSON.parse(manifestText);
  if(manifest.version!==state.version||await hash(manifestText)!==state.manifestHash)return {reload:false,reason:'arquivos em atualização'};
  return {reload:true,version:state.version,reason:'arquivos locais verificados'};
}

const RCO='https://rco-manutencao.fernandorosa-mb.chatgpt.site/';
const IMAS='https://admin.rcoengenharia.com/';
let running=false,activeRun=null,lastDiagnosticSync=0;
async function syncDiagnostic(force=false){
  if(!activeRun||(!force&&Date.now()-lastDiagnosticSync<2500))return;
  lastDiagnosticSync=Date.now();
  try{await message(await rcoTab(),{action:'diagnostic',run:activeRun});await chrome.storage.local.set({diagnosticSync:'enviado ao app'});}catch{await chrome.storage.local.set({diagnosticSync:'pendente — diagnóstico preservado nesta extensão'});}
}
async function trace(step,status='running',extra={}){
  if(!activeRun)return;
  const previous=activeRun.events.at(-1);if(previous?.status==='running')previous.status=status==='failed'?'failed':'ok';
  activeRun.step=step;activeRun.events.push({at:new Date().toISOString(),step,status,...extra});activeRun.events=activeRun.events.slice(-200);
  await chrome.storage.local.set({lastDiagnostic:activeRun});await syncDiagnostic();
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function audit(kind,data={}){const {audit=[]}=await chrome.storage.local.get('audit');await chrome.storage.local.set({audit:[...audit,{at:new Date().toISOString(),kind,...data}].slice(-100)});}
async function rcoTab(){const tabs=await chrome.tabs.query({url:RCO+'*'});if(!tabs.length)throw Error('Abra o RCO e entre como Supervisor.');return tabs[0];}
async function message(tab,body){
  let result;
  try{result=await chrome.tabs.sendMessage(tab.id,body);}catch(e){
    if(!/Receiving end does not exist|Could not establish connection/i.test(e.message))throw e;
    const current=await chrome.tabs.get(tab.id);
    if(!current.url?.startsWith(RCO))throw Error('A aba do RCO foi fechada ou mudou de endereço.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['rco.js']});
    await audit('reconexao-rco',{message:'Comunicação com a aba restabelecida; página preservada.'});
    try{result=await chrome.tabs.sendMessage(tab.id,body);}catch{throw Error('Não foi possível reconectar à aba RCO. Abra a extensão novamente e consulte a fila.');}
  }
  if(result?.error)throw Error(result.error);if(!result||!('data'in result))throw Error('A aba RCO não respondeu à extensão.');return result.data;
}
async function queue(){return message(await rcoTab(),{action:'fila'});}
async function imasTab(){const tabs=await chrome.tabs.query({url:IMAS+'*'});if(!tabs.length)return chrome.tabs.create({url:IMAS,active:true});if(tabs.length!==1)throw Error('Mantenha uma única aba do IMAS aberta para o teste.');return tabs[0];}
function imasDocumentReady(expectedUrl){
 try{
  const expected=new URL(expectedUrl),actual=new URL(location.href);
  const samePage=actual.origin===expected.origin&&actual.pathname===expected.pathname&&actual.search===expected.search;
  const loginRedirect=actual.pathname==='/login.php'&&!!document.querySelector('#login');
  return {ready:expected.origin==='https://admin.rcoengenharia.com'&&actual.origin===expected.origin&&(samePage||loginRedirect)&&['interactive','complete'].includes(document.readyState)&&!!document.body?.children.length,path:actual.pathname,readyState:document.readyState};
 }catch{return {ready:false};}
}
async function loaded(id){
 let lastError='',lastProbe=null;
 const documentReady=async tab=>{try{const [r]=await chrome.scripting.executeScript({target:{tabId:id},func:imasDocumentReady,args:[tab.pendingUrl||tab.url]});lastProbe=r?.result;lastError='';return lastProbe?.ready===true;}catch(e){lastError=String(e.message||e).slice(0,200);return false;}};
 for(let i=0;i<360;i++){
  const t=await chrome.tabs.get(id);
  // Do not wait for images/background requests after the actual document is ready.
  if((i%4===0||t.status==='complete')&&await documentReady(t))return;
  await wait(250);
 }
 const t=await chrome.tabs.get(id);if(await documentReady(t))return;
 await audit('imas-espera-falhou',{tabId:id,path:lastProbe?.path||'',readyState:lastProbe?.readyState||'',reason:lastError||'Documento ainda não disponível'});
 if(/permission|cannot access|not allowed/i.test(lastError))throw Error('O Chrome bloqueou o acesso à página do IMAS. Confira Acesso a sites na extensão e recarregue a página. Detalhe: '+lastError);
 throw Error('O documento do IMAS não ficou pronto em 90 segundos. Nenhum clique foi executado nesta espera.'+(lastError?' Detalhe: '+lastError:''));
}
function syncObservationEditor(value){
  if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')throw Error('Editor fora do formulário IMAS.');
  const textarea=document.getElementById('obs');if(!textarea)return {editor:'native'};
  const ck=globalThis.CKEDITOR?.instances?.obs;
  if(ck)return (async()=>{
    if(ck.element?.$!==textarea)throw Error('Instância CKEditor não corresponde ao campo obs.');
    for(let i=0;ck.status!=='ready'&&i<60;i++)await new Promise(r=>setTimeout(r,250));
    if(ck.status!=='ready'||ck.readOnly)throw Error('CKEditor obs não está pronto para edição.');
    const container=document.getElementById('cke_obs'),section=container?.closest('fieldset');
    if(!container||!section)throw Error('Seção do CKEditor obs não identificada.');
    // Reveal only the observation editor and its own section; other editors
    // (edit_motivo and edit_relatorio) remain outside this operation.
    for(let node=container;node&&node!==section.parentElement;node=node.parentElement){node.hidden=false;if(getComputedStyle(node).display==='none')node.style.setProperty('display','block','important');}
    const html=String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CKEditor obs não confirmou o texto em 10 segundos.')),10000);ck.setData(html,{callback(){clearTimeout(timer);resolve();}});});
    ck.updateElement();ck.focus();
    const editable=ck.editable?.()?.$,frame=container.querySelector('iframe');
    if(!editable||!(container.offsetWidth||container.offsetHeight||container.getClientRects().length)||!(frame?.offsetWidth||frame?.offsetHeight||frame?.getClientRects().length||editable.getClientRects().length))throw Error('CKEditor obs recebeu dados, mas sua área de edição não está visível.');
    const plain=element=>{const copy=element.cloneNode(true);copy.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));return element.innerText??copy.textContent??'';};
    const clean=s=>String(s).replace(/\s+/g,' ').trim();
    const stored=document.createElement('div');stored.innerHTML=ck.getData();
    if(clean(plain(editable))!==clean(value)||clean(plain(stored))!==clean(value))throw Error('Texto do CKEditor obs divergente.');
    return {editor:'CKEditor obs',confirmed:true};
  })();
  if(document.getElementById('cke_obs'))throw Error('CKEditor obs existe, mas a instância ainda não está acessível.');
  const instance=globalThis.sceditor?.instance?.(textarea)||(globalThis.jQuery?.fn?.sceditor?globalThis.jQuery(textarea).sceditor('instance'):null);
  if(!instance)return {editor:'native'};
  const html=String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  instance.val(html,false);
  const body=instance.getBody?.();if(!body)throw Error('Área visível do SCEditor não identificada.');
  const copy=body.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));const plain=body.innerText??copy.textContent??'';
  const clean=s=>String(s).replace(/\s+/g,' ').trim();
  if(clean(plain)!==clean(value))throw Error('Texto não confirmado no SCEditor.');
  textarea.value=value;
  return {editor:'SCEditor',confirmed:true};
}
async function engine(tab,operation,payload){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['imas.js']});const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async(op,data)=>{try{return {data:await globalThis.RcoImas[op](data)};}catch(e){return {error:e.message,noFormChanges:e.noFormChanges===true};}},args:[operation,payload??null]});if(result?.result?.error){const e=Error(result.result.error);e.noFormChanges=result.result.noFormChanges===true;throw e;}return result?.result?.data;}
async function openForm(tab,job){
  let loginAttempted=false;const navigationVisited=[];
  for(let step=0;step<8;step++){
    await loaded(tab.id);await wait(1500);
    await trace('Navegar no IMAS','running',{path:new URL((await chrome.tabs.get(tab.id)).url).pathname});
    const action=await engine(tab,'navigate',{...job,loginAttempted,navigationVisited});
    if(action?.expanded==='entrar'){loginAttempted=true;await trace('Entrar no IMAS');}
    if(action?.ready){await trace('Formulário localizado','ok');return;}
    if(action?.url){const url=new URL(action.url);if(url.origin!==new URL(IMAS).origin)throw Error('Destino fora do IMAS bloqueado.');await chrome.tabs.update(tab.id,{url:url.href});await wait(2000);}
    else if(action?.waitingLogin){await trace(loginAttempted?'Aguardar resposta do login':'Aguardar preenchimento salvo do navegador');await wait(750);}
    else if(action?.expanded){navigationVisited.push(action.expanded);await wait(2000);}
    else throw Error('Navegação no IMAS não identificada.');
  }
  throw Error(loginAttempted?'O IMAS permaneceu na página de login após Entrar. Nenhuma nova tentativa nem salvamento foi feito.':'Não foi possível chegar ao formulário da OS. Nenhum salvamento foi feito.');
}
// Keep the square white-margin format used by the existing 1.0.4 activator.
async function adjustPhoto(data){
 const blob=await(await fetch(data)).blob(),bitmap=await createImageBitmap(blob);
 try{
  let max=480,quality=.35,output;
  for(let attempt=0;attempt<10;attempt++){
   const side=Math.max(1,Math.min(max,Math.max(bitmap.width,bitmap.height))),area=Math.max(1,Math.round(side*.90)),scale=Math.min(area/bitmap.width,area/bitmap.height),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
   const canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);ctx.drawImage(bitmap,Math.round((side-w)/2),Math.round((side-h)/2),w,h);
   output=await canvas.convertToBlob({type:'image/jpeg',quality});if(output.size<=15000)break;max=Math.round(max*.82);quality=Math.max(.22,quality-.04);
  }
  if(!output||output.size>15000)throw Error('Foto não pôde ser compactada para o relatório. Nenhum arquivo foi enviado.');
  const bytes=new Uint8Array(await output.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/jpeg;base64,'+btoa(binary);
 }finally{bitmap.close();}
}

async function preview(publicId){
  if(running)throw Error('Já há um teste em andamento.');running=true;
  let formStarted=false,reserved=false,diagnosticTab=null;
  try{
    const {pending}=await chrome.storage.local.get('pending');if(pending)throw Error('Há uma OS preparada aguardando revisão. Libere esse teste na extensão antes de preparar outra.');
    activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Consultar fila',events:[],controls:[]};lastDiagnosticSync=0;
    await trace('Consultar fila');
    const data=await queue();const job=safeJob(data.jobs.find(j=>j.publicId===publicId));const {saveAttempts={}}=await chrome.storage.local.get('saveAttempts');if(job.phase==='criar'&&saveAttempts[publicId])throw Error('Já houve tentativa de salvar esta criação. Confira e vincule o número do IMAS antes de repetir.');await trace('Validar dados da OS','ok');const tab=await imasTab();diagnosticTab=tab;activeRun.tabId=tab.id;
    // Reserve before touching the form. A worker restart does not lose the lock.
    await chrome.storage.local.set({pending:{publicId,reference:job.reference,phase:job.phase,tabId:tab.id,at:new Date().toISOString(),state:'preparando'}});reserved=true;
    await openForm(tab,job);
    await loaded(tab.id);
    formStarted=true;
    await trace('Identificar e preencher formulário');await syncDiagnostic(true);
    await engine(tab,'prepare',job);await trace('Aguardar editor de observação');await wait(1000);await engine(tab,'observations',job.report.observations);await trace('Sincronizar editor de observação');
    const [editorResult]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:syncObservationEditor,args:[job.report.observations]});
    if(!editorResult?.result)throw Error('Editor de observação não respondeu.');
    await trace('Formulário preenchido','ok');
    if(job.phase==='encerrar'){
      const rt=await rcoTab();for(const [index,photo]of job.report.photos.entries()){
        await trace('Preparar foto '+(index+1));const original=await message(rt,{action:'foto',url:photo.url});const dataUrl=await adjustPhoto(original);
        await engine(tab,'addPhoto',{dataUrl,name:`OS_${job.externalNumber}_Foto_${String(index+1).padStart(2,'0')}.jpg`,reset:index===0});
      }
    }
    await wait(750);await trace('Conferir campos e fotos');const formAudit=await engine(tab,'audit',job);if(!formAudit.ok)throw Error('Confira os campos que divergiram: '+formAudit.errors.join('; '));
    activeRun.controls=await engine(tab,'diagnostics');
    await chrome.storage.local.set({pending:{publicId,reference:job.reference,phase:job.phase,tabId:tab.id,at:new Date().toISOString(),state:'aguardando validação',audit:formAudit,job}});
    activeRun.state='review';await trace('Aguardando validação — sem salvar','ok');await syncDiagnostic(true);
    await chrome.tabs.update(tab.id,{active:true});await audit('teste-preparado',{publicId,reference:job.reference,phase:job.phase,fields:formAudit.fields,photos:formAudit.photos});
    return {message:job.phase==='criar'?'OS preenchida como Aberta. Confira tudo no IMAS. A extensão NÃO clicou em Salvar.':'Encerramento preparado. Fotos apenas selecionadas, sem enviar arquivos. Confira os campos. A extensão NÃO clicou em Salvar nem marcou baixa no app.'};
  }catch(e){if(activeRun){activeRun.state='failed';if(diagnosticTab){try{activeRun.controls=await engine(diagnosticTab,'diagnostics');}catch{}}
    await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);}
    if(reserved&&(!formStarted||e.noFormChanges===true)){const {pending}=await chrome.storage.local.get('pending');if(pending?.publicId===publicId&&pending.state==='preparando')await chrome.storage.local.remove('pending');}await audit('falha',{message:e.message});throw e;}finally{running=false;activeRun=null;}
}
function creationDialogs(restore=false){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')throw Error('Página fora da criação.');
 if(restore){window.__rcoCreationDialogs?.restore();return;}
 if(window.__rcoCreationDialogs)throw Error('Confirmação já em andamento.');
 const originalConfirm=window.confirm,originalAlert=window.alert;
 const state={restore(){if(window.confirm===confirmed)window.confirm=originalConfirm;if(window.alert===alerted)window.alert=originalAlert;delete window.__rcoCreationDialogs;}};
 const confirmed=text=>/salvar|gravar/i.test(String(text))?true:originalConfirm.call(window,text);
 const alerted=text=>{if(!/(salv|grav).*(sucesso|sucess)|sucesso.*(salv|grav)/i.test(String(text)))return originalAlert.call(window,text);};
 window.__rcoCreationDialogs=state;window.confirm=confirmed;window.alert=alerted;setTimeout(()=>state.restore(),45000);
}
function clickCreationSave(selector,number=null){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')return {error:'Página fora da criação.',noClick:true};
 const id=new URL(location.href).searchParams.get('id_ordem_servico');if(number!==null?(id!==number||number==='323902'):(id&&id!=='0'))return {error:'OS divergente ou protegida.',noClick:true};
 const buttons=document.querySelectorAll(selector);if(buttons.length!==1||buttons[0].disabled)return {error:'Salvar não está disponível de forma única.',noClick:true};
 const button=buttons[0];if(!(button.offsetWidth||button.offsetHeight||button.getClientRects().length))return {error:'Salvar não está visível.',noClick:true};
 if(window.CKEDITOR?.instances?.obs)window.CKEDITOR.instances.obs.updateElement();
 button.scrollIntoView({block:'center'});button.focus();const originalConfirm=window.confirm;window.confirm=()=>true;try{button.click();return {clicked:true};}finally{window.confirm=originalConfirm;}
}
function confirmCreationSuccess(number=null,mode='click'){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||(number!==null&&new URL(location.href).searchParams.get('id_ordem_servico')!==number)||new URL(location.href).searchParams.get('id_ordem_servico')==='323902')return {clicked:false};
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
 const successPanel=button=>{for(let e=button.parentElement,depth=0;e&&depth<12&&!['BODY','HTML'].includes(e.tagName);e=e.parentElement,depth++){const texts=[norm(e.innerText),norm(e.textContent)];if(texts.some(text=>text.length<500&&/registro\s*gravado/.test(text)&&!/(?:^|\s)(?:erro|falha)(?:\s|:|$)/.test(text)))return e;}return null;};
 // Same visible native OK lookup as the supplied extension, scoped to its success window.
 const candidates=[...document.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],.btn,[onclick]')].filter(e=>visible(e)&&!e.disabled&&norm(e.tagName==='INPUT'?e.value:e.innerText||e.textContent)==='ok'&&successPanel(e)).filter((e,i,all)=>!all.some(other=>other!==e&&other.contains?.(e)));
 if(!candidates.length)return {clicked:false};if(candidates.length!==1)throw Error('Há dois OK de sucesso visíveis. Nenhum clique repetido.');
 const button=candidates[0],panel=successPanel(button);
 if(mode==='observe')return {open:true};
 if(mode==='enter'||mode==='reserve-enter'){const attempted=panel.dataset.rcoEnterAttempt==='true';if(mode==='reserve-enter'&&!attempted)panel.dataset.rcoEnterAttempt='true';if(!button.hasAttribute?.('tabindex')&&!['BUTTON','INPUT','A'].includes(button.tagName))button.setAttribute('tabindex','-1');button.scrollIntoView({block:'center'});button.focus();return {enterRequired:true,alreadyAttempted:attempted};}
 if(panel.dataset.rcoSuccessOk)return {clicked:false};
 panel.dataset.rcoSuccessOk='true';button.scrollIntoView({block:'center'});button.focus();button.click();return {clicked:true};
}
async function acknowledgeSuccess(tabId,number=null){
 const manual=await manualFinalConfirmation(tabId,number);if(manual)return manual;
 const probe=async(mode='enter')=>{const [result]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:confirmCreationSuccess,args:[number,mode]});return result?.result;};
 const ready=await probe();
 if(!ready?.enterRequired)return {result:ready||{clicked:false}};
 if(ready.alreadyAttempted)throw Error('Enter já enviado nesta janela; confira a confirmação sem repetir Salvar.');
 const target={tabId};let attached=false;
 try{
  await chrome.debugger.attach(target,'1.3');attached=true;
  // Focus and reserve only the verified success OK, never the Save button.
  const reserved=await probe('reserve-enter');
  if(!reserved?.enterRequired)return {result:{clicked:false}};
  if(reserved.alreadyAttempted)throw Error('Enter já enviado nesta janela.');
  await trace('Confirmar janela de sucesso com Enter');
  await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await wait(750);
  if((await probe())?.enterRequired)throw Error('Enter enviado, mas a janela Registro gravado continua aberta. Salvar não será repetido.');
  await audit('enter-sucesso-confirmado',{publicId:activeRun?.publicId,osNumber:number});
  return {result:{clicked:true}};
 }finally{if(attached)await chrome.debugger.detach(target).catch(()=>{});}
}
async function createAndSave(publicId){
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='criar')throw Error('Esta OS já está vinculada. Encerramento ainda aguarda validação.');
 let {pending,saveAttempts={}}=await chrome.storage.local.get(['pending','saveAttempts']);
 if(!pending&&saveAttempts[publicId]){
  // A version update may release pending state. Recover only a unique existing
  // form whose actual fields still match this OS; never navigate to Novo.
  const candidates=[];
  for(const tab of await chrome.tabs.query({url:IMAS+'*'})){
   if(!tab.url||new URL(tab.url).origin!==new URL(IMAS).origin||new URL(tab.url).pathname!=='/ordem_servico_form.php')continue;
   try{const checked=await engine(tab,'audit',job);if(checked.ok)candidates.push({tab,checked});}catch{}
  }
  if(candidates.length!==1)throw Error('Criação já foi acionada. Mantenha o formulário salvo aberto para recuperar o número; não será criada outra OS.');
  pending={publicId,phase:'criar',reference:job.reference,tabId:candidates[0].tab.id,audit:candidates[0].checked,job,saveAttempted:true,state:'recuperando criação salva'};
  await chrome.storage.local.set({pending});
 }
 if(!pending)await preview(publicId);
 else if(pending.publicId!==publicId)throw Error('Libere a outra OS em revisão antes de criar esta.');
 return savePrepared(publicId);
}
async function savePrepared(publicId){
 if(running)throw Error('Aguarde a execução terminar.');running=true;
 activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Verificar criação antes de salvar',events:[],controls:[]};
 try{
  await trace('Verificar criação antes de salvar');
  const {pending,saveAttempts={}}=await chrome.storage.local.get(['pending','saveAttempts']);
  if(!pending||pending.publicId!==publicId||pending.phase!=='criar'||!pending.audit?.ok)throw Error('Prepare e revise esta criação antes de salvar.');
  const recovering=!!(pending.saveAttempted||saveAttempts[publicId]);
  if(pending.externalNumber)throw Error('Já houve tentativa confirmada. Esta criação já tem número; confira a vinculação no app.');
  const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
  if(job.phase!=='criar')throw Error('A OS já está vinculada. Confira o número no app antes de prosseguir.');
  await trace('Conferir campos atuais do app no IMAS');
  const tab=await chrome.tabs.get(pending.tabId);if(!tab.url||new URL(tab.url).origin!==new URL(IMAS).origin||new URL(tab.url).pathname!=='/ordem_servico_form.php')throw Error('A aba preparada mudou de página.');
  const checked=await engine(tab,'audit',job);if(!checked.ok)throw Error('Confira os campos: '+checked.errors.join('; '));
  if(!recovering){
  await trace('Localizar botão Salvar');
  const target=await engine(tab,'saveCreation',{...job,explicitSave:true,locateOnly:true,saveToken:crypto.randomUUID()});
  if(!target?.selector)throw Error('O botão Salvar não foi confirmado. Nenhum clique foi feito.');
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[false]});
  await chrome.storage.local.set({pending:{...pending,saveAttempted:true,state:'salvando criação'},saveAttempts:{...saveAttempts,[publicId]:{at:new Date().toISOString(),reference:job.reference}}});
  await trace('Clicar Salvar no contexto do IMAS');await audit('salvar-criacao-iniciado',{publicId});
  const [clicked]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickCreationSave,args:[target.selector]});
  if(clicked?.result?.noClick){await chrome.storage.local.set({pending,saveAttempts});throw Error(clicked.result.error);}
  if(!clicked?.result?.clicked)throw Error('O resultado do clique não foi confirmado. Confira o IMAS antes de tentar novamente.');
  await trace('Clique em Salvar executado','ok');
  }else await trace('Recuperar criação existente — sem repetir Salvar');
  await trace('Confirmar OK de Registro gravado');
  await trace('Aguardar número gerado pelo IMAS');
  let number=null,successAcknowledged=false;for(let i=0;i<80&&(!number||!successAcknowledged);i++){
   await wait(500);const current=await chrome.tabs.get(tab.id);if(current.status!=='complete')continue;
   let acknowledged;
   try{acknowledged=await acknowledgeSuccess(tab.id);}catch(e){if(i===79)throw e;continue;}
   if(acknowledged?.result?.clicked){successAcknowledged=true;await trace('OK de Registro gravado confirmado','ok');await wait(1000);}
   try{number=await engine(tab,'savedNumber',job);}catch{}
  }
  if(!successAcknowledged)throw Error('Salvar foi acionado, mas o OK de Registro gravado não foi confirmado. Retome a confirmação sem repetir Salvar.');
  if(!number)throw Error('Salvar foi acionado uma vez, mas o número não foi confirmado. Confira o IMAS e vincule o número manualmente. Não repita a criação.');
  try{await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[true]});}catch{}
  await chrome.storage.local.set({pending:{...pending,saveAttempted:true,successAcknowledged:true,state:'criação salva; encerramento pendente',externalNumber:number}});
  await trace('Vincular número à OS no app');
  await message(await rcoTab(),{action:'vincular',publicId,osNumber:number});
  activeRun.state='review';await trace('Criação salva e vinculada — encerramento pendente','ok');await syncDiagnostic(true);
  const {creationOkConfirmed={}}=await chrome.storage.local.get('creationOkConfirmed');await chrome.storage.local.set({creationOkConfirmed:{...creationOkConfirmed,[publicId]:number}});
  await audit('criacao-salva-vinculada',{publicId,osNumber:number});
  return {message:`OS ${number} criada como Aberta e vinculada ao app. Fotos e encerramento ainda não executados.`};
 }catch(e){if(activeRun){activeRun.state='failed';try{const {pending}=await chrome.storage.local.get('pending');if(pending?.tabId)activeRun.controls=await engine({id:pending.tabId},'diagnostics');}catch{}await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);}throw e;}finally{running=false;activeRun=null;}
}
function clickClosingTarget(selector,number,operation='upload'){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||new URL(location.href).searchParams.get('id_ordem_servico')!==number||number==='323902')return {noClick:true,error:'OS divergente ou protegida.'};
 const nodes=document.querySelectorAll(selector);if(nodes.length!==1||nodes[0].disabled||!(nodes[0].offsetWidth||nodes[0].offsetHeight||nodes[0].getClientRects().length))return {noClick:true,error:'Botão não disponível.'};
 window.CKEDITOR?.instances?.obs?.updateElement();nodes[0].scrollIntoView({block:'center'});nodes[0].focus();
 const originalConfirm=window.confirm;if(operation==='save')window.confirm=()=>true;
 try{nodes[0].click();return {clicked:true};}finally{if(operation==='save')window.confirm=originalConfirm;}
}
function notifyClosingPhotos(selector,number,count){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||new URL(location.href).searchParams.get('id_ordem_servico')!==number||number==='323902')return {error:'OS divergente ou protegida.'};
 const nodes=document.querySelectorAll(selector),input=nodes[0];
 if(nodes.length!==1||input.type!=='file'||input.disabled||input.files.length!==count||count<1)return {error:'Seleção de fotos divergente.'};
 const section=input.closest('fieldset');if(!section||section.querySelectorAll('input[type="file"]').length!==1)return {error:'Seção Fotos divergente.'};
 const linked=()=>{const matches=[...String(section.textContent||'').matchAll(/(?:esta\s+o\.?s\.?\s+tem|tem)\s*\(?\s*(\d+)\s*\)?\s*fotos?\s+vinculad/gi)];return matches.length===1?Number(matches[0][1]):null;};
 if(linked()!==0)return {error:'Esta OS já possui fotos vinculadas ou contador não identificado.'};
 const requests=Number(window.jQuery?.active||0);
 // A native change reaches jQuery listeners too. Do not trigger change a
 // second time: an IMAS handler might start an upload itself.
 input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 return {notified:true,automaticUpload:Number(window.jQuery?.active||0)>requests||linked()>0};
}
async function reconnect323140(pending,job){
 if(job.externalNumber!=='323140'||pending.publicId!=='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484')return pending;
 try{await chrome.tabs.get(pending.tabId);return pending;}catch(e){if(!/No tab with id/.test(e.message))throw e;}
 const candidates=(await chrome.tabs.query({url:IMAS+'*'})).filter(t=>{try{const u=new URL(t.url);return u.origin===new URL(IMAS).origin&&u.pathname==='/ordem_servico_form.php'&&u.searchParams.get('id_ordem_servico')===job.externalNumber;}catch{return false;}});
 if(candidates.length>1)throw Error('Há duas abas da 323140. Nenhum envio nem salvamento repetido.');
 const tab=candidates[0]||await chrome.tabs.create({url:IMAS+'ordem_servico_form.php?id_ordem_servico=323140',active:true});
 running=true;activeRun={runId:crypto.randomUUID(),publicId:job.publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Reconectar aba atual da OS',events:[],controls:[],tabId:tab.id};
 try{
  await trace('Reconectar aba atual da OS');await openForm(tab,job);
  // Read OS/client/unit and photo count before changing any form values.
  const linked=await engine(tab,'linkedPhotos',job);
  if(linked.count>0&&linked.count!==job.report.photos.length)throw Error('As fotos vinculadas estão incompletas ou divergentes. Nada foi reenviado.');
  let checked=await engine(tab,'audit',{...job,verifyUploaded:linked.count>0});
  if(!checked.ok){
   if(linked.count>0)throw Error('Fotos existentes, mas campos divergentes. Não reenviar nem salvar.');
   await engine(tab,'prepare',job);await wait(1000);await engine(tab,'observations',job.report.observations);
   const [editor]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:syncObservationEditor,args:[job.report.observations]});if(!editor?.result)throw Error('Observação não confirmada.');
   const rt=await rcoTab();for(const [index,photo]of job.report.photos.entries()){const dataUrl=await adjustPhoto(await message(rt,{action:'foto',url:photo.url}));await engine(tab,'addPhoto',{dataUrl,name:`OS_${job.externalNumber}_Foto_${String(index+1).padStart(2,'0')}.jpg`,reset:index===0});}
   checked=await engine(tab,'audit',job);if(!checked.ok)throw Error('Campos divergentes: '+checked.errors.join('; '));
  }
  pending={...pending,tabId:tab.id,job,audit:checked,state:linked.count>0?'fotos já vinculadas; aguarda Salvar':'aguardando validação'};
  await chrome.storage.local.set({pending});await trace('Aba atual reconectada sem clicar Enviar arquivos','ok');return pending;
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
}
// Final-stage recovery is deliberately separate from photo upload and preparation.
function finalSavePoint(selector,number){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||new URL(location.href).searchParams.get('id_ordem_servico')!==number||number==='323902'||document.getElementById('id_ordem_servico')?.value!==number||document.getElementById('id_cliente')?.value!=='91')throw Error('OS/cliente divergente antes do clique final.');
 if(Number(window.jQuery?.active||0)!==0)throw Error('O IMAS ainda está processando. Salvar não foi repetido.');
 const matches=[...document.querySelectorAll(selector)].filter(e=>!e.disabled&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
 if(matches.length!==1||String(matches[0].value||matches[0].innerText||'').trim().toLowerCase()!=='salvar')throw Error('Salvar final não identificado de forma única.');
 const button=matches[0];button.scrollIntoView({block:'center'});button.focus();
 const r=button.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
 if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw Error('Salvar fora da área visível.');
 window.__rcoFinalSaveConfirm=window.confirm;window.confirm=()=>true;
 return {x,y};
}
function restoreFinalSaveConfirm(){if(window.__rcoFinalSaveConfirm){window.confirm=window.__rcoFinalSaveConfirm;delete window.__rcoFinalSaveConfirm;}}
async function nativeFinalSave(tab,job){
 const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos divergentes antes de Salvar final: '+checked.errors.join('; '));
 const save=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});
 const target={tabId:tab.id};let attached=false;
 try{
  await chrome.debugger.attach(target,'1.3');attached=true;
  const [r]=await chrome.scripting.executeScript({target,world:'MAIN',func:finalSavePoint,args:[save.selector,job.externalNumber]});
  if(!r?.result)throw Error('Posição atual de Salvar não confirmada.');
  await trace('Salvar final com clique do navegador');
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',...r.result,button:'left',clickCount:1});
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',...r.result,button:'left',clickCount:1});
 }finally{try{await chrome.scripting.executeScript({target,world:'MAIN',func:restoreFinalSaveConfirm});}catch{}if(attached)await chrome.debugger.detach(target).catch(()=>{});}
}
async function resumeClosingFinal(job,pending){
 if(!pending?.job||pending.publicId!==job.publicId||pending.phase!=='encerrar'||pending.job.externalNumber!==job.externalNumber)throw Error('Retomada final sem vínculo confirmado. Nenhuma foto será reenviada.');
 const key=photos=>JSON.stringify(photos.map(p=>[p.publicId||'',p.url]));
 if(key(pending.job.report.photos)!==key(job.report.photos))throw Error('As evidências mudaram. Retomada final bloqueada.');
 const tab={id:pending.tabId};await loaded(tab.id);
 running=true;activeRun={runId:crypto.randomUUID(),publicId:job.publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Retomar somente Salvar e OK',events:[],controls:[],tabId:tab.id};
 try{
  await trace('Retomar somente Salvar e OK — sem envio de fotos');
  const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos/fotos divergentes: '+checked.errors.join('; '));
  // Dismiss an existing success window first. If absent, Save may safely repeat.
  let confirmed=(await acknowledgeSuccess(tab.id,job.externalNumber))?.result?.clicked===true;
  if(!confirmed){await nativeFinalSave(tab,job);for(let i=0;i<80;i++){await wait(500);if((await acknowledgeSuccess(tab.id,job.externalNumber))?.result?.clicked){confirmed=true;break;}}}
  // The persisted record is authoritative even when a transient OK was missed.
  await trace('Reler encerramento no IMAS');await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2000);
  const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});const linked=await engine(tab,'linkedPhotos',job);
  if(!persisted.ok||linked.count<job.report.photos.length)throw Error('Encerramento não confirmado na releitura. Fotos não foram reenviadas.');
  await message(await rcoTab(),{action:'baixar',publicId:job.publicId,osNumber:job.externalNumber});
  await chrome.storage.local.remove('pending');activeRun.state='completed';await trace('Encerramento e baixa confirmados na releitura','ok');await syncDiagnostic(true);
  await audit('encerramento-confirmado',{publicId:job.publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:`OS ${job.externalNumber}: encerramento confirmado e baixa registrada, sem reenviar fotos.`};
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
}
async function closeAndSave(publicId){
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='encerrar')throw Error('Crie e vincule esta OS antes de encerrar.');
 if(job.externalNumber==='323902'||publicId==='4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1')throw Error('OS 323902 protegida por solicitação do supervisor.');
 if(running)throw Error('Aguarde a execução terminar.');
 let {pending,closeAttempts={}}=await chrome.storage.local.get(['pending','closeAttempts']);
 if(closeAttempts[publicId]?.step==='save'&&pending?.publicId===publicId)return resumeClosingFinal(job,pending);
 if(pending?.publicId===publicId)pending=await reconnect323140(pending,job);
 let photosAlreadyUploaded=false;
 if(publicId==='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484'&&pending?.publicId===publicId&&closeAttempts[publicId]?.step==='upload'){
  const tab={id:pending.tabId},linked=await engine(tab,'linkedPhotos',job);
  if(linked.count===job.report.photos.length){const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos divergentes. Nada foi reenviado nem salvo.');photosAlreadyUploaded=true;}
 }
 if(closeAttempts[publicId]&&!photosAlreadyUploaded){
  const {lastDiagnostic,reset323140Authorized}=await chrome.storage.local.get(['lastDiagnostic','reset323140Authorized']);
  const reset323140=publicId==='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484'&&job.externalNumber==='323140'&&(reset323140Authorized===true||(lastDiagnostic?.runId==='a8d3e15e-f407-47f8-993f-244eeb46b43b'&&lastDiagnostic.state==='failed'&&lastDiagnostic.step==='Aguardar fotos vinculadas'))&&closeAttempts[publicId].step==='upload'&&pending?.publicId===publicId&&pending.job;
  if(reset323140){
   await chrome.storage.local.set({reset323140Authorized:true});
   const tab={id:pending.tabId},selected=await engine(tab,'closingSelection',job);
   const [requests]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>Number(window.jQuery?.active||0)});
   const key=photos=>JSON.stringify(photos.map(p=>[p.publicId||'',p.url]));
   if(selected.before!==0||requests?.result!==0||key(pending.job.report.photos)!==key(job.report.photos))throw Error('Exclusão das fotos ou ausência de envio pendente não confirmada. Não reenviar.');
   delete closeAttempts[publicId];await chrome.storage.local.set({closeAttempts,reset323140Authorized:false});await audit('novo-teste-323140-apos-exclusao-confirmada',{publicId});
  }
  const recovery=publicId==='f5c0b70b-abee-41a3-a280-f84e19de1ec5'&&job.externalNumber==='323162'&&lastDiagnostic?.runId==='476319f1-568f-46fb-be62-6acddbc4ddac'&&lastDiagnostic.state==='failed'&&lastDiagnostic.step==='Localizar Enviar arquivos'&&lastDiagnostic.events?.some(e=>e.step==='Notificar seleção de fotos ao IMAS'&&e.status==='ok')&&!lastDiagnostic.events?.some(e=>e.step==='Enviar arquivos clicado')&&closeAttempts[publicId].step==='upload'&&pending?.publicId===publicId&&pending.job;
  if(recovery){
   const key=photos=>JSON.stringify(photos.map(p=>[p.publicId||'',p.url]));
   if(key(pending.job.report.photos)!==key(job.report.photos))throw Error('As fotos mudaram. Recuperação bloqueada.');
   const tab={id:pending.tabId};const selected=await engine(tab,'closingSelection',job);
   const [requests]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>Number(window.jQuery?.active||0)});
   if(requests?.result!==0||selected.before!==0||selected.count!==job.report.photos.length)throw Error('Há envio pendente ou fotos divergentes. Recuperação bloqueada.');
   delete closeAttempts[publicId];pending={...pending,selectionNotified:true};await chrome.storage.local.set({closeAttempts,pending});
   await audit('retomada-sem-reenviar-selecao',{publicId,message:'Falha anterior antes do clique; nenhuma foto vinculada, mesmas evidências e nenhuma requisição ativa.'});
  }
 }
 if(closeAttempts[publicId]&&!photosAlreadyUploaded)throw Error('Já houve tentativa de envio/encerramento. Confira o resultado no IMAS; a extensão não repetirá os cliques.');
 if(pending&&pending.publicId!==publicId)throw Error('Libere a outra OS em revisão primeiro.');
 if(!pending)await preview(publicId);
 ({pending}=await chrome.storage.local.get('pending'));
 if(!pending?.audit?.ok||pending.phase!=='encerrar')throw Error('Preparo de encerramento não confirmado.');
 running=true;activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Conferir encerramento',events:[],controls:[],tabId:pending.tabId};
 const tab={id:pending.tabId};
 try{
  // Fresh app values must match the reviewed form; stale evidence is never sent.
  const checked=await engine(tab,'audit',{...job,verifyUploaded:photosAlreadyUploaded});if(!checked.ok)throw Error('Dados mudaram: '+checked.errors.join('; '));
  const evidenceKey=photos=>JSON.stringify(photos.map(photo=>[photo.publicId||'',photo.url]));
  if(evidenceKey(pending.job.report.photos)!==evidenceKey(job.report.photos))throw Error('As fotos mudaram. Libere e prepare novamente antes de enviar.');
  if(!photosAlreadyUploaded){
  await trace('Conferir seleção antes de notificar o IMAS');
  const selection=await engine(tab,'closingSelection',job);
  if(selection.count!==job.report.photos.length)throw Error('Quantidade de fotos selecionadas divergente.');
  await chrome.storage.local.set({closeAttempts:{...closeAttempts,[publicId]:{at:new Date().toISOString(),externalNumber:job.externalNumber,step:'upload'}},pending:{...pending,state:'enviando fotos'}});
  await trace('Notificar seleção de fotos ao IMAS');
  const [notification]=pending.selectionNotified?[{result:{notified:true,automaticUpload:false}}]:await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:notifyClosingPhotos,args:[selection.selector,job.externalNumber,selection.count]});
  if(!notification?.result?.notified)throw Error(notification?.result?.error||'O IMAS não recebeu a notificação das fotos.');
  if(notification.result.automaticUpload){await trace('Componente iniciou envio — sem segundo clique','ok');}
  else{
   await wait(1200);await trace('Localizar Enviar arquivos');
   const target=await engine(tab,'closingTarget',{...job,operation:'upload',token:crypto.randomUUID()});
   activeRun.controls=await engine(tab,'diagnostics');await trace('Botão de envio identificado','ok',{message:`${target.caption||'Enviar arquivos'} · ${target.tag||'controle'} · ${target.selector}`});await syncDiagnostic(true);
   const [clicked]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickClosingTarget,args:[target.selector,job.externalNumber]});
   if(!clicked?.result?.clicked)throw Error(clicked?.result?.error||'Resultado do clique de envio não confirmado.');
   await trace('Enviar arquivos clicado','ok');
  }
  await trace('Aguardar fotos vinculadas');let uploaded=false;
  for(let i=0;i<180;i++){await wait(500);try{const result=await engine(tab,'linkedPhotos',job);if(result.count===selection.before+job.report.photos.length){uploaded=true;break;}}catch{}}
  if(!uploaded)throw Error('O IMAS não confirmou todas as fotos vinculadas. Encerramento não foi salvo. Não repita o envio.');
  }else await trace('Fotos já vinculadas — somente Salvar e OK','ok');
  await trace('Fotos vinculadas confirmadas','ok');await wait(1500);
  const save=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[false]});
  await chrome.storage.local.set({closeAttempts:{...closeAttempts,[publicId]:{at:new Date().toISOString(),externalNumber:job.externalNumber,step:'save'}},pending:{...pending,state:'salvando encerramento'}});
  await trace('Salvar encerramento');const [saved]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickCreationSave,args:[save.selector,job.externalNumber]});
  if(!saved?.result?.clicked)throw Error(saved?.result?.error||'Resultado do clique Salvar não confirmado.');
  let confirmed=false;await trace('Confirmar OK de Registro gravado');
  for(let i=0;i<80;i++){await wait(500);const ok=await acknowledgeSuccess(tab.id,job.externalNumber);if(ok?.result?.clicked){confirmed=true;break;}if(i===19&&!(await chrome.storage.local.get('finalRecording')).finalRecording?.active)await nativeFinalSave(tab,job);}
  if(!confirmed)await trace('OK não observado — conferir registro persistido, sem reenviar fotos','ok');
  await trace('Reler OS salva no IMAS');await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2000);
  const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});const linked=await engine(tab,'linkedPhotos',job);
  if(!persisted.ok||linked.count<job.report.photos.length)throw Error('Encerramento salvo não confirmado na releitura. Nenhuma baixa marcada no app.');
  await trace('Confirmar baixa na plataforma');await message(await rcoTab(),{action:'baixar',publicId,osNumber:job.externalNumber});
  await chrome.storage.local.remove('pending');activeRun.state='completed';await trace('OS encerrada e baixa confirmada','ok');await syncDiagnostic(true);await audit('encerramento-confirmado',{publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:`OS ${job.externalNumber}: fotos enviadas, encerramento salvo e confirmado no IMAS. Baixa registrada no app.`};
 }catch(e){activeRun.state='failed';try{activeRun.controls=await engine(tab,'diagnostics');}catch{}await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{try{await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[true]});}catch{}running=false;activeRun=null;}
}
// Resume only the explicitly authorized, unclicked 323162 run. Existing
// selected files and reviewed job must survive the extension reload.
async function resume323162PhotoSection(){
 if(running)return;
 const {lastDiagnostic,pending,photoSectionRecovery}=await chrome.storage.local.get(['lastDiagnostic','pending','photoSectionRecovery']);
 if(photoSectionRecovery||lastDiagnostic?.runId!=='476319f1-568f-46fb-be62-6acddbc4ddac'||lastDiagnostic.state!=='failed'||lastDiagnostic.step!=='Localizar Enviar arquivos'||pending?.publicId!=='f5c0b70b-abee-41a3-a280-f84e19de1ec5'||!pending.job)return;
 const tabs=await chrome.tabs.query({url:IMAS+'*'});if(tabs.length!==1||tabs[0].id!==pending.tabId||running)return;
 const url=new URL(tabs[0].url);if(url.pathname!=='/ordem_servico_form.php'||url.searchParams.get('id_ordem_servico')!=='323162')return;
 await chrome.storage.local.set({photoSectionRecovery:{runId:lastDiagnostic.runId,at:new Date().toISOString()}});
 const result=await closeAndSave(pending.publicId);await audit('retomada-323162',{message:result.message});
}
// One authorized test of 323140 after the user deleted its uploaded photos.
async function resume323140TabTest(){
 if(running)return;
 const {lastDiagnostic,pending,tabRecovery323140,reset323140Authorized}=await chrome.storage.local.get(['lastDiagnostic','pending','tabRecovery323140','reset323140Authorized']);
 if(tabRecovery323140||pending?.publicId!=='1f50e01c-f53e-4dbf-8bd0-c26f4ae3d484'||!pending.job||!(reset323140Authorized===true||lastDiagnostic?.runId==='a8d3e15e-f407-47f8-993f-244eeb46b43b'))return;
 const tabs=await chrome.tabs.query({url:IMAS+'*'});if(tabs.length!==1)return;
 const url=new URL(tabs[0].url);if(url.origin!==new URL(IMAS).origin||url.pathname!=='/ordem_servico_form.php'||url.searchParams.get('id_ordem_servico')!=='323140')return;
 await chrome.storage.local.remove('batch');await chrome.storage.local.set({tabRecovery323140:{at:new Date().toISOString()}});const startedAt=Date.now();
 try{const result=await closeAndSave(pending.publicId);await audit('teste-aba-323140',{message:result.message});}catch(e){await recordClosingPreflightFailure(pending.publicId,e,startedAt);await audit('teste-aba-323140-bloqueado',{message:e.message});}
}
// Recover only the remaining OK of the last linked creation. Never Save,
// navigate, prepare fields, upload photos, or mark this OS downloaded here.
async function recoverCreationOk(){
 if(running)return;
 const {lastDiagnostic,saveAttempts={},creationOkConfirmed={},finalRecording}=await chrome.storage.local.get(['lastDiagnostic','saveAttempts','creationOkConfirmed','finalRecording']);
 if(finalRecording?.active)return;
 const publicId=lastDiagnostic?.publicId;
 if(!publicId||lastDiagnostic.step!=='Criação salva e vinculada — encerramento pendente'||!saveAttempts[publicId]||creationOkConfirmed[publicId])return;
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='encerrar')return;
 const tabs=(await chrome.tabs.query({url:IMAS+'*'})).filter(tab=>{try{const url=new URL(tab.url);return url.origin===new URL(IMAS).origin&&url.pathname==='/ordem_servico_form.php'&&url.searchParams.get('id_ordem_servico')===job.externalNumber;}catch{return false;}});
 if(tabs.length!==1||running)return;
 running=true;
 try{
  const number=await engine(tabs[0],'savedNumber',{...job,phase:'criar'});if(number!==job.externalNumber)return;
  const [ok]=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'MAIN',func:confirmCreationSuccess});
  if(ok?.result?.clicked){await chrome.storage.local.set({creationOkConfirmed:{...creationOkConfirmed,[publicId]:number}});await audit('ok-criacao-recuperado',{publicId,osNumber:number,message:'Somente OK confirmado; sem repetir Salvar.'});}
 }finally{running=false;}
}
// One explicitly requested recovery test, executed in the user's authenticated
// Chrome. The run identity and official number prevent touching another OS.
async function resumeLocalUploadTest(){
 if(running)return;
 const {lastDiagnostic,localUploadTest,closeAttempts={},pending}=await chrome.storage.local.get(['lastDiagnostic','localUploadTest','closeAttempts','pending']);
 const publicId='3bddfdcd-3e60-4b44-b630-698fd364fbab';
 if(localUploadTest||lastDiagnostic?.runId!=='ad2de5c5-e361-4df1-90dd-19c7c9de05ba'||lastDiagnostic.state!=='failed'||lastDiagnostic.step!=='Localizar Enviar arquivos'||closeAttempts[publicId]||(pending&&pending.publicId!==publicId))return;
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));if(job.externalNumber!=='323930'||job.phase!=='encerrar')return;
 const tabs=await chrome.tabs.query({url:IMAS+'*'});if(tabs.length!==1||running)return;
 const url=new URL(tabs[0].url);if(url.origin!==new URL(IMAS).origin||url.pathname!=='/ordem_servico_form.php'||url.searchParams.get('id_ordem_servico')!=='323930')return;
 await chrome.storage.local.set({localUploadTest:{publicId,runId:lastDiagnostic.runId,at:new Date().toISOString()}});
 const result=await closeAndSave(publicId);await audit('teste-local-retomado',{publicId,message:result.message});
}
async function batchNext(){
 const {batch}=await chrome.storage.local.get('batch');if(!batch?.remaining?.length){await chrome.storage.local.remove('batch');return {message:'Fila revisada. Encerramento automático continua bloqueado.'};}
 const publicId=batch.remaining[0];await chrome.storage.local.set({batch:{...batch,remaining:batch.remaining.slice(1),current:publicId}});
 try{let result=await preview(publicId);const {pending}=await chrome.storage.local.get('pending');if(pending?.phase==='criar')result=await savePrepared(publicId);return {message:result.message+' Lote pausado; use Próxima OS para continuar.'};}catch(e){await chrome.storage.local.set({batch:{...batch,state:'interrompido'}});throw e;}
}
async function startBatch(publicIds){
 const {pending}=await chrome.storage.local.get('pending');if(pending||running)throw Error('Finalize ou libere a OS atual antes de executar todas.');
 const jobs=(await queue()).jobs.filter(j=>j.ready&&(!publicIds||publicIds.includes(j.publicId)));if(!jobs.length)throw Error('Nenhuma OS pronta na seleção.');
 await chrome.storage.local.set({batch:{remaining:jobs.map(j=>j.publicId),total:jobs.length,state:'revisão'}});return batchNext();
}
// Supervisor confirmed these six records in IMAS on 2026-10-07.
const reviewedReprocess={
 '694b9ac9-1db1-4b04-87a8-f59954d3a98d':'323081',
 '8e0a3519-9270-41fa-89ba-7ffdeba0dba5':'323082',
 'c04fdfbf-ac1a-4e42-a352-f7181579e1b1':'323157',
 '5af21cf9-95b6-4757-af7a-0208bacfe212':'323164',
 'e86cfa06-4347-41f4-85d2-df2203e03ee0':'323165',
 'a677c3d4-75ef-4f40-bb3c-04c030ab14c8':'323166'
};
async function startReviewedReprocess(){
 const state=await chrome.storage.local.get(['batch','pending','reviewedReprocess','finalRecording']);
 if(running||automaticBatchRunning||state.finalRecording?.active)throw Error('Aguarde a execução/gravação atual terminar.');
 if(state.reviewedReprocess)throw Error('Este reprocessamento já foi liberado. Confira o relatório; não repetir fotos.');
 if(state.pending&&!reviewedReprocess[state.pending.publicId])throw Error('Há outra OS em revisão. Preserve essa edição.');
 const jobs=(await queue()).jobs.filter(j=>reviewedReprocess[j.publicId]===j.externalNumber);
 if(!jobs.length)throw Error('As seis OS já saíram da fila. Nada será repetido.');
 const tab=await imasTab();await loaded(tab.id);
 if(new URL((await chrome.tabs.get(tab.id)).url).pathname==='/ordem_servico_form.php'){
  const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.getElementById('id_ordem_servico')?.value||''});
  if(!Object.values(reviewedReprocess).includes(r?.result))await prepareAutomaticBatchStart();
  else await leaveSavedBatchForm(r.result);
 }
 const history=(await chrome.storage.local.get('batchHistory')).batchHistory||[];
 await chrome.alarms.clear('rco-imas-batch');
 await chrome.storage.local.set({batchHistory:[...history,{batch:state.batch,pending:state.pending,at:new Date().toISOString()}].slice(-10),reviewedReprocess:Object.fromEntries(jobs.map(j=>[j.publicId,{number:j.externalNumber,state:'authorized',photos:j.externalNumber==='323157'?'preserve':'empty-confirmed'}]))});
 if(state.pending)await chrome.storage.local.remove('pending');
 await chrome.storage.local.remove('batch');
 return startAutomaticBatch(jobs.map(j=>j.publicId));
}
async function startReviewed166Final(){
 const id='a677c3d4-75ef-4f40-bb3c-04c030ab14c8';
 const state=await chrome.storage.local.get(['pending','batch','finalRecording','reviewedReprocess','reviewed166Final']);
 if(running||automaticBatchRunning||state.finalRecording?.active)throw Error('Aguarde a execução/gravação atual terminar.');
 if(state.reviewed166Final)throw Error('A retomada da 323166 já foi liberada. Confira o relatório antes de repetir.');
 if(state.pending&&state.pending.publicId!==id)throw Error('Há outra OS em revisão. Preserve essa edição.');
 const job=(await queue()).jobs.find(j=>j.publicId===id&&j.externalNumber==='323166'&&j.phase==='encerrar');if(!job)throw Error('323166 já saiu da fila. Nada será repetido.');safeJob(job);
 const tab=await imasTab();await loaded(tab.id);
 if(new URL((await chrome.tabs.get(tab.id)).url).pathname==='/ordem_servico_form.php'){
  const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.getElementById('id_ordem_servico')?.value||''});
  if(r?.result==='323166')await leaveSavedBatchForm('323166');else await prepareAutomaticBatchStart();
 }
 const {batchHistory=[]}=await chrome.storage.local.get('batchHistory');
 await chrome.alarms.clear('rco-imas-batch');
 await chrome.storage.local.set({batchHistory:[...batchHistory,{batch:state.batch,pending:state.pending,at:new Date().toISOString()}].slice(-10),reviewed166Final:{at:new Date().toISOString(),publicId:id,number:'323166'},reviewedReprocess:{...state.reviewedReprocess,[id]:{number:'323166',state:'authorized',photos:'preserve'}}});
 if(state.pending)await chrome.storage.local.remove('pending');await chrome.storage.local.remove('batch');
 await audit('retomada-323166-fotos-preservadas',{publicId:id,osNumber:'323166'});
 return startAutomaticBatch([id]);
}
async function reprocessReviewedJob(job){
 const {reviewedReprocess:authorization={}}=await chrome.storage.local.get('reviewedReprocess');const permit=authorization[job.publicId];
 if(permit?.state!=='authorized'||permit.number!==job.externalNumber||reviewedReprocess[job.publicId]!==job.externalNumber||job.phase!=='encerrar')throw Error('OS fora da autorização de reprocessamento.');
 // Consume before any page operation, so a restart cannot repeat this upload.
 await chrome.storage.local.set({reviewedReprocess:{...authorization,[job.publicId]:{...permit,state:'started',at:new Date().toISOString()}}});
 const tab=await imasTab();await openForm(tab,job);await loaded(tab.id);await engine(tab,'ensurePhotoSection');await wait(2000);
 const linked=await engine(tab,'linkedPhotos',job);
 if(permit.photos==='empty-confirmed'){
  if(linked.count!==0)throw Error('Há fotos no IMAS. Não repetir envio; conferir esta OS.');
  const {closeAttempts={}}=await chrome.storage.local.get('closeAttempts');await audit('reprocessamento-sem-fotos-confirmado',{publicId:job.publicId,osNumber:job.externalNumber,previous:closeAttempts[job.publicId]||null});
  delete closeAttempts[job.publicId];await chrome.storage.local.set({closeAttempts});
  return closeAndSave(job.publicId);
 }
 if(linked.count<job.report.photos.length)throw Error('Não foi possível confirmar todas as fotos existentes. Nenhuma foto será reenviada.');
 // Refill fields only. Never call addPhoto, preview or an upload routine here.
 running=true;activeRun={runId:crypto.randomUUID(),publicId:job.publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Repreencher dados sem reenviar fotos',events:[],controls:[],tabId:tab.id};
 try{
  await engine(tab,'prepare',job);await engine(tab,'observations',job.report.observations);
  const [editor]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:syncObservationEditor,args:[job.report.observations]});if(!editor?.result)throw Error('Editor de observação não respondeu.');
  const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos/fotos divergentes: '+checked.errors.join('; '));
  const {closeAttempts={}}=await chrome.storage.local.get('closeAttempts');
  await chrome.storage.local.set({closeAttempts:{...closeAttempts,[job.publicId]:{externalNumber:job.externalNumber,step:'save',at:new Date().toISOString()}},pending:{publicId:job.publicId,phase:'encerrar',tabId:tab.id,job,audit:checked,state:'repreenchida — fotos preservadas'}});
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
 const {pending}=await chrome.storage.local.get('pending');return resumeClosingFinal(job,pending);
}

// Supervisor approval routes an existing OS through a read-before-resume branch.
// Existing preparation, photo upload and final Save/OK functions remain unchanged.
async function prepareApprovedBatchStart(jobs){
 const tab=await imasTab(),url=new URL(tab.url);
 if(url.pathname!=='/ordem_servico_form.php')return;
 const expected=jobs.find(j=>j.approvalRequest&&j.externalNumber===url.searchParams.get('id_ordem_servico'));
 if(!expected)return prepareAutomaticBatchStart();
 const [identity]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:number=>location.origin==='https://admin.rcoengenharia.com'&&document.getElementById('id_ordem_servico')?.value===number&&document.getElementById('id_cliente')?.value==='91'&&Number(window.jQuery?.active||0)===0&&![...document.querySelectorAll('input[type="file"]')].some(i=>i.files?.length),args:[expected.externalNumber]});
 if(!identity?.result)throw Error('O IMAS ainda está enviando arquivos ou tem uma edição pendente. A aprovação continua na fila.');
 await chrome.tabs.update(tab.id,{url:IMAS+'ordem_servico_rel.php'});await loaded(tab.id);
}
async function processApprovedClosing(job){
 safeJob(job);if(job.phase!=='encerrar')throw Error('Retomada exige número oficial do IMAS.');
 const tab=await imasTab();await openForm(tab,job);await loaded(tab.id);await engine(tab,'ensurePhotoSection',job);await wait(2000);
 const [idle]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>Number(window.jQuery?.active||0)===0});if(!idle?.result)throw Error('Envio pendente no IMAS. Nenhuma foto será repetida.');
 const linked=await engine(tab,'linkedPhotos',job);
 const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});
 if(persisted.ok&&linked.count>=job.report.photos.length){
  activeRun={runId:crypto.randomUUID(),publicId:job.publicId,version:chrome.runtime.getManifest().version,state:'completed',step:'Encerramento confirmado',events:[],controls:[],tabId:tab.id};
  try{await message(await rcoTab(),{action:'baixar',publicId:job.publicId,osNumber:job.externalNumber});await trace('OS já encerrada — baixa confirmada','ok');await syncDiagnostic(true);await audit('encerramento-confirmado',{publicId:job.publicId,osNumber:job.externalNumber,photos:linked.count});return;}finally{activeRun=null;}
 }
 if(linked.count===0){
  // A new explicit approval plus a live empty gallery is required to clear this
  // report's old upload marker. No other report or creation marker is changed.
  const {closeAttempts={}}=await chrome.storage.local.get('closeAttempts');delete closeAttempts[job.publicId];await chrome.storage.local.set({closeAttempts});
  return closeAndSave(job.publicId);
 }
 if(linked.count!==job.report.photos.length)throw Error('Fotos existentes divergentes. OS permanece em revisão; nenhuma foto foi reenviada.');
 running=true;activeRun={runId:crypto.randomUUID(),publicId:job.publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Retomar dados preservando fotos',events:[],controls:[],tabId:tab.id};
 try{
  await engine(tab,'prepare',job);await engine(tab,'observations',job.report.observations);
  const [editor]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:syncObservationEditor,args:[job.report.observations]});if(!editor?.result)throw Error('Editor de observação não respondeu.');
  const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos/fotos divergentes: '+checked.errors.join('; '));
  const {closeAttempts={}}=await chrome.storage.local.get('closeAttempts');await chrome.storage.local.set({closeAttempts:{...closeAttempts,[job.publicId]:{externalNumber:job.externalNumber,step:'save',at:new Date().toISOString()}},pending:{publicId:job.publicId,phase:'encerrar',tabId:tab.id,job,audit:checked,state:'dados preenchidos — fotos preservadas'}});
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
 return resumeClosingFinal(job,(await chrome.storage.local.get('pending')).pending);
}
// Explicitly started automatic batch: one OS per alarm, durable progress, no replay.
let automaticBatchRunning=false;
async function leaveSavedBatchForm(number){
 const tab=await imasTab();
 const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:expected=>location.origin==='https://admin.rcoengenharia.com'&&location.pathname==='/ordem_servico_form.php'&&document.getElementById('id_ordem_servico')?.value===expected,args:[number]});
 if(r?.result!==true)throw Error('A aba mudou após salvar. Lote pausado; nenhuma navegação será repetida.');
 await chrome.tabs.update(tab.id,{url:IMAS+'ordem_servico_rel.php'});await loaded(tab.id);
}
async function prepareAutomaticBatchStart(){
 const tab=await imasTab();
 if(new URL(tab.url).pathname!=='/ordem_servico_form.php')return;
 const {lastDiagnostic,audit:events=[]}=await chrome.storage.local.get(['lastDiagnostic','audit']);
 const saved=lastDiagnostic?.state==='completed'&&[...events].reverse().find(e=>e.kind==='encerramento-confirmado'&&e.publicId===lastDiagnostic.publicId&&/^\d+$/.test(e.osNumber));
 if(!saved)throw Error('Há um formulário em edição. Volte à lista de OS antes de iniciar o lote.');
 await leaveSavedBatchForm(saved.osNumber);
}
async function leaveFailedBatchForm(job){
 const tab=await imasTab();const url=new URL(tab.url);
 if(url.origin!=='https://admin.rcoengenharia.com')throw Error('A aba do IMAS mudou.');
 if(url.pathname==='/ordem_servico_form.php'){
  const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.getElementById('id_ordem_servico')?.value||'',args:[]});
  if(job?.externalNumber&&r?.result!==job.externalNumber)throw Error('Outro formulário aberto; não descartar edição.');
  await chrome.tabs.update(tab.id,{url:IMAS+'ordem_servico_rel.php'});await loaded(tab.id);
 }
}
async function finishAutomaticBatch(batch){
 const finished={...batch,state:'concluído',finishedAt:new Date().toISOString(),current:null};
 await chrome.storage.local.set({batch:finished});await audit('lote-automatico-concluido',{completed:finished.completed,skipped:finished.skipped});
}
async function startAutomaticBatch(publicIds){
 const {pending,batch,closeAttempts={},saveAttempts={},finalRecording}=await chrome.storage.local.get(['pending','batch','closeAttempts','saveAttempts','finalRecording']);
 if(running||automaticBatchRunning||pending||finalRecording?.active)throw Error('Finalize a revisão/gravação atual antes de executar todas.');
 if(batch?.automatic&&batch.state==='executando')throw Error('O lote já está em execução.');
 const requested=publicIds?new Set(publicIds):null,selected=(await queue()).jobs.filter(j=>!requested||requested.has(j.publicId));
 const {reviewedReprocess:reviewPermits={}}=await chrome.storage.local.get('reviewedReprocess');
 const eligible=[],skipped=[];
 for(const job of selected){
  const reason=!job.ready?job.errors.join('; '):!job.approvalRequest&&(finishedTestNumbers.has(job.externalNumber)||job.externalNumber==='323145')?'OS dos testes anteriores: conferir manualmente':!job.approvalRequest&&(closeAttempts[job.publicId]||saveAttempts[job.publicId])&&reviewPermits[job.publicId]?.state!=='authorized'?'Tentativa anterior: conferir antes de repetir':'';
  if(reason)skipped.push({publicId:job.publicId,reference:job.externalNumber||job.reference,reason});else eligible.push(job);
 }
 if(eligible.length)await prepareApprovedBatchStart(eligible);
 const state={automatic:true,runId:crypto.randomUUID(),remaining:eligible.map(j=>j.publicId),total:eligible.length,selected:selected.length,completed:[],skipped,state:eligible.length?'executando':'concluído',startedAt:new Date().toISOString(),current:null};
 if(batch){const {batchHistory=[]}=await chrome.storage.local.get('batchHistory');await chrome.storage.local.set({batchHistory:[...batchHistory,batch].slice(-30)});}
 await chrome.storage.local.set({batch:state});await audit('lote-automatico-iniciado',{total:state.total,skipped});
 if(eligible.length)await chrome.alarms.create('rco-imas-batch',{when:Date.now()+1000});
 return {message:`Lote iniciado: ${eligible.length} OS prontas; ${skipped.length} separadas para conferência. A extensão seguirá uma por vez. Use Parar lote para interromper após a OS atual.`};
}
async function automaticBatchStep(){
 if(automaticBatchRunning||running)return;
 let {batch,pending,finalRecording}=await chrome.storage.local.get(['batch','pending','finalRecording']);
 if(!batch?.automatic||batch.state!=='executando')return;
 if(batch.current||pending||finalRecording?.active){await chrome.storage.local.set({batch:{...batch,state:'interrompido',error:'Há uma OS em revisão ou uma execução anterior sem confirmação. Nenhuma foto será reenviada.'}});return;}
 if(!batch.remaining.length){await chrome.storage.local.set({batch:{...batch,state:'concluído'}});return;}
 automaticBatchRunning=true;const publicId=batch.remaining[0],startedAt=Date.now();
 try{
  let job=(await queue()).jobs.find(j=>j.publicId===publicId);
  const before=(await chrome.storage.local.get('batch')).batch;if(before?.runId!==batch.runId||before.state!=='executando')return;
  if(!job){batch={...batch,remaining:batch.remaining.slice(1),skipped:[...batch.skipped,{publicId,reason:'OS já saiu da fila'}]};await chrome.storage.local.set({batch});}
  else{
   safeJob(job);
   const attempts=await chrome.storage.local.get(['closeAttempts','saveAttempts','reviewedReprocess']);
   const reviewed=attempts.reviewedReprocess?.[publicId]?.state==='authorized';
   if(!job.approvalRequest&&!reviewed&&(attempts.closeAttempts?.[publicId]||attempts.saveAttempts?.[publicId]))throw Error('Tentativa anterior detectada. Não repetir envio/criação.');
   const approved=!!job.approvalRequest;
   if(approved)await message(await rcoTab(),{action:'approval-claim',publicId,requestId:job.approvalRequest.requestId});
   batch={...batch,current:publicId};await chrome.storage.local.set({batch});
   if(job.phase==='criar'){
    await createAndSave(publicId);
    const state=await chrome.storage.local.get('pending');
    job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
    if(!state.pending?.successAcknowledged||state.pending.publicId!==publicId||state.pending.externalNumber!==job.externalNumber||job.phase!=='encerrar')throw Error('Criação não vinculada/confirmada. Lote pausado.');
    await leaveSavedBatchForm(job.externalNumber);await chrome.storage.local.remove('pending');
   }
   if(approved)await processApprovedClosing(job);else if(reviewed)await reprocessReviewedJob(job);else await closeAndSave(publicId);
   // closeAndSave already verifies persisted fields/photos and app baixa.
   const latest=(await chrome.storage.local.get('batch')).batch;
   if(!latest||latest.runId!==batch.runId)return;
   batch={...latest,current:null,remaining:latest.remaining.slice(1),completed:[...latest.completed,{publicId,reference:job.externalNumber,at:new Date().toISOString()}]};await chrome.storage.local.set({batch});
   await audit('lote-os-confirmada',{publicId,osNumber:job.externalNumber});
   await leaveSavedBatchForm(job.externalNumber);
  }
  const latest=(await chrome.storage.local.get('batch')).batch;
  if(latest?.runId===batch.runId&&latest.state==='executando'){
   if(latest.remaining.length)await chrome.alarms.create('rco-imas-batch',{when:Date.now()+2000});
   else await finishAutomaticBatch(latest);
  }
 }catch(e){
  try{await recordClosingPreflightFailure(publicId,e,startedAt);}catch{}
  const state=await chrome.storage.local.get(['batch','pending','lastDiagnostic']);const latest=state.batch;
  if(latest?.runId===batch.runId){
   const job=(await queue().catch(()=>({jobs:[]}))).jobs.find(j=>j.publicId===publicId);
   const review={publicId,reference:job?.externalNumber||job?.reference||publicId,reason:e.message,at:new Date().toISOString(),pending:state.pending?.publicId===publicId?state.pending:null,diagnostic:state.lastDiagnostic?.publicId===publicId?state.lastDiagnostic:null};
   const next={...latest,current:null,remaining:latest.remaining.filter(id=>id!==publicId),skipped:[...latest.skipped,review]};
   await chrome.storage.local.set({batch:next});
   if(state.pending?.publicId===publicId)await chrome.storage.local.remove('pending');
   try{await leaveFailedBatchForm(job);}catch(nav){await audit('lote-navegacao-pendente',{publicId,message:nav.message});}
   await audit('lote-os-pendente-avaliacao',{publicId,message:e.message});
   if(next.state==='executando'){if(next.remaining.length)await chrome.alarms.create('rco-imas-batch',{when:Date.now()+2000});else await finishAutomaticBatch(next);}
  }
 }
 finally{automaticBatchRunning=false;}
}
async function stopAutomaticBatch(){
 await chrome.storage.local.set({autoSendEnabled:false});await chrome.alarms.clear('rco-imas-batch');const {batch}=await chrome.storage.local.get('batch');
 if(batch?.automatic){await chrome.storage.local.set({batch:{...batch,state:'parado'}});return {message:'Lote parado. A OS em execução será concluída; as próximas não serão iniciadas.'};}
 await chrome.storage.local.remove('batch');return {message:'Lote interrompido. A OS aberta foi preservada.'};
}
async function restoreAutomaticBatch(){
 const {batch}=await chrome.storage.local.get('batch');if(!batch?.automatic||batch.state!=='executando')return;
 if(batch.current){await chrome.storage.local.set({batch:{...batch,state:'interrompido',error:'Extensão reiniciou durante uma OS. Conferir esta OS; nenhum passo será repetido.'}});return;}
 if(!await chrome.alarms.get('rco-imas-batch'))await chrome.alarms.create('rco-imas-batch',{when:Date.now()+2000});
}

// Read the authenticated supervisor queue once per minute; the existing batch
// runner remains the only code that fills, uploads and saves an OS.
let intakeChecking=false;
async function checkIncomingReports(drainBacklog=false){
 if(intakeChecking||running||automaticBatchRunning)return;
 intakeChecking=true;
 try{
  const {autoSendEnabled=true,pending,batch,finalRecording,closeAttempts={},saveAttempts={},autoSeen=[],scheduledBacklogPending=false}=await chrome.storage.local.get(['autoSendEnabled','pending','batch','finalRecording','closeAttempts','saveAttempts','autoSeen','scheduledBacklogPending']);
  if(pending||finalRecording?.active||batch?.state==='executando')return;
  const data=await queue();const backlog=drainBacklog||scheduledBacklogPending;
  const fresh=data.jobs.filter(j=>j.ready&&(!['processing','changed','failed','queued'].includes(j.report?.automationState)||j.approvalRequest)&&(j.approvalRequest||(autoSendEnabled||backlog)&&(backlog||!autoSeen.includes(j.publicId))&&!closeAttempts[j.publicId]&&!saveAttempts[j.publicId]&&!finishedTestNumbers.has(j.externalNumber)&&j.externalNumber!=='323145'&&j.externalNumber!=='323902'));
  if(!fresh.length){if(backlog){await chrome.storage.local.set({scheduledBacklogPending:false});await audit('fila-agendada-sem-os-prontas',{total:data.jobs.length});}return;}
  // Mark only after the batch was accepted. Old attempt markers are never reset.
  await startAutomaticBatch(fresh.map(j=>j.publicId));
  await chrome.storage.local.set({autoSeen:[...new Set([...autoSeen,...fresh.map(j=>j.publicId)])].slice(-5000),...(backlog?{scheduledBacklogPending:false}:{})});
 }catch(e){await audit('envio-automatico-pendente',{message:e.message});}
 finally{intakeChecking=false;}
}
async function initIntake(){if(!await chrome.alarms.get('rco-intake'))await chrome.alarms.create('rco-intake',{periodInMinutes:1});}
async function verifyReview(publicId){
 if(running||automaticBatchRunning||(await chrome.storage.local.get('pending')).pending)throw Error('Aguarde a execução ou revisão atual terminar.');
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='encerrar'||job.externalNumber==='323902')throw Error('Não há encerramento verificável para esta OS.');
 running=true;activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Verificar revisão sem alterar IMAS',events:[],controls:[]};
 try{
  const tab=await imasTab();const currentUrl=new URL(tab.url);if(currentUrl.pathname!=='/ordem_servico_form.php'||currentUrl.searchParams.get('id_ordem_servico')!==job.externalNumber)await prepareAutomaticBatchStart();await openForm(tab,job);await chrome.tabs.reload(tab.id);await loaded(tab.id);activeRun.tabId=tab.id;
  const [identity]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:number=>location.origin==='https://admin.rcoengenharia.com'&&location.pathname==='/ordem_servico_form.php'&&new URL(location.href).searchParams.get('id_ordem_servico')===number&&document.getElementById('id_ordem_servico')?.value===number&&document.getElementById('id_cliente')?.value==='91',args:[job.externalNumber]});
  if(!identity?.result)throw Error('Número ou cliente divergente. Nenhuma baixa confirmada.');
  await engine(tab,'ensurePhotoSection',job);await wait(2000);
  const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});
  const linked=await engine(tab,'linkedPhotos',job);
  if(!persisted.ok||linked.count<job.report.photos.length)throw Error('Revisão necessária: '+(persisted.errors.join('; ')||'fotos não confirmadas'));
  await message(await rcoTab(),{action:'baixar',publicId,osNumber:job.externalNumber});
  activeRun.state='completed';await trace('Encerramento verificado — baixa confirmada','ok');await syncDiagnostic(true);
  await audit('encerramento-confirmado',{publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:'OS '+job.externalNumber+': baixa confirmada pela leitura do IMAS. Nenhuma foto ou campo foi alterado.'};
 }catch(e){activeRun.state='failed';await trace('Verificar revisão','failed',{message:e.message});await syncDiagnostic(true);throw e;}
 finally{running=false;activeRun=null;}
}

async function schedule(){
 const policy='weekdays-07-first-20261008-1545';let {scheduleEnabled=true,schedulePolicy}=await chrome.storage.local.get(['scheduleEnabled','schedulePolicy']);
 if(schedulePolicy!==policy){scheduleEnabled=true;await chrome.storage.local.set({scheduleEnabled:true,schedulePolicy:policy});}
 await chrome.alarms.clear('rco-imas');if(scheduleEnabled)await chrome.alarms.create('rco-imas',{when:nextSlot()});
}
async function tick(){
 try{
  await chrome.storage.local.set({lastScheduleAt:new Date().toISOString(),scheduledBacklogPending:true});
  await audit('fila-agendada-iniciada',{message:'Processar OS prontas/liberadas sem repetir fotos nem tentativas pendentes.'});
  await checkIncomingReports(true);
 }catch(e){await audit('agenda-bloqueada',{message:e.message});}finally{await schedule();}
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='rco-intake')checkIncomingReports();if(alarm.name==='rco-imas-batch')automaticBatchStep().catch(e=>audit('lote-bloqueado',{message:e.message}));if(alarm.name==='rco-imas')tick();if(alarm.name==='rco-source-update')checkSourceUpdate().catch(e=>audit('atualizacao-bloqueada',{message:e.message}));});
chrome.runtime.onInstalled.addListener(()=>{schedule();initUpdates();initIntake();reconnectRco();});chrome.runtime.onStartup.addListener(()=>{schedule();initUpdates();initIntake();});
async function recordClosingPreflightFailure(publicId,error,startedAt){
 if(running||/protegida/.test(error.message))return; // Never overwrite another live execution or inspect a protected OS.
 const {lastDiagnostic,pending}=await chrome.storage.local.get(['lastDiagnostic','pending']);
 if(lastDiagnostic?.publicId===publicId&&lastDiagnostic.version===chrome.runtime.getManifest().version&&lastDiagnostic.events?.some(e=>Date.parse(e.at)>=startedAt))return;
 let controls=[];if(pending?.publicId===publicId&&pending.tabId){try{controls=await engine({id:pending.tabId},'diagnostics');}catch{}}
 activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'failed',step:'Conferir encerramento antes do envio',events:[],controls,tabId:pending?.tabId};
 try{await trace('Conferir encerramento antes do envio','failed',{message:error.message});await syncDiagnostic(true);}finally{activeRun=null;}
}
let completeTestRunning=false;
async function completeAuthorizedTest(publicId){
 if(publicId!=='d6dcc54e-0d1c-4fc6-9372-5862941c0dba')throw Error('Teste completo não autorizado para esta OS.');
 if(running||completeTestRunning)throw Error('Aguarde a execução terminar.');
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 const {pending,completeD6Test,saveAttempts={},closeAttempts={},navigationRecoveryD6}=await chrome.storage.local.get(['pending','completeD6Test','saveAttempts','closeAttempts','navigationRecoveryD6']);
 const recoverNavigation=completeD6Test?.publicId===publicId&&completeD6Test.state==='failed'&&completeD6Test.message==='Há outro formulário de OS aberto. Termine ou descarte essa edição antes do teste.'&&job.phase==='encerrar'&&job.externalNumber==='323963'&&!!saveAttempts[publicId]&&!closeAttempts[publicId]&&!navigationRecoveryD6;
 if(completeD6Test&&!recoverNavigation)throw Error('Este teste completo já foi iniciado. Confira a auditoria antes de qualquer retomada; nada será repetido.');
 if(pending&&pending.publicId!==publicId)throw Error('Há outra OS em revisão. Libere apenas o preparo anterior antes de iniciar este teste.');
 completeTestRunning=true;
 if(recoverNavigation){await chrome.storage.local.set({navigationRecoveryD6:{at:new Date().toISOString(),osNumber:'323963'}});await audit('retomar-encerramento-apos-criacao',{publicId,osNumber:'323963',message:'Criação já vinculada; nenhuma tentativa de fotos ou encerramento anterior.'});}
 await chrome.storage.local.set({completeD6Test:{publicId,state:'started',at:new Date().toISOString()}});
 try{
  if(job.phase==='criar')await createAndSave(publicId);
  const fresh=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
  if(fresh.phase!=='encerrar'||!fresh.externalNumber)throw Error('Número oficial ainda não voltou à plataforma. Encerramento não iniciado.');
  const {pending:created}=await chrome.storage.local.get('pending');
  if(created?.phase==='criar'){
   if(created.publicId!==publicId||!created.successAcknowledged||created.externalNumber!==fresh.externalNumber)throw Error('Criação ainda não confirmada. Nada foi reenviado.');
   await chrome.storage.local.remove('pending');
  }
  const result=await closeAndSave(publicId);
  await chrome.storage.local.set({completeD6Test:{publicId,state:'completed',osNumber:fresh.externalNumber,at:new Date().toISOString()}});
  return result;
 }catch(e){await chrome.storage.local.set({completeD6Test:{publicId,state:'failed',message:e.message,at:new Date().toISOString()}});await audit('teste-completo-falhou',{publicId,message:e.message});throw e;}finally{completeTestRunning=false;}
}
async function confirmManual323963(){
 if(running||completeTestRunning)return;
 const id='d6dcc54e-0d1c-4fc6-9372-5862941c0dba';
 const {pending,closeAttempts={},manual323963Checked}=await chrome.storage.local.get(['pending','closeAttempts','manual323963Checked']);
 if(manual323963Checked||pending?.publicId!==id||pending.phase!=='encerrar'||closeAttempts[id]?.step!=='save')return;
 const job=(await queue()).jobs.find(j=>j.publicId===id);
 if(!job)return;
 safeJob(job);if(job.externalNumber!=='323963')throw Error('Número oficial divergente. Conferência bloqueada.');
 const tabs=(await chrome.tabs.query({url:IMAS+'*'})).filter(t=>{try{const u=new URL(t.url);return u.origin===new URL(IMAS).origin&&u.pathname==='/ordem_servico_form.php'&&u.searchParams.get('id_ordem_servico')==='323963';}catch{return false;}});
 if(tabs.length!==1)return;
 const tab=tabs[0];
 const [dialog]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:confirmCreationSuccess,args:['323963','enter']});
 if(dialog?.result?.enterRequired)throw Error('O OK ainda está aberto. Conferência após OK manual aguarda fechamento.');
 running=true;activeRun={runId:crypto.randomUUID(),publicId:id,version:chrome.runtime.getManifest().version,state:'running',step:'Conferir baixa após OK manual',events:[],controls:[],tabId:tab.id};
 await chrome.storage.local.set({manual323963Checked:{at:new Date().toISOString()}});
 try{
  const key=photos=>JSON.stringify(photos.map(p=>[p.publicId||'',p.url]));
  if(key(pending.job.report.photos)!==key(job.report.photos))throw Error('Evidências alteradas desde o salvamento. Baixa não registrada.');
  await trace('Reler 323963 após OK manual — sem salvar nem reenviar');
  await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2000);
  const checked=await engine(tab,'audit',{...job,verifyUploaded:true}),linked=await engine(tab,'linkedPhotos',job);
  if(!checked.ok||linked.count!==job.report.photos.length)throw Error('Dados ou fotos persistidos não confirmados. Baixa não registrada.');
  await trace('Confirmar baixa na plataforma');await message(await rcoTab(),{action:'baixar',publicId:id,osNumber:'323963'});
  await chrome.storage.local.remove('pending');await chrome.storage.local.set({completeD6Test:{publicId:id,state:'completed',osNumber:'323963',at:new Date().toISOString()}});
  activeRun.state='completed';await trace('OS encerrada e baixa confirmada após OK manual','ok');await syncDiagnostic(true);await audit('encerramento-confirmado-apos-ok-manual',{publicId:id,osNumber:'323963',photos:linked.count});
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
}
async function resumeNamedCompleteTest(){
 if(running||completeTestRunning)return;
 const {completeD6Test,pending,navigationRecoveryD6}=await chrome.storage.local.get(['completeD6Test','pending','navigationRecoveryD6']);
 if(completeD6Test&&!(completeD6Test.state==='failed'&&completeD6Test.message==='Há outro formulário de OS aberto. Termine ou descarte essa edição antes do teste.'&&!navigationRecoveryD6))return;
 const id='d6dcc54e-0d1c-4fc6-9372-5862941c0dba';
 if(pending&&pending.publicId!==id)return;
 const job=(await queue()).jobs.find(j=>j.publicId===id);
 if(!job?.ready||job.errors?.length)return;
 try{await completeAuthorizedTest(id);}catch(e){
  const {lastDiagnostic}=await chrome.storage.local.get('lastDiagnostic');
  if(lastDiagnostic?.publicId!==id){activeRun={runId:crypto.randomUUID(),publicId:id,version:chrome.runtime.getManifest().version,state:'failed',step:'Iniciar teste completo',events:[],controls:[]};try{await trace('Iniciar teste completo','failed',{message:e.message});await syncDiagnostic(true);}finally{activeRun=null;}}
  await audit('teste-completo-bloqueado',{publicId:id,message:e.message});
 }
}
// Recording mode restores the tested Save flow with the last OK left to the user.
// All operational field/upload/Save functions remain unchanged.
let recordingWrites=Promise.resolve();
const finishedTestNumbers=new Set(['323080','323140','323902','323930','323963','323964']);
async function startFinalRecording(publicId){
 if(running)throw Error('Inicie a gravação antes de executar a OS.');
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(finishedTestNumbers.has(job.externalNumber))throw Error('Esta OS já foi encerrada. Escolha outra da fila; nenhum teste será repetido.');
 const old=(await chrome.storage.local.get('finalRecording')).finalRecording;
 if(old?.active)throw Error('Já há uma gravação ativa. Finalize antes de iniciar outra.');
 const tab=await imasTab();await chrome.tabs.update(tab.id,{active:true});await loaded(tab.id);
 const recording={active:true,runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,tabId:tab.id,expectedNumber:job.externalNumber||null,state:'running',step:'Gravando etapa final — OK manual',events:[],controls:[],startedAt:new Date().toISOString()};
 await chrome.storage.local.set({finalRecording:recording});
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['imas.js']});
 await audit('gravacao-final-iniciada',{publicId});
 return {message:'Gravação ativa nesta OS. Execute a automação. Ela envia as fotos e clica Salvar; confirme o OK manualmente em até 2 minutos. Depois finalize a gravação.'};
}
async function saveRecordingEvent(m,sender){
 const s=(await chrome.storage.local.get('finalRecording')).finalRecording;
 const e=m.event;if(!s?.active||s.runId!==m.runId||s.tabId!==sender.tab?.id||!e||!['salvar','ok','enter-ok','ok-fechado'].includes(e.kind))return;
 const osNumber=/^\d{1,12}$/.test(String(e.osNumber))?String(e.osNumber):null;
 if(s.expectedNumber&&osNumber!==s.expectedNumber)return;
 const finite=v=>Number.isFinite(v)&&Math.abs(v)<100000?Math.round(v):0;
 const point=e.point?Object.fromEntries(['x','y','cx','cy','w','h'].map(k=>[k,finite(e.point[k])])):null;
 const viewport=e.viewport?Object.fromEntries(['w','h','dpr','sx','sy'].map(k=>[k,k==='dpr'&&Number.isFinite(e.viewport[k])?Math.round(e.viewport[k]*1000)/1000:finite(e.viewport[k])])):null;
 const entry={at:new Date().toISOString(),kind:e.kind,osNumber,trusted:e.trusted===true,selector:String(e.selector||'').slice(0,160),tag:String(e.tag||'').slice(0,15),key:e.key==='Enter'?'Enter':'',point,viewport};
 s.events=[...s.events,{at:entry.at,step:'Gravação: '+entry.kind,status:'ok',path:'/ordem_servico_form.php',message:JSON.stringify({os:osNumber,trusted:entry.trusted,p:point,v:viewport}).slice(0,300)}].slice(-60);
 s.recorded=[...(s.recorded||[]),entry].slice(-60);
 if(entry.selector)s.controls=[...s.controls,{id:'',name:'',type:'button',label:entry.kind,selector:entry.selector}].slice(-60);
 s.step='Gravação: '+entry.kind;
 if(entry.kind==='ok-fechado')s.confirmedAt=entry.at;
 await chrome.storage.local.set({finalRecording:s});
 try{await message(await rcoTab(),{action:'diagnostic',run:s});}catch{ /* locally retained; Finish retries sync */ }
}
async function stopFinalRecording(){
 if(running)throw Error('Aguarde a automação terminar antes de finalizar.');
 await recordingWrites;
 const s=(await chrome.storage.local.get('finalRecording')).finalRecording;
 if(!s)throw Error('Nenhuma gravação disponível.');
 s.active=false;s.state=s.confirmedAt?'completed':'review';s.step='Gravação finalizada';
 await chrome.storage.local.set({finalRecording:s});
 try{await message(await rcoTab(),{action:'diagnostic',run:s});return {message:'Gravação finalizada e enviada ao app. Os parâmetros estão na auditoria da OS.'};}catch{return {message:'Gravação preservada na extensão. Abra RCO como Supervisor e finalize novamente para enviar.'};}
}
async function manualFinalConfirmation(tabId,number){
 let s=(await chrome.storage.local.get('finalRecording')).finalRecording;
 if(!s?.active)return null;
 if(s.tabId!==tabId||s.publicId!==activeRun?.publicId)throw Error('A gravação está vinculada a outra aba ou OS. Nenhum OK automático será enviado.');
 const probe=async()=>{const [r]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:confirmCreationSuccess,args:[number,'observe']});return r?.result?.open===true;};
 const consume=async()=>{
  s=(await chrome.storage.local.get('finalRecording')).finalRecording;
  const save=s?.recorded?.findLast(e=>e.kind==='salvar');
  const action=s?.recorded?.findLast(e=>['ok','enter-ok'].includes(e.kind)&&e.trusted);
  const closed=s?.recorded?.findLast(e=>e.kind==='ok-fechado');
  if(save&&action&&closed&&Date.parse(action.at)>=Date.parse(save.at)&&Date.parse(closed.at)>=Date.parse(action.at)&&closed.at!==s.consumedAt&&(!number||closed.osNumber===number)&&!await probe()){
   await chrome.storage.local.set({finalRecording:{...s,consumedAt:closed.at}});
   await audit('ok-manual-gravado',{publicId:activeRun.publicId,osNumber:closed.osNumber});return {result:{clicked:true}};
  }
  return null;
 };
 const already=await consume();if(already)return already;
 if(!await probe())return {result:{clicked:false}};
 const since=Date.now();await trace('Aguardando seu OK manual — gravação ativa');
 while(Date.now()-since<120000){await wait(250);const confirmed=await consume();if(confirmed)return confirmed;}
 throw Error('OK manual não confirmado em 2 minutos. Salvar e fotos não serão repetidos.');
}

chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(m.action==='record-final-event'&&sender.id===chrome.runtime.id&&sender.tab?.url?.startsWith(IMAS)){
  recordingWrites=recordingWrites.catch(()=>{}).then(()=>saveRecordingEvent(m,sender));recordingWrites.then(()=>respond({received:true})).catch(()=>respond({received:false}));return true;
 }

  if(m.action==='trace-step'&&running&&activeRun&&sender.id===chrome.runtime.id&&sender.tab?.id===activeRun.tabId&&sender.tab?.url?.startsWith(IMAS)){
    trace(String(m.step).slice(0,80),'running',{field:String(m.field||'').slice(0,60),path:String(m.path||'').split('?')[0].slice(0,120)}).then(()=>respond({received:true})).catch(()=>respond({received:false}));return true;
  }
  const fromPopup=!sender.tab&&sender.id===chrome.runtime.id;
  const fromRco=sender.id===chrome.runtime.id&&sender.tab?.url?.startsWith(RCO);
  if(!fromPopup&&!fromRco)return;
  if(!fromPopup&&!['preview','batch','save-creation','create-save','close-save','review-check','intake'].includes(m.action))return;
  const startedAt=Date.now();
  (async()=>{
    const recording=(await chrome.storage.local.get('finalRecording')).finalRecording;
    if(recording?.active&&(['batch','batch-next'].includes(m.action)||(['preview','create-save','close-save','save-creation'].includes(m.action)&&m.publicId!==recording.publicId)))throw Error('Durante a gravação, execute somente a OS selecionada, sem lote.');
    if(m.action==='record-start')return startFinalRecording(m.publicId);
    if(m.action==='record-stop')return stopFinalRecording();
    if(m.action==='queue'){const data=await queue();return {jobs:data.jobs.map(j=>({publicId:j.publicId,reference:j.reference,phase:j.phase,ready:j.ready,errors:j.errors}))};}
    if(['preview','create-save','close-save','save-creation','release'].includes(m.action)&&(await chrome.storage.local.get('batch')).batch?.state==='executando')throw Error('O lote está executando. Pare o lote antes de iniciar outra operação.');
    if(m.action==='preview')return preview(m.publicId);
    if(m.action==='close-save')return m.publicId==='d6dcc54e-0d1c-4fc6-9372-5862941c0dba'?completeAuthorizedTest(m.publicId):closeAndSave(m.publicId);
    if(m.action==='create-save')return m.publicId==='d6dcc54e-0d1c-4fc6-9372-5862941c0dba'?completeAuthorizedTest(m.publicId):createAndSave(m.publicId);
    if(m.action==='intake'){await checkIncomingReports();return {message:'Aprovação registrada. A OS seguirá pela fila automática.'};}
    if(m.action==='review-check')return verifyReview(m.publicId);
    if(m.action==='auto-send'){await chrome.storage.local.set({autoSendEnabled:m.enabled===true});return {message:m.enabled?'Envio automático ativado.':'Envio automático pausado.'};}
    if(m.action==='batch')return startAutomaticBatch(m.publicIds);
    if(m.action==='reprocess-reviewed')return startReviewedReprocess();
    if(m.action==='resume-323166')return startReviewed166Final();
    if(m.action==='save-creation'&&m.confirmed===true)return savePrepared(m.publicId);
    if(m.action==='batch-next'){if((await chrome.storage.local.get('batch')).batch?.automatic)throw Error('O lote segue automaticamente. Consulte o andamento ou use Parar lote.');if(running)throw Error('Aguarde a execução terminar.');await chrome.storage.local.remove('pending');return batchNext();}
    if(m.action==='batch-stop')return stopAutomaticBatch();
    if(m.action==='status')return chrome.storage.local.get(['pending','batch','batchHistory','autoSendEnabled','scheduleEnabled','lastScheduleAt','audit','updateStatus','lastDiagnostic','diagnosticSync','finalRecording']);
    if(m.action==='diagnostic')return chrome.storage.local.get(['lastDiagnostic','diagnosticSync']);
    if(m.action==='release'){if(running)throw Error('Aguarde o teste terminar.');await chrome.storage.local.remove('pending');await chrome.storage.local.set({updateStatus:{reason:'teste liberado; aguardando verificação da pasta'}});await audit('teste-liberado');return {message:'Teste liberado. A extensão não salvou nem marcou baixa.'};}
    if(m.action==='schedule'){await chrome.storage.local.set({scheduleEnabled:m.enabled===true});await schedule();return {message:m.enabled?'Processamento da fila às 07h, de segunda a sexta, ativado.':'Processamento agendado desativado.'};}
    if(m.action==='inspect'){const tab=await imasTab();return {inventory:await engine(tab,'inventory')};}
    throw Error('Ação não disponível no modo de validação.');
  })().then(respond).catch(async e=>{if(m.action==='close-save'){try{await recordClosingPreflightFailure(m.publicId,e,startedAt);}catch{}}respond({error:e.message,message:'Erro: '+e.message});});return true;
});

// Re-create a missing alarm after a service-worker restart, without replaying missed batches.
schedule().catch(e=>audit('agenda-bloqueada',{message:e.message}));

async function checkSourceUpdate(){
  await confirmManual323963().catch(e=>audit('conferencia-323963-pendente',{message:e.message}));
  await resumeNamedCompleteTest();
  await recoverCreationOk().catch(e=>audit('ok-criacao-pendente',{message:e.message}));
  if(!running){const saved=await chrome.storage.local.get(['lastDiagnostic','diagnosticSync']);if(saved.lastDiagnostic&&saved.diagnosticSync?.startsWith('pendente')){try{await message(await rcoTab(),{action:'diagnostic',run:saved.lastDiagnostic});await chrome.storage.local.set({diagnosticSync:'enviado ao app'});}catch{}}}
  let {pending}=await chrome.storage.local.get('pending');
  const {lastDiagnostic,closeAttempts={}}=await chrome.storage.local.get(['lastDiagnostic','closeAttempts']);
  if(pending?.phase==='encerrar'&&lastDiagnostic?.publicId===pending.publicId&&lastDiagnostic.state==='failed'&&lastDiagnostic.step==='Localizar Enviar arquivos'&&!closeAttempts[pending.publicId]){await chrome.storage.local.remove('pending');pending=null;await audit('atualizacao-apos-falha-sem-envio');}
  const result=await installedUpdate({currentVersion:chrome.runtime.getManifest().version,pending,running:running||automaticBatchRunning||(await chrome.storage.local.get('batch')).batch?.state==='executando'||(await chrome.storage.local.get('finalRecording')).finalRecording?.active===true,
    read:async(name,raw)=>{const response=await fetch(chrome.runtime.getURL(name),{cache:'no-store'});if(!response.ok)throw Error('Arquivo local ausente.');return raw?response.text():response.json();},
    hash:async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('')});
  await chrome.storage.local.set({updateStatus:{...result,at:new Date().toISOString(),loadedVersion:chrome.runtime.getManifest().version}});
  if(result.reload){await audit('recarregar-versao',{version:result.version});chrome.runtime.reload();}
}
async function initUpdates(){if(!await chrome.alarms.get('rco-source-update'))await chrome.alarms.create('rco-source-update',{periodInMinutes:1});}
async function reconnectRco(){for(const tab of await chrome.tabs.query({url:RCO+'*'})){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['rco.js']}).catch(()=>{});}}
initUpdates().catch(()=>{});
recoverCreationOk().catch(e=>audit('ok-criacao-pendente',{message:e.message}));


reconnectRco().then(async()=>{await confirmManual323963();await resumeNamedCompleteTest();}).catch(e=>audit('teste-completo-pendente',{message:e.message}));

restoreAutomaticBatch().catch(e=>audit('lote-bloqueado',{message:e.message}));

initIntake().catch(e=>audit('envio-automatico-pendente',{message:e.message}));
