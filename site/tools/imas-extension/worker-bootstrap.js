// A separate classic entrypoint keeps load errors readable without changing OS operations.
// Published as schedule.js to preserve the installed updater's fixed nine-file allowlist.
(()=>{
 let rcoBootLoaded=false,rcoBootError='';
 const rcoBootRecord=(state,error='')=>chrome.storage.local.set({workerStartup:{version:chrome.runtime.getManifest().version,at:new Date().toISOString(),entry:'schedule.js',state,error}}).catch(()=>{});
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||sender.tab||rcoBootLoaded)return;
  if(!['status','queue','diagnostic'].includes(message.action))return;
  respond({error:'Não foi possível carregar a automação: '+(rcoBootError||'inicialização incompleta')});
 });
 try{importScripts('background.js');rcoBootLoaded=true;rcoBootRecord('ready');}
 catch(error){rcoBootError=String(error?.message||error).slice(0,1000);rcoBootRecord('failed',rcoBootError);}
})();
