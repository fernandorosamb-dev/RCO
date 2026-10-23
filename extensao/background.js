// RCO worker — versão 3.0.2 (carregado direto pelo Chrome, sem schedule.js)
chrome.storage.local.set({bgBuild:'3.0.2',workerBoot:{step:'background.js executou (direto)',at:new Date().toISOString(),version:'3.0.2'},workerStartup:{version:'3.0.2',at:new Date().toISOString(),entry:'background.js',state:'ready',error:''}}).catch(()=>{});
// ===== PARÂMETROS DO PROCESSO (único lugar para ajustar) =====
const CONFIG={
  maxFotosSemRevisao:5,             // acima disso a OS vai para revisão (relatório final ≤ 14 MB)
  clienteCodigo:'91',               // cliente fixo no IMAS
  fotoMaxBytes:15000,               // limite por foto após compactação
  fotoLadoMax:480                   // px do lado maior antes de reduzir
};
// OS que NUNCA podem ser tocadas pela automação.
const OS_PROTEGIDAS=new Set(['323902']);
const PUBLICID_PROTEGIDOS=new Set(['4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1']);
// OS usadas nos testes da validação: só voltam à fila com aprovação do supervisor no app.
const OS_TESTES_ANTERIORES=new Set(['323080','323081','323082','323140','323145','323157','323162','323164','323165','323166','323930','323963','323964']);

const DATA_HORA=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function isProtected(job){return OS_PROTEGIDAS.has(job?.externalNumber)||PUBLICID_PROTEGIDOS.has(job?.publicId);}
const FORCED=new Set(); // OS com fechamento forçado pelo supervisor (ignora só a trava de aprovação)
function safeJob(job) {
  if(!job)throw Error('OS não encontrada na fila do app.');
  if(isProtected(job))throw Error(`OS ${job.externalNumber||job.publicId} protegida pelo supervisor.`);
  if((!job.ready||job.errors?.length)&&!FORCED.has(job.publicId))throw Error('Corrija os campos pendentes da OS no app.');
  if(job.saveAllowed!==false||job.photoUploadAllowed!==false||job.mode!=='validation')throw Error('Pacote do app incompatível com esta extensão.');
  if(!['criar','encerrar'].includes(job.phase))throw Error('Etapa inválida.');
  if(job.phase==='criar'&&job.externalNumber)throw Error('OS já vinculada. Não criar novamente.');
  if(job.phase==='encerrar'&&!/^\d+$/.test(job.externalNumber||''))throw Error('Vincule o número do IMAS antes de encerrar.');
  // Datas: formato completo e ordem cronológica, antes de tocar no IMAS.
  const r=job.report||{};
  const datas=[['abertura',r.imasOpenedAt,job.phase==='criar'],['início',r.executionStartedAt,true],['conclusão',r.completedAt,true]];
  for(const [nome,valor,obrigatoria] of datas)if(obrigatoria&&!DATA_HORA.test(valor||''))throw Error(`Data/hora de ${nome} ausente ou incompleta no app.`);
  if(r.executionStartedAt>r.completedAt)throw Error('Início da execução posterior à conclusão.');
  if(job.phase==='criar'&&r.imasOpenedAt>r.executionStartedAt)throw Error('Abertura posterior ao início da execução.');
  const agora=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
  if(r.completedAt>agora)throw Error('Data de conclusão no futuro.');
  if(!String(r.observations||'').trim())throw Error('Observação vazia no app.');
  if(job.phase==='encerrar'&&!(r.photos?.length>0))throw Error('Encerramento sem fotos no app.');
  return job;
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
async function audit(kind,data={}){const {audit=[]}=await chrome.storage.local.get('audit');await chrome.storage.local.set({audit:[...audit,{at:new Date().toISOString(),kind,...data}]  .slice(-500)});}
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
// ===== CONTRATO COM O APP RCO (ver CONTRATO.md) =====
// O app publica /api/imas/contract. Se o formato da fila mudou, a extensão PARA antes de tocar no IMAS.
// Se o app ainda não tem o endpoint, segue com os valores locais e registra o aviso.
const withTimeout=(promise,ms,text)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(text)),ms);})]).finally(()=>clearTimeout(timer));};
const CONTRACT_SCHEMA=1; // versão do formato da fila que esta extensão entende
let contractCheckedAt=0;
const versionNum=v=>String(v||'0').split('.').map(n=>parseInt(n,10)||0);
function versionLess(a,b){const x=versionNum(a),y=versionNum(b);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)<(y[i]||0);}return false;}
function applyContractConfig(config={}){
  // Listas de proteção só CRESCEM (união); nunca removem a proteção embutida.
  for(const n of config.osProtegidas||[])if(/^\d+$/.test(String(n)))OS_PROTEGIDAS.add(String(n));
  for(const id of config.publicIdsProtegidos||[])if(/^[-a-zA-Z0-9]+$/.test(String(id)))PUBLICID_PROTEGIDOS.add(String(id));
  for(const n of config.osTestesAnteriores||[])if(/^\d+$/.test(String(n)))OS_TESTES_ANTERIORES.add(String(n));
  const max=Number(config.maxFotosSemRevisao);if(Number.isInteger(max)&&max>=1&&max<=10)CONFIG.maxFotosSemRevisao=max;
}
async function checkContract(){
  if(Date.now()-contractCheckedAt<60000)return;
  const c=await withTimeout((async()=>message(await rcoTab(),{action:'contract'}))(),4500,'A aba do RCO não respondeu ao pedido do contrato. Atualize a aba do RCO (F5), confira que está logada como Supervisor e abra o popup de novo.');
  if(!c||c.missing){
    contractCheckedAt=Date.now();
    await chrome.storage.local.set({contractState:{state:'ausente',at:new Date().toISOString(),note:'App sem /api/imas/contract — usando valores locais.'}});
    return;
  }
  const bad=c.schemaVersion!==CONTRACT_SCHEMA?`o formato da fila do app é v${c.schemaVersion}, mas esta extensão entende v${CONTRACT_SCHEMA}`
    :versionLess(chrome.runtime.getManifest().version,c.minExtensionVersion)?`o app exige extensão ${c.minExtensionVersion} ou mais nova (instalada: ${chrome.runtime.getManifest().version})`:'';
  if(bad){
    await chrome.storage.local.set({contractState:{state:'incompatível',at:new Date().toISOString(),note:bad,appVersion:c.appVersion||''}});
    await audit('contrato-incompativel',{message:bad});
    throw Error('O app RCO mudou: '+bad+'. Nada foi alterado no IMAS. Atualize a extensão (peça ao Claude para comparar com o CONTRATO.md).');
  }
  applyContractConfig(c.config);
  contractCheckedAt=Date.now();
  await chrome.storage.local.set({contractState:{state:'ok',at:new Date().toISOString(),schema:c.schemaVersion,appVersion:c.appVersion||'',note:''}});
}
async function queue(timeout=4500){await checkContract();return withTimeout((async()=>message(await rcoTab(),{action:'fila'}))(),timeout,'A aba do RCO não respondeu ao pedido da fila de OS. Atualize a aba do RCO (F5), confira que está logada como Supervisor e abra o popup de novo.');}
async function imasTab(){
 const tabs=await chrome.tabs.query({url:IMAS+'*'});
 if(!tabs.length){
  // IMAS fechado: abre a aba e espera carregar (a URL da aba recém-criada pode vir vazia no início).
  const created=await chrome.tabs.create({url:IMAS+'login.php',active:true});
  for(let i=0;i<60;i++){const t=await chrome.tabs.get(created.id);if(t.status==='complete'&&(t.url||'').startsWith(IMAS))return t;await wait(500);}
  return chrome.tabs.get(created.id);
 }
 // Várias abas do IMAS: usa a mais recente e fecha as demais sem formulário aberto, em vez de travar.
 if(tabs.length>1){
  const keep=tabs.find(t=>/ordem_servico_form\.php/.test(t.url||''))||tabs.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];
  for(const t of tabs)if(t.id!==keep.id&&!/ordem_servico_form\.php/.test(t.url||''))await chrome.tabs.remove(t.id).catch(()=>{});
  const left=await chrome.tabs.query({url:IMAS+'*'});
  if(left.length!==1)throw Error('Há mais de uma aba do IMAS com formulário aberto. Feche as extras e tente de novo.');
  return left[0];
 }
 return tabs[0];
}
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

