(() => {
  const bridgeVersion=chrome.runtime.getManifest().version;
  if(globalThis.__rcoBridgeInstalled===bridgeVersion)return;globalThis.__rcoBridgeInstalled=bridgeVersion;
  const RCO='https://rco-manutencao.fernandorosa-mb.chatgpt.site';
  if(location.origin!==RCO)return;
  async function get(path,body) {
    const response=await fetch(path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Entre como Supervisor no RCO.');return result;
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(globalThis.__rcoBridgeInstalled!==bridgeVersion)return;
    if(sender.id!==chrome.runtime.id||!['fila','foto','diagnostic','vincular','baixar','approval-claim'].includes(message.action))return;
    (async()=>{
      if(message.action==='baixar'){const response=await fetch('/api/reports/downloaded',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:message.publicId,expectedNumber:message.osNumber})});const result=await response.json();if(!response.ok)throw Error(result.error||'Baixa não confirmada.');window.dispatchEvent(new Event('rco-imas-updated'));return result;}
      if(message.action==='vincular'){const result=await get('/api/imas/link',{publicId:message.publicId,osNumber:message.osNumber});window.dispatchEvent(new Event('rco-imas-updated'));return result;}
      if(message.action==='approval-claim'){const result=await get('/api/imas/approve',{action:'claim',publicId:message.publicId,requestId:message.requestId});window.dispatchEvent(new Event('rco-imas-updated'));return result;}
      if(message.action==='fila')return get('/api/imas/queue');
      if(message.action==='diagnostic'){const result=await get('/api/imas/diagnostics',message.run);if(['failed','completed'].includes(message.run?.state))window.dispatchEvent(new Event('rco-imas-updated'));return result;}
      // Only the authenticated photo endpoint; never arbitrary URLs supplied by pages.
      if(!/^\/api\/photos\/[a-zA-Z0-9-]+$/.test(message.url))throw Error('Endereço de foto inválido.');
      const response=await fetch(message.url,{cache:'no-store'});if(!response.ok)throw Error('Foto não disponível.');
      const blob=await response.blob();if(blob.type!=='image/jpeg')throw Error('A evidência não é JPEG.');
      return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    })().then(data=>respond({data})).catch(e=>respond({error:e.message}));return true;
  });
  for(const eventName of ['rco-imas-preview','rco-imas-batch','rco-imas-save','rco-imas-create-save','rco-imas-close-save','rco-imas-review-check','rco-imas-approved'])document.addEventListener(eventName,event=>{
    if(globalThis.__rcoBridgeInstalled!==bridgeVersion)return;
    const publicId=event.detail?.publicId;const publicIds=event.detail?.publicIds;if(eventName!=='rco-imas-batch'&&(typeof publicId!=='string'||!/^[-a-zA-Z0-9]+$/.test(publicId)))return;if(eventName==='rco-imas-batch'&&(!Array.isArray(publicIds)||!publicIds.every(id=>typeof id==='string'&&/^[-a-zA-Z0-9]+$/.test(id))))return;
    chrome.runtime.sendMessage({action:eventName==='rco-imas-approved'?'intake':eventName==='rco-imas-review-check'?'review-check':eventName==='rco-imas-close-save'?'close-save':eventName==='rco-imas-create-save'?'create-save':eventName==='rco-imas-save'?'save-creation':eventName==='rco-imas-batch'?'batch':'preview',publicId,publicIds,confirmed:eventName==='rco-imas-save'}).then(result=>{
      const box=document.createElement('div');box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;background:#173f67;color:white;padding:16px;border-radius:12px;';box.textContent=result?.message||'Confira a extensão.';box.onclick=()=>box.remove();document.body.append(box);setTimeout(()=>box.remove(),20000);
    });
  });
})();
