const RCO='https://rco-manutencao.fernandorosa-mb.chatgpt.site';
// Base independente: nenhum código nem permissão da extensão IMAS é alterado.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||message.action!=='consult-rh-queue')return;
 (async()=>{
  const tabs=await chrome.tabs.query({url:RCO+'/*'});if(!tabs.length)throw Error('Abra a plataforma RCO e entre como Supervisor.');
  const results=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},func:async()=>{
   const response=await fetch('/api/medical-documents/desktop-queue',{cache:'no-store'});const result=await response.json();if(!response.ok)return {error:result.error||'Não foi possível consultar a fila.'};return {schemaVersion:result.schemaVersion,mode:result.mode,automationEnabled:result.automationEnabled,message:result.message,expectedSender:result.expectedSender,pendingCount:result.pendingCount,references:result.jobs.map(job=>job.reference)};
  }});
  const result=results[0]?.result;if(!result||result.error)throw Error(result?.error||'A plataforma não respondeu.');
  // Esta versão apenas consulta. Não possui comando para redigir/anexar/enviar e-mail.
  const status={...result,automationEnabled:false,checkedAt:Date.now()};await chrome.storage.local.set({lastRhCheck:status});return status;
 })().then(data=>respond({data})).catch(error=>respond({error:error.message}));return true;
});