// Login salvo no navegador: o Chrome mantém a senha preenchida "escondida" (value vazio) até um gesto real.
// Faz o mesmo que a pessoa: foca a senha e aperta Enter (evento confiável via debugger); se ainda ficar no login, clica em Entrar.
async function submitSavedLogin(tab){
  const [info]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const vis=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
    const pw=[...document.querySelectorAll('input[type="password"]')].filter(vis);
    if(pw.length!==1)return {ok:false};
    pw[0].focus();const pr=pw[0].getBoundingClientRect();
    const root=pw[0].form||document;
    const norm=t=>(t||'').trim().toLowerCase();
    const btns=[...root.querySelectorAll('button,input[type="submit"],input[type="button"],a')].filter(vis).filter(e=>norm(e.tagName==='INPUT'?e.value:e.textContent)==='entrar');
    const r=btns.length===1?btns[0].getBoundingClientRect():null;
    return {ok:true,pw:{x:pr.left+pr.width/2,y:pr.top+pr.height/2},btn:r?{x:r.left+r.width/2,y:r.top+r.height/2}:null};
  }});
  if(!info?.result?.ok)return false;
  const target={tabId:tab.id};let attached=false;
  try{
    await chrome.debugger.attach(target,'1.3');attached=true;
    // Clique real no campo de senha: é o gesto que faz o Chrome liberar a senha salva para a página.
    {const {x,y}=info.result.pw;for(const type of ['mouseMoved','mousePressed','mouseReleased'])await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:type==='mouseMoved'?0:1});await wait(800);}
    await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
    await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
    await wait(2500);
    const t=await chrome.tabs.get(tab.id);
    if(new URL(t.url).pathname==='/login.php'&&info.result.btn){
      const {x,y}=info.result.btn;
      for(const type of ['mouseMoved','mousePressed','mouseReleased'])await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:type==='mouseMoved'?0:1});
      await wait(2000);
    }
    return true;
  }finally{if(attached)await chrome.debugger.detach(target).catch(()=>{});}
}
async function openForm(tab,job){
  let loginAttempted=false,waitedLogin=0,trustedTried=false;const navigationVisited=[];
  for(let step=0;step<12;step++){
    await loaded(tab.id);await wait(600);
    await trace('Navegar no IMAS','running',{path:new URL((await chrome.tabs.get(tab.id)).url).pathname});
    const action=await engine(tab,'navigate',{...job,loginAttempted,navigationVisited});
    if(action?.expanded==='entrar'){loginAttempted=true;await trace('Entrar no IMAS');}
    if(action?.ready){await trace('Formulário localizado','ok');return;}
    if(action?.url){const url=new URL(action.url);if(url.origin!==new URL(IMAS).origin)throw Error('Destino fora do IMAS bloqueado.');await chrome.tabs.update(tab.id,{url:url.href});await wait(800);}
    else if(action?.waitingLogin){
      if(loginAttempted&&!trustedTried&&waitedLogin>=1){trustedTried=true;await trace('Entrar no IMAS (Enter, login salvo)');try{await submitSavedLogin(tab);}catch(e){await trace('Entrar no IMAS (Enter, login salvo)','failed',{message:e.message});}}
      else if(!loginAttempted&&(step>=1||waitedLogin>=2)){await trace('Entrar no IMAS (Enter, login salvo)');try{if(await submitSavedLogin(tab))loginAttempted=true;}catch(e){await trace('Entrar no IMAS (Enter, login salvo)','failed',{message:e.message});}}
      else{await trace(loginAttempted?'Aguardar resposta do login':'Aguardar preenchimento salvo do navegador');waitedLogin++;await wait(loginAttempted?1500:750);}
    }
    else if(action?.expanded){navigationVisited.push(action.expanded);await wait(800);}
    else throw Error('Navegação no IMAS não identificada.');
  }
  throw Error(loginAttempted?'O IMAS permaneceu na página de login após Entrar. Nenhuma nova tentativa nem salvamento foi feito.':'Não foi possível chegar ao formulário da OS. Nenhum salvamento foi feito.');
}
// Keep the square white-margin format used by the existing 1.0.4 activator.
async function adjustPhoto(data){
 const blob=await(await fetch(data)).blob(),bitmap=await createImageBitmap(blob);
 try{
  let max=CONFIG.fotoLadoMax,quality=.35,output;
  for(let attempt=0;attempt<10;attempt++){
   const side=Math.max(1,Math.min(max,Math.max(bitmap.width,bitmap.height))),area=Math.max(1,Math.round(side*.90)),scale=Math.min(area/bitmap.width,area/bitmap.height),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
   const canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);ctx.drawImage(bitmap,Math.round((side-w)/2),Math.round((side-h)/2),w,h);
   output=await canvas.convertToBlob({type:'image/jpeg',quality});if(output.size<=CONFIG.fotoMaxBytes)break;max=Math.round(max*.82);quality=Math.max(.22,quality-.04);
  }
  if(!output||output.size>CONFIG.fotoMaxBytes)throw Error('Foto não pôde ser compactada para o relatório. Nenhum arquivo foi enviado.');
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
    await engine(tab,'prepare',job);await trace('Aguardar editor de observação');await wait(500);await engine(tab,'observations',job.report.observations);await trace('Sincronizar editor de observação');
    const [editorResult]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:syncObservationEditor,args:[job.report.observations]});
    if(!editorResult?.result)throw Error('Editor de observação não respondeu.');
    await trace('Formulário preenchido','ok');
    if(job.phase==='encerrar'){
      const rt=await rcoTab();for(const [index,photo]of job.report.photos.entries()){
        await trace('Preparar foto '+(index+1));const original=await message(rt,{action:'foto',url:photo.url});const dataUrl=await adjustPhoto(original);
        await engine(tab,'addPhoto',{dataUrl,name:`OS_${job.externalNumber}_Foto_${String(index+1).padStart(2,'0')}.jpg`,reset:index===0});
      }
    }
    await wait(400);await trace('Conferir campos e fotos');const formAudit=await engine(tab,'audit',job);if(!formAudit.ok)throw Error('Confira os campos que divergiram: '+formAudit.errors.join('; '));
    activeRun.controls=await engine(tab,'diagnostics');
    await chrome.storage.local.set({pending:{publicId,reference:job.reference,phase:job.phase,tabId:tab.id,at:new Date().toISOString(),state:'aguardando validação',audit:formAudit,job}});
    activeRun.state='review';await trace('Aguardando validação — sem salvar','ok');await syncDiagnostic(true);
    await chrome.tabs.update(tab.id,{active:true});await audit('teste-preparado',{publicId,reference:job.reference,phase:job.phase,fields:formAudit.fields,photos:formAudit.photos});
    return {message:job.phase==='criar'?'OS preenchida como Aberta. Confira tudo no IMAS. A extensão NÃO clicou em Salvar.':'Encerramento preparado. Fotos apenas selecionadas, sem enviar arquivos. Confira os campos. A extensão NÃO clicou em Salvar nem marcou baixa no app.'};
  }catch(e){if(activeRun){activeRun.state='failed';if(diagnosticTab){try{activeRun.controls=await engine(diagnosticTab,'diagnostics');}catch{}}
    await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);}
    if(reserved&&(!formStarted||e.noFormChanges===true)){const {pending}=await chrome.storage.local.get('pending');if(pending?.publicId===publicId&&pending.state==='preparando')await chrome.storage.local.remove('pending');}await audit('falha',{message:e.message});throw e;}finally{running=false;activeRun=null;}
}
// Janelas nativas do IMAS durante Salvar: aceita só confirmação de salvar/gravar;
// qualquer outro aviso é registrado e a automação para (nada é aceito às cegas).
function creationDialogs(restore=false){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')throw Error('Página fora do formulário de OS.');
 if(restore){window.__rcoCreationDialogs?.restore();return;}
 if(window.__rcoCreationDialogs)return;
 window.__rcoAvisos=[];
 const originalConfirm=window.confirm,originalAlert=window.alert;
 const success=t=>/sucesso|registro\s*gravado|dados\s*foram\s*(alterados|gravados|salvos)/i.test(t);
 const confirmed=text=>{const t=String(text);if((/salvar|gravar|alterar|confirma/i.test(t)||(window.__rcoAllowUpload&&/enviar|arquivo|foto|imagem|upload|anex/i.test(t)))&&!/excluir|apagar|remover|descartar/i.test(t))return true;window.__rcoAvisos.push('Confirmação recusada: '+t.slice(0,200));return false;};
 const alerted=text=>{const t=String(text);if(!success(t))window.__rcoAvisos.push(t.slice(0,200));};
 const state={restore(){if(window.confirm===confirmed)window.confirm=originalConfirm;if(window.alert===alerted)window.alert=originalAlert;delete window.__rcoCreationDialogs;}};
 window.__rcoCreationDialogs=state;window.confirm=confirmed;window.alert=alerted;setTimeout(()=>state.restore(),180000);
}
function readImasNotices(){const list=window.__rcoAvisos||[];window.__rcoAvisos=[];return list;}
async function assertNoImasNotice(tabId){
 const [r]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:readImasNotices});
 if(r?.result?.length){const e=Error('O IMAS exibiu um aviso e a automação parou: '+r.result.join(' | '));e.imasNotice=true;throw e;}
}
function clickCreationSave(selector,number=null){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')return {error:'Página fora da criação.',noClick:true};
 const id=new URL(location.href).searchParams.get('id_ordem_servico');if(number!==null?(id!==number||number==='323902'):(id&&id!=='0'))return {error:'OS divergente ou protegida.',noClick:true};
 const buttons=document.querySelectorAll(selector);if(buttons.length!==1||buttons[0].disabled)return {error:'Salvar não está disponível de forma única.',noClick:true};
 const button=buttons[0];if(!(button.offsetWidth||button.offsetHeight||button.getClientRects().length))return {error:'Salvar não está visível.',noClick:true};
 if(window.CKEDITOR?.instances?.obs)window.CKEDITOR.instances.obs.updateElement();
 button.scrollIntoView({block:'center'});button.focus();button.click();return {clicked:true};
}
function confirmCreationSuccess(number=null,mode='click'){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||(number!==null&&new URL(location.href).searchParams.get('id_ordem_servico')!==number)||new URL(location.href).searchParams.get('id_ordem_servico')==='323902')return {clicked:false};
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
 const successPanel=button=>{for(let e=button.parentElement,depth=0;e&&depth<12&&!['BODY','HTML'].includes(e.tagName);e=e.parentElement,depth++){const texts=[norm(e.innerText),norm(e.textContent)];if(texts.some(text=>text.length<500&&/registro\s*gravado|dados\s*foram\s*(?:alterados|gravados|salvos)/.test(text)&&!/(?:^|\s)(?:erro|falha)(?:\s|:|$)/.test(text)))return e;}return null;};
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
 await assertNoImasNotice(tabId);
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
   try{acknowledged=await acknowledgeSuccess(tab.id);}catch(e){if(e.imasNotice||i===79)throw e;continue;}
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
 nodes[0].click();return {clicked:true};
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
// Final-stage recovery is deliberately separate from photo upload and preparation.
function finalSavePoint(selector,number){
 if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||new URL(location.href).searchParams.get('id_ordem_servico')!==number||number==='323902'||document.getElementById('id_ordem_servico')?.value!==number||document.getElementById('id_cliente')?.value!=='91')throw Error('OS/cliente divergente antes do clique final.');
 if(Number(window.jQuery?.active||0)!==0)throw Error('O IMAS ainda está processando. Salvar não foi repetido.');
 const matches=[...document.querySelectorAll(selector)].filter(e=>!e.disabled&&(e.offsetWidth||e.offsetHeight||e.getClientRects().length));
 if(matches.length!==1||String(matches[0].value||matches[0].innerText||'').trim().toLowerCase()!=='salvar')throw Error('Salvar final não identificado de forma única.');
 const button=matches[0];button.scrollIntoView({block:'center'});button.focus();
 const r=button.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
 if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw Error('Salvar fora da área visível.');
 return {x,y};
}
async function nativeFinalSave(tab,job){
 const checked=await engine(tab,'audit',{...job,verifyUploaded:true});if(!checked.ok)throw Error('Campos divergentes antes de Salvar final: '+checked.errors.join('; '));
 const save=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});
 const target={tabId:tab.id};let attached=false;
 try{
  await chrome.scripting.executeScript({target,world:'MAIN',func:creationDialogs,args:[false]});
  await chrome.debugger.attach(target,'1.3');attached=true;
  const [r]=await chrome.scripting.executeScript({target,world:'MAIN',func:finalSavePoint,args:[save.selector,job.externalNumber]});
  if(!r?.result)throw Error('Posição atual de Salvar não confirmada.');
  await trace('Salvar final com clique do navegador');
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',...r.result,button:'left',clickCount:1});
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',...r.result,button:'left',clickCount:1});
 }finally{if(attached)await chrome.debugger.detach(target).catch(()=>{});}
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
  if(!confirmed){
   // Mesmo caminho do encerramento normal (clique de Salvar + OK, até 3 tentativas). O clique por coordenadas do navegador não gravava nada nas OS retomadas.
   await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[false]});
   for(let attempt=1;attempt<=3&&!confirmed;attempt++){
    await trace(attempt===1?'Salvar encerramento (retomada)':`Salvar encerramento (retomada) — tentativa ${attempt}/3`);
    const target=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});
    const [saved]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickCreationSave,args:[target.selector,job.externalNumber]});
    if(!saved?.result?.clicked){if(attempt===3)throw Error(saved?.result?.error||'Resultado do clique Salvar não confirmado.');continue;}
    await trace('Confirmar OK de Registro gravado');
    for(let i=0;i<(attempt===1?80:40);i++){await wait(500);if((await acknowledgeSuccess(tab.id,job.externalNumber))?.result?.clicked){confirmed=true;break;}if(i===19&&await imasConcluded(tab)){confirmed=true;break;}}
    if(confirmed||await imasConcluded(tab))break;
   }
  }
  // The persisted record is authoritative even when a transient OK was missed.
  await trace('Reler encerramento no IMAS');await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2000);
  // O IMAS pode demorar a refletir o salvamento: relê até 3 vezes (somente leitura, sem reenviar nada).
  let persisted,linked;
  for(let tryRead=0;tryRead<3;tryRead++){
   if(tryRead>0){await wait(4000);await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2500);}
   persisted=await engine(tab,'audit',{...job,verifyUploaded:true});linked=await engine(tab,'linkedPhotos',job);
   if(persisted.ok&&linked.count===job.report.photos.length)break;
  }
  if(!persisted.ok||linked.count!==job.report.photos.length)throw Error(`Encerramento não confirmado na releitura (fotos no IMAS: ${linked.count}, esperado: ${job.report.photos.length}${persisted.ok?'':'; divergências: '+(persisted.errors||[]).join(' / ')}). Fotos não foram reenviadas.`);
  await message(await rcoTab(),{action:'baixar',publicId:job.publicId,osNumber:job.externalNumber});
  await chrome.storage.local.remove('pending');activeRun.state='completed';await trace('Encerramento e baixa confirmados na releitura','ok');await syncDiagnostic(true);
  await audit('encerramento-confirmado',{publicId:job.publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:`OS ${job.externalNumber}: encerramento confirmado e baixa registrada, sem reenviar fotos.`};
 }catch(e){activeRun.state='failed';await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{running=false;activeRun=null;}
}
// Lê no servidor (sem recarregar a tela) se a OS já está Concluída no IMAS.
async function imasConcluded(tab){
 try{const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{const h=await (await fetch(location.href,{credentials:'include',cache:'no-store'})).text();const d=new DOMParser().parseFromString(h,'text/html');const t=d.getElementById('id_ordem_servico_status')?.selectedOptions[0]?.textContent||'';return /conclu/i.test(t);}});return r?.result===true;}
 catch{return false;}
}
// Conta as fotos vinculadas lendo o servidor do IMAS (sem depender do contador/galeria já desenhados na tela).
async function serverPhotoCount(tab){
 try{const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{const h=await (await fetch(location.href,{credentials:'include',cache:'no-store'})).text();const d=new DOMParser().parseFromString(h,'text/html');const sec=d.getElementById('imagem')?.closest('fieldset');if(!sec)return null;const m=[...String(sec.textContent||'').matchAll(/(?:esta\s+o\.?s\.?\s+tem|tem)\s*\(?\s*(\d+)\s*\)?\s*fotos?\s+vinculad/gi)];const counter=m.length===1?Number(m[0][1]):0;const gallery=new Set([...sec.querySelectorAll('a img')].map(i=>i.getAttribute('src')).filter(Boolean)).size;return Math.max(counter,gallery);}});return r?.result??null;}
 catch{return null;}
}
// Se as fotos chegaram ao IMAS mas a tela não atualizou o contador, retoma preservando as fotos (sem reenviar).
async function closeAndSave(publicId){
 try{
  // OS aprovada pelo supervisor que já teve tentativa: relê o IMAS ao vivo e retoma preservando as fotos (nunca reenvia).
  const j0=(await queue()).jobs.find(j=>j.publicId===publicId);
  const {closeAttempts:ca={},pending:pd}=await chrome.storage.local.get(['closeAttempts','pending']);
  if(j0?.approvalRequest&&ca[publicId]&&!running&&(!pd||pd.publicId===publicId)){
   if(pd)await chrome.storage.local.remove('pending');
   await audit('retomada-aprovada',{publicId,osNumber:j0.externalNumber});
   return await processApprovedClosing(safeJob(j0));
  }
  return await closeAndSaveCore(publicId);
 }
 catch(e){
  if(!e.resumeWithServerPhotos)throw e;
  await audit('fotos-confirmadas-no-servidor',{publicId,message:e.message});
  const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
  await chrome.storage.local.remove('pending');
  return processApprovedClosing(job);
 }
}
async function closeAndSaveCore(publicId){
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='encerrar')throw Error('Crie e vincule esta OS antes de encerrar.');
 if(running)throw Error('Aguarde a execução terminar.');
 let {pending,closeAttempts={}}=await chrome.storage.local.get(['pending','closeAttempts']);
 if(closeAttempts[publicId]?.step==='save'&&pending?.publicId===publicId)return resumeClosingFinal(job,pending);
 let photosAlreadyUploaded=false;
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
   // Avisos do IMAS (alert/confirm) bloqueiam a página e travavam o clique: instala o guarda antes e registra o texto.
   await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>{window.__rcoAllowUpload=true;}});
   await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[false]});
   const clickPromise=chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickClosingTarget,args:[target.selector,job.externalNumber]});
   let clicked;
   const watchdog=new Promise(r=>setTimeout(()=>r('timeout'),20000));
   const first=await Promise.race([clickPromise,watchdog]);
   if(first==='timeout'){
    // Aviso nativo preso: fecha pelo depurador e registra.
    await trace('Aviso do IMAS bloqueando o clique — tratando','running');
    const target2={tabId:tab.id};let att=false;
    try{
     await chrome.debugger.attach(target2,'1.3');att=true;
     const opened=new Promise(res=>{const h=(src,method,params)=>{if(src.tabId===tab.id&&method==='Page.javascriptDialogOpening'){chrome.debugger.onEvent.removeListener(h);res(params);}};chrome.debugger.onEvent.addListener(h);setTimeout(()=>res(null),4000);});
     await chrome.debugger.sendCommand(target2,'Page.enable');
     const info=await opened;
     const msg=String(info?.message||'').slice(0,200);
     await audit('aviso-imas-upload',{message:msg,type:info?.type||''});
     await trace('Aviso do IMAS: '+(msg||'(sem texto)'),'running');
     const accept=!/excluir|apagar|remover|descartar/i.test(msg)&&/enviar|arquivo|foto|imagem|upload|anex/i.test(msg);
     await chrome.debugger.sendCommand(target2,'Page.handleJavaScriptDialog',{accept}).catch(()=>{});
    }finally{if(att)await chrome.debugger.detach(target2).catch(()=>{});}
    clicked=await Promise.race([clickPromise,new Promise(r=>setTimeout(()=>r(null),8000))]);
    if(!clicked)clicked=[{result:{clicked:true}}];
   }else clicked=first;
   if(!clicked?.[0]?.result?.clicked&&!clicked?.result?.clicked)throw Error(clicked?.[0]?.result?.error||'Resultado do clique de envio não confirmado.');
   try{const [av]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>window.__rcoAvisos||[]});if(av?.result?.length)await trace('Avisos do IMAS após o clique: '+av.result.join(' / ').slice(0,300),'ok');}catch{}
   await trace('Enviar arquivos clicado','ok');
  }
  await trace('Aguardar fotos vinculadas');let uploaded=false;
  const wantPhotos=selection.before+job.report.photos.length;
  for(let i=0;i<180;i++){await wait(500);try{const result=await engine(tab,'linkedPhotos',job);if(result.count===wantPhotos){uploaded=true;break;}}catch{}
   if(i>=30&&i%10===0){const onServer=await serverPhotoCount(tab);if(onServer===wantPhotos){const e=Error('As fotos já estão no IMAS (conferido no servidor); retomando sem reenviar.');e.resumeWithServerPhotos=true;throw e;}}}
  if(!uploaded){const onServer=await serverPhotoCount(tab);if(onServer===wantPhotos){const e=Error('As fotos já estão no IMAS (conferido no servidor); retomando sem reenviar.');e.resumeWithServerPhotos=true;throw e;}}
  if(!uploaded)throw Error(`O IMAS não confirmou todas as fotos vinculadas (no servidor: ${await serverPhotoCount(tab)}, esperado: ${wantPhotos}). Encerramento não foi salvo. Não repita o envio.`);
  }else await trace('Fotos já vinculadas — somente Salvar e OK','ok');
  await trace('Fotos vinculadas confirmadas','ok');await wait(1500);
  const save=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[false]});
  await chrome.storage.local.set({closeAttempts:{...closeAttempts,[publicId]:{at:new Date().toISOString(),externalNumber:job.externalNumber,step:'save'}},pending:{...pending,state:'salvando encerramento'}});
  // Até 3 tentativas de Salvar + OK. Só repete se o IMAS (lido no servidor, sem recarregar o formulário) ainda NÃO mostra a OS como Concluída.
  let confirmed=false;
  for(let attempt=1;attempt<=3;attempt++){
   let target=save;
   if(attempt>1){await trace(`Salvar encerramento — tentativa ${attempt}/3`);target=await engine(tab,'closingTarget',{...job,operation:'save',token:crypto.randomUUID()});}
   else await trace('Salvar encerramento');
   const [saved]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:clickCreationSave,args:[target.selector,job.externalNumber]});
   if(!saved?.result?.clicked){if(attempt===3)throw Error(saved?.result?.error||'Resultado do clique Salvar não confirmado.');continue;}
   await trace('Confirmar OK de Registro gravado');
   for(let i=0;i<(attempt===1?80:40);i++){await wait(500);const ok=await acknowledgeSuccess(tab.id,job.externalNumber);if(ok?.result?.clicked){confirmed=true;break;}if(i===19)await nativeFinalSave(tab,job);}
   if(await imasConcluded(tab))break;
  }
  if(!confirmed)await trace('OK não observado — conferir registro persistido, sem reenviar fotos','ok');
  await trace('Reler OS salva no IMAS');await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(2000);
  const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});const linked=await engine(tab,'linkedPhotos',job);
  if(!persisted.ok||linked.count!==job.report.photos.length)throw Error(`Encerramento salvo não confirmado na releitura (fotos no IMAS: ${linked.count}, esperado: ${job.report.photos.length}). Nenhuma baixa marcada no app.`);
  await trace('Confirmar baixa na plataforma');await message(await rcoTab(),{action:'baixar',publicId,osNumber:job.externalNumber});
  await chrome.storage.local.remove('pending');activeRun.state='completed';await trace('OS encerrada e baixa confirmada','ok');await syncDiagnostic(true);await audit('encerramento-confirmado',{publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:`OS ${job.externalNumber}: fotos enviadas, encerramento salvo e confirmado no IMAS. Baixa registrada no app.`};
 }catch(e){activeRun.state='failed';try{activeRun.controls=await engine(tab,'diagnostics');}catch{}await trace(activeRun.step,'failed',{message:e.message});await syncDiagnostic(true);throw e;}finally{try{await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creationDialogs,args:[true]});}catch{}running=false;activeRun=null;}
}
// Recover only the remaining OK of the last linked creation. Never Save,
// navigate, prepare fields, upload photos, or mark this OS downloaded here.
async function recoverCreationOk(){
 if(running)return;
 const {lastDiagnostic,saveAttempts={},creationOkConfirmed={}}=await chrome.storage.local.get(['lastDiagnostic','saveAttempts','creationOkConfirmed']);
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
 if(linked.count>job.report.photos.length)throw Error(`Há ${linked.count} fotos no IMAS para ${job.report.photos.length} esperadas (possível duplicidade). Conferir manualmente.`);
 if(persisted.ok&&linked.count===job.report.photos.length){
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
async function startAutomaticBatch(publicIds,mode='close'){
 const {pending,batch,closeAttempts={},saveAttempts={}}=await chrome.storage.local.get(['pending','batch','closeAttempts','saveAttempts']);
 if(running||automaticBatchRunning||pending)throw Error('Há uma OS em andamento ou travada. Use "Liberar OS travada" ou aguarde.');
 if(batch?.automatic&&batch.state==='executando')throw Error('O lote já está em execução.');
 const requested=publicIds?new Set(publicIds):null,selected=(await queue()).jobs.filter(j=>!requested||requested.has(j.publicId));
 const eligible=[],skipped=[];
 for(const job of selected){
  const reason=!job.ready?job.errors.join('; '):isProtected(job)?'OS protegida pelo supervisor':!job.approvalRequest&&(job.report?.photos?.length||0)>CONFIG.maxFotosSemRevisao?`${job.report.photos.length} fotos (limite ${CONFIG.maxFotosSemRevisao}) — revisar necessidade e aprovar no app`:OS_TESTES_ANTERIORES.has(job.externalNumber)?'OS dos testes anteriores: não reprocessar (já tratadas manualmente)':!job.approvalRequest&&(closeAttempts[job.publicId]||saveAttempts[job.publicId])?'Tentativa anterior: conferir antes de repetir':'';
  if(reason)skipped.push({publicId:job.publicId,reference:job.externalNumber||job.reference,reason});else eligible.push(job);
 }
 if(eligible.length)await prepareApprovedBatchStart(eligible);
 const state={automatic:true,mode,runId:crypto.randomUUID(),remaining:eligible.map(j=>j.publicId),total:eligible.length,selected:selected.length,completed:[],skipped,state:eligible.length?'executando':'concluído',startedAt:new Date().toISOString(),current:null};
 if(batch){const {batchHistory=[]}=await chrome.storage.local.get('batchHistory');await chrome.storage.local.set({batchHistory:[...batchHistory,batch].slice(-30)});}
 await chrome.storage.local.set({batch:state});await audit('lote-automatico-iniciado',{total:state.total,skipped});
 if(eligible.length)await chrome.alarms.create('rco-imas-batch',{when:Date.now()+1000});
 return {message:`Lote iniciado: ${eligible.length} OS prontas; ${skipped.length} separadas para conferência. A extensão seguirá uma por vez. Use Parar lote para interromper após a OS atual.`};
}
async function automaticBatchStep(){
 if(automaticBatchRunning||running)return;
 let {batch,pending}=await chrome.storage.local.get(['batch','pending']);
 if(!batch?.automatic||batch.state!=='executando')return;
 if(batch.current||pending){await chrome.storage.local.set({batch:{...batch,state:'interrompido',error:'Há uma OS em revisão ou uma execução anterior sem confirmação. Nenhuma foto será reenviada.'}});return;}
 if(!batch.remaining.length){await chrome.storage.local.set({batch:{...batch,state:'concluído'}});return;}
 automaticBatchRunning=true;const publicId=batch.remaining[0],startedAt=Date.now();
 try{
  let job=(await queue()).jobs.find(j=>j.publicId===publicId);
  const before=(await chrome.storage.local.get('batch')).batch;if(before?.runId!==batch.runId||before.state!=='executando')return;
  if(!job){batch={...batch,remaining:batch.remaining.slice(1),skipped:[...batch.skipped,{publicId,reason:'OS já saiu da fila'}]};await chrome.storage.local.set({batch});}
  else{
   safeJob(job);
   const attempts=await chrome.storage.local.get(['closeAttempts','saveAttempts']);
   if(!job.approvalRequest&&(attempts.closeAttempts?.[publicId]||attempts.saveAttempts?.[publicId]))throw Error('Tentativa anterior detectada. Não repetir envio/criação.');
   const approved=!!job.approvalRequest;
   if(approved)await message(await rcoTab(),{action:'approval-claim',publicId,requestId:job.approvalRequest.requestId});
   batch={...batch,current:publicId};await chrome.storage.local.set({batch});
   let createdNow=false;
   if(job.phase==='criar'){
    createdNow=true;
    await createAndSave(publicId);
    const state=await chrome.storage.local.get('pending');
    job=batch.mode==='create'?((await queue()).jobs.find(j=>j.publicId===publicId)||(()=>{throw Error('OS criada não localizada na fila.');})()):safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
    if(!state.pending?.successAcknowledged||state.pending.publicId!==publicId||state.pending.externalNumber!==job.externalNumber||job.phase!=='encerrar')throw Error('Criação não vinculada/confirmada. Lote pausado.');
    await leaveSavedBatchForm(job.externalNumber);await chrome.storage.local.remove('pending');
   }
   if(createdNow&&batch.mode==='create'){await audit('os-criada-no-imas',{publicId,osNumber:job.externalNumber});}
   else if(approved)await processApprovedClosing(job);else await closeAndSave(publicId);
   // closeAndSave already verifies persisted fields/photos and app baixa.
   const latest=(await chrome.storage.local.get('batch')).batch;
   if(!latest||latest.runId!==batch.runId)return;
   batch={...latest,current:null,remaining:latest.remaining.slice(1),completed:[...latest.completed,{publicId,reference:job.externalNumber,at:new Date().toISOString()}]};await chrome.storage.local.set({batch});
   await audit('lote-os-confirmada',{publicId,osNumber:job.externalNumber});
   if(!(createdNow&&batch.mode==='create'))await leaveSavedBatchForm(job.externalNumber); // na criação a aba já voltou para a lista
  }
  const latest=(await chrome.storage.local.get('batch')).batch;
  if(latest?.runId===batch.runId&&latest.state==='executando'){
   if(latest.remaining.length)await chrome.alarms.create('rco-imas-batch',{when:Date.now()+2000});
   else await finishAutomaticBatch(latest);
  }
 }catch(e){
  // Falha ANTES de qualquer salvamento por causa de acesso/login (IMAS fechado, sessão, permissão): não manda a OS para revisão
  // nem a marca como já enviada; o próximo ciclo tenta de novo sozinho.
  const semSalvar=/Nenhum salvamento foi feito|permaneceu na página de login|bloqueou o acesso à página do IMAS|Não foi possível chegar ao formulário/i.test(e.message||'');
  if(semSalvar){try{const {autoSeen=[]}=await chrome.storage.local.get('autoSeen');await chrome.storage.local.set({autoSeen:autoSeen.filter(id=>id!==publicId)});await audit('lote-adiado-sem-salvar',{publicId,message:e.message});}catch{}}
  else{try{await recordClosingPreflightFailure(publicId,e,startedAt);}catch{}}
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
 await chrome.alarms.clear('rco-imas-batch');const {batch}=await chrome.storage.local.get('batch');
 if(batch?.automatic){await chrome.storage.local.set({batch:{...batch,state:'parado'}});return {message:'Lote parado. A OS em execução será concluída; as próximas não serão iniciadas.'};}
 await chrome.storage.local.remove('batch');return {message:'Lote interrompido. A OS aberta foi preservada.'};
}
async function restoreAutomaticBatch(){
 const {batch}=await chrome.storage.local.get('batch');if(!batch?.automatic||batch.state!=='executando')return;
 if(batch.current){await chrome.storage.local.set({batch:{...batch,state:'interrompido',error:'Extensão reiniciou durante uma OS. Conferir esta OS; nenhum passo será repetido.'}});return;}
 if(!await chrome.alarms.get('rco-imas-batch'))await chrome.alarms.create('rco-imas-batch',{when:Date.now()+2000});
}

// Modo automático REMOVIDO (3.0.2): a extensão só trabalha quando você clica em Executar.
async function queueRetry(){let last;for(let i=0;i<3;i++){try{return await queue(25000);}catch(e){last=e;if(/Entre como Supervisor|403/.test(e.message))break;await wait(5000);}}throw last;}
// ===== 3.0: três botões de execução + Forçar fechamento (somente quando o supervisor clica) =====
async function runGroup(group){
 const jobs=(await queue()).jobs.filter(j=>!isProtected(j)&&j.ready);
 const isCorr=j=>j.report?.origin==='app';
 const pick=group==='create'?jobs.filter(j=>j.phase==='criar'):group==='corrective'?jobs.filter(j=>j.phase==='encerrar'&&isCorr(j)):jobs.filter(j=>j.phase==='encerrar'&&!isCorr(j));
 const nome=group==='create'?'OS corretivas para criar no IMAS':group==='corrective'?'OS corretivas para concluir':'OS preventivas liberadas';
 if(!pick.length)return {message:'Nenhuma das '+nome+' está pronta na fila.'};
 await audit('execucao-iniciada',{group,total:pick.length});
 return startAutomaticBatch(pick.map(j=>j.publicId),group==='create'?'create':'close');
}
// Forçar fechamento: para OS travada por erro. Libera as travas SÓ desta OS e reprocessa preservando as fotos.
// Se a OS já está Concluída no IMAS, apenas registra a baixa no app. Nunca reenvia fotos que já estão no IMAS.
async function forceClose(publicId){
 if(running||automaticBatchRunning)throw Error('Aguarde a execução atual terminar ou use Parar lote.');
 const job0=(await queue()).jobs.find(j=>j.publicId===publicId);
 if(!job0)throw Error('OS não encontrada na fila do app.');
 const protegida=isProtected(job0); // OS protegida: só é permitido registrar a baixa se já estiver Concluída no IMAS (somente leitura no IMAS)
 if(job0.phase!=='encerrar'||!/^\d+$/.test(job0.externalNumber||''))throw Error('Esta OS ainda não tem número do IMAS. Use "Criar OS corretivas" primeiro.');
 const st=await chrome.storage.local.get(['pending','closeAttempts']);
 if(st.pending&&st.pending.publicId!==publicId)throw Error('Há outra OS travada ('+(st.pending.reference||st.pending.publicId)+'). Force o fechamento dela primeiro.');
 // Só as travas de aprovação/tentativa são ignoradas; dados faltando (datas, observação, fotos) continuam bloqueando.
 const real=(job0.errors||[]).filter(e=>!/aprova|revis[aã]o do supervisor|tentativa anterior/i.test(e));
 const ca={...(st.closeAttempts||{})};delete ca[publicId];
 await chrome.storage.local.set({closeAttempts:ca});await chrome.storage.local.remove('pending');

 FORCED.add(publicId);
 try{
 await audit('fechamento-forcado-inicio',{publicId,osNumber:job0.externalNumber,state:job0.report?.automationState||'',errors:job0.errors});
 const tab=await imasTab();
 await openForm(tab,{...job0,ready:true,errors:[]});await chrome.tabs.reload(tab.id);await loaded(tab.id);await wait(1500);
 if(await imasConcluded(tab)){
  await message(await rcoTab(),{action:'baixar',publicId,osNumber:job0.externalNumber});
  await audit('baixa-forcada',{publicId,osNumber:job0.externalNumber,message:'OS já Concluída no IMAS; baixa registrada no app sem alterar o IMAS.'});
  return {message:'OS '+job0.externalNumber+': já está Concluída no IMAS. Baixa registrada no app, sem alterar nada no IMAS.'};
 }
 if(protegida)throw Error('OS '+job0.externalNumber+' é protegida e ainda NÃO está Concluída no IMAS: a extensão não vai alterá-la. Conclua no IMAS à mão e use Forçar fechamento de novo para registrar a baixa.');
 if(real.length)throw Error('OS '+job0.externalNumber+' não pode ser fechada: '+real.join('; '));
 const forced={...job0,ready:true,errors:[]};safeJob(forced);
 await audit('fechamento-forcado-reprocesso',{publicId,osNumber:job0.externalNumber});
 await processApprovedClosing(forced);
 return {message:'OS '+job0.externalNumber+': fechamento forçado concluído e baixa registrada.'};
 }finally{FORCED.delete(publicId);}
}
// Conferência de baixas (SOMENTE LEITURA no IMAS): para OS já concluídas no IMAS e ainda sem baixa no app, confirma pela leitura do IMAS e registra a baixa.
async function reconcileBaixas(){
 if(running||automaticBatchRunning)throw Error('Aguarde a execução atual terminar.');
 const {pending}=await chrome.storage.local.get('pending');if(pending)throw Error('Há uma OS travada; libere antes.');
 const data=await queue();
 const candidates=data.jobs.filter(j=>j.phase==='encerrar'&&j.ready&&j.externalNumber&&!isProtected(j)&&j.report?.automationState!=='processing').slice(0,15);
 const confirmed=[],pendingList=[];
 for(const j of candidates){
  try{await verifyReview(j.publicId);confirmed.push(j.externalNumber);}
  catch(e){pendingList.push(j.externalNumber+': '+String(e.message).slice(0,140));}
 }
 await audit('conferencia-baixas',{confirmed,pending:pendingList.length});
 return {message:`Conferência concluída (somente leitura). Baixa registrada: ${confirmed.length?confirmed.join(', '):'nenhuma'}.`+(pendingList.length?`\nAinda não concluídas no IMAS: ${pendingList.join(' | ')}`:'')};
}
async function verifyReview(publicId){
 if(running||automaticBatchRunning||(await chrome.storage.local.get('pending')).pending)throw Error('Aguarde a execução ou revisão atual terminar.');
 const job=safeJob((await queue()).jobs.find(j=>j.publicId===publicId));
 if(job.phase!=='encerrar')throw Error('Não há encerramento verificável para esta OS.');
 running=true;activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'running',step:'Verificar revisão sem alterar IMAS',events:[],controls:[]};
 try{
  const tab=await imasTab();const currentUrl=new URL(tab.url);if(currentUrl.pathname!=='/ordem_servico_form.php'||currentUrl.searchParams.get('id_ordem_servico')!==job.externalNumber)await prepareAutomaticBatchStart();await openForm(tab,job);await chrome.tabs.reload(tab.id);await loaded(tab.id);activeRun.tabId=tab.id;
  const [identity]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:number=>location.origin==='https://admin.rcoengenharia.com'&&location.pathname==='/ordem_servico_form.php'&&new URL(location.href).searchParams.get('id_ordem_servico')===number&&document.getElementById('id_ordem_servico')?.value===number&&document.getElementById('id_cliente')?.value==='91',args:[job.externalNumber]});
  if(!identity?.result)throw Error('Número ou cliente divergente. Nenhuma baixa confirmada.');
  await engine(tab,'ensurePhotoSection',job);await wait(2000);
  const persisted=await engine(tab,'audit',{...job,verifyUploaded:true});
  const linked=await engine(tab,'linkedPhotos',job);
  if(!persisted.ok||linked.count!==job.report.photos.length)throw Error('Revisão necessária: '+(persisted.errors.join('; ')||'fotos não confirmadas'));
  await message(await rcoTab(),{action:'baixar',publicId,osNumber:job.externalNumber});
  activeRun.state='completed';await trace('Encerramento verificado — baixa confirmada','ok');await syncDiagnostic(true);
  await audit('encerramento-confirmado',{publicId,osNumber:job.externalNumber,photos:linked.count});
  return {message:'OS '+job.externalNumber+': baixa confirmada pela leitura do IMAS. Nenhuma foto ou campo foi alterado.'};
 }catch(e){activeRun.state='failed';await trace('Verificar revisão','failed',{message:e.message});await syncDiagnostic(true);throw e;}
 finally{running=false;activeRun=null;}
}

chrome.alarms.onAlarm.addListener(alarm=>{
 if(alarm.name==='rco-imas-batch')automaticBatchStep().catch(e=>audit('lote-bloqueado',{message:e.message}));
});
async function boot(){
 // Limpa resíduos das versões de teste (gravação, autoatualização, autorizações pontuais).
 await chrome.alarms.clear('rco-source-update');await chrome.alarms.clear('rco-imas');
 await chrome.storage.local.remove(['finalRecording','reviewedReprocess','reviewed166Final','reset323140Authorized','tabRecovery323140','photoSectionRecovery','localUploadTest','completeD6Test','navigationRecoveryD6','manual323963Checked','schedulePolicy','updateStatus','scheduleEnabled','scheduledBacklogPending','lastScheduleAt']);
 await chrome.alarms.clear('rco-cycle');await chrome.alarms.clear('rco-intake');await chrome.storage.local.remove(['autoSendEnabled','nextCycleAt','lastCycle']);await reconnectRco();
}
chrome.runtime.onInstalled.addListener(()=>boot().catch(e=>audit('inicializacao-falhou',{message:e.message})));
chrome.runtime.onStartup.addListener(()=>boot().catch(e=>audit('inicializacao-falhou',{message:e.message})));
async function recordClosingPreflightFailure(publicId,error,startedAt){
 if(running||/protegida/.test(error.message))return; // Never overwrite another live execution or inspect a protected OS.
 const {lastDiagnostic,pending}=await chrome.storage.local.get(['lastDiagnostic','pending']);
 if(lastDiagnostic?.publicId===publicId&&lastDiagnostic.version===chrome.runtime.getManifest().version&&lastDiagnostic.events?.some(e=>Date.parse(e.at)>=startedAt))return;
 let controls=[];if(pending?.publicId===publicId&&pending.tabId){try{controls=await engine({id:pending.tabId},'diagnostics');}catch{}}
 activeRun={runId:crypto.randomUUID(),publicId,version:chrome.runtime.getManifest().version,state:'failed',step:'Conferir encerramento antes do envio',events:[],controls,tabId:pending?.tabId};
 try{await trace('Conferir encerramento antes do envio','failed',{message:error.message});await syncDiagnostic(true);}finally{activeRun=null;}
}

chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(m.action==='trace-step'&&running&&activeRun&&sender.id===chrome.runtime.id&&sender.tab?.id===activeRun.tabId&&sender.tab?.url?.startsWith(IMAS)){
  trace(String(m.step).slice(0,80),'running',{field:String(m.field||'').slice(0,60),path:String(m.path||'').split('?')[0].slice(0,120)}).then(()=>respond({received:true})).catch(()=>respond({received:false}));return true;
 }
 const fromPopup=!sender.tab&&sender.id===chrome.runtime.id;
 const fromRco=sender.id===chrome.runtime.id&&sender.tab?.url?.startsWith(RCO);
 if(!fromPopup&&!fromRco)return;
 // Ações que a página do app RCO pode disparar (botões do painel do supervisor).
 if(!fromPopup&&!['preview','batch','save-creation','create-save','close-save','review-check','intake','run-create','run-close-corrective','run-close-preventive','force-close'].includes(m.action))return;
 const startedAt=Date.now();
 (async()=>{
  if(['preview','create-save','close-save','save-creation','release'].includes(m.action)&&(await chrome.storage.local.get('batch')).batch?.state==='executando')throw Error('O lote está executando. Pare o lote antes de iniciar outra operação.');
  switch(m.action){
   case 'queue':{const data=await queue();return {jobs:data.jobs.map(j=>({publicId:j.publicId,reference:j.reference,externalNumber:j.externalNumber||'',phase:j.phase,ready:j.ready,errors:j.errors,origin:j.report?.origin||'',state:j.report?.automationState||'',approved:!!j.approvalRequest,protectedOs:isProtected(j)}))};}
   case 'preview':return preview(m.publicId);
   case 'create-save':return createAndSave(m.publicId);
   case 'close-save':return closeAndSave(m.publicId);
   case 'save-creation':if(m.confirmed===true)return savePrepared(m.publicId);break;
   case 'intake':return {message:'Aprovação registrada. Abra a extensão e clique em Executar quando quiser enviar ao IMAS.'};
   case 'review-check':return verifyReview(m.publicId);
   case 'batch':return startAutomaticBatch(m.publicIds);
   case 'batch-stop':return stopAutomaticBatch();
   case 'reconcile':return reconcileBaixas();
   case 'run-create':return runGroup('create');
   case 'run-close-corrective':return runGroup('corrective');
   case 'run-close-preventive':return runGroup('preventive');
   case 'force-close':return forceClose(m.publicId);
   case 'release':{
    if(running||automaticBatchRunning)throw Error('Aguarde a execução terminar.');
    const {pending}=await chrome.storage.local.get('pending');if(!pending)return {message:'Nenhuma OS travada.'};
    await chrome.storage.local.remove('pending');await audit('os-liberada-manual',{publicId:pending.publicId,state:pending.state});
    return {message:`OS ${pending.reference||pending.publicId} liberada (estado: ${pending.state}). Confira no IMAS antes de reenviar; tentativas de salvar/enviar continuam registradas.`};
   }
   case 'status':return {...await chrome.storage.local.get(['pending','batch','contractState']),maxFotos:CONFIG.maxFotosSemRevisao,running:running||automaticBatchRunning};
  }
  throw Error('Ação não disponível.');
 })().then(respond).catch(async e=>{if(m.action==='close-save'){try{await recordClosingPreflightFailure(m.publicId,e,startedAt);}catch{}}respond({error:e.message,message:'Erro: '+e.message});});return true;
});

async function reconnectRco(){for(const tab of await chrome.tabs.query({url:RCO+'*'})){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['rco.js']}).catch(()=>{});}}
// Reinício do service worker: recria alarmes e reconecta, sem repetir execuções perdidas.
chrome.alarms.clear('rco-cycle');chrome.alarms.clear('rco-intake');
reconnectRco().then(()=>recoverCreationOk()).catch(e=>audit('ok-criacao-pendente',{message:e.message}));
restoreAutomaticBatch().catch(e=>audit('lote-bloqueado',{message:e.message}));
