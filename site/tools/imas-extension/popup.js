(()=>{
const status=document.getElementById('status'),jobs=document.getElementById('jobs'),prepare=document.getElementById('prepare');
let current={},working=false,queueJobs=[];
async function call(action,data={}){
 const request=chrome.runtime.sendMessage({action,...data});
 if(['queue','status','diagnostic'].includes(action)){
  let timer;try{return await Promise.race([request.then(result=>{if(!result)throw Error('A extensão não respondeu. Recarregue a extensão no Chrome.');if(result.error)throw Error(result.error);return result;}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A comunicação não respondeu em 10 segundos. Abra a auditoria para conferir. Nenhuma OS foi executada por esta consulta.')),10000);})]);}finally{clearTimeout(timer);}
 }
 const result=await request;if(!result)throw Error('Resposta ausente. Confira a auditoria antes de repetir a execução.');if(result.error)throw Error(result.error);return result;
}
async function refresh(){current=await chrome.storage.local.get(['pending','batch','batchHistory','autoSendEnabled','audit','updateStatus','lastDiagnostic','diagnosticSync','finalRecording']);document.getElementById('auto-send').checked=current.autoSendEnabled!==false;document.getElementById('batch-stop').disabled=current.batch?.state!=='executando';document.getElementById('batch-report').disabled=!current.batch?.automatic;prepare.disabled=!jobs.value;}

async function run(fn){if(working)return;working=true;try{status.textContent='Executando...';await fn();}catch(e){status.textContent=e.message;}finally{working=false;try{await refresh();}catch{}}}
document.getElementById('load').onclick=()=>run(async()=>{const result=await call('queue');queueJobs=result.jobs;jobs.replaceChildren();for(const j of result.jobs){const option=document.createElement('option');option.value=j.publicId;option.textContent=`${j.reference} · ${j.phase}${j.ready?'':' · PENDENTE: '+j.errors.join(', ')}`;option.disabled=!j.ready;jobs.append(option);}jobs.selectedIndex=[...jobs.options].findIndex(o=>!o.disabled);status.textContent=`${result.jobs.length} OS na fila.`;});
jobs.onchange=()=>prepare.disabled=!jobs.value;
prepare.onclick=()=>run(async()=>{if(jobs.value)status.textContent=(await call(queueJobs.find(j=>j.publicId===jobs.value)?.phase==='encerrar'?'close-save':'create-save',{publicId:jobs.value})).message;});
document.getElementById('batch').onclick=()=>run(async()=>status.textContent=(await call('batch')).message);
document.getElementById('batch-stop').onclick=()=>run(async()=>status.textContent=(await call('batch-stop')).message);
document.getElementById('diagnostic').onclick=async()=>{
 try{
 const r=await chrome.storage.local.get(['workerStartup','updateStatus','diagnosticSync','pending','lastDiagnostic','audit']);
 status.textContent=JSON.stringify({version:chrome.runtime.getManifest().version,connection:'verificando',workerStartup:r.workerStartup||null,update:r.updateStatus,diagnosticSync:r.diagnosticSync,pending:r.pending?{publicId:r.pending.publicId,state:r.pending.state,phase:r.pending.phase}:null,lastDiagnostic:r.lastDiagnostic||null,events:(r.audit||[]).slice(-20)},null,2);
 try{await call('status');status.textContent=status.textContent.replace('"connection": "verificando"','"connection": "respondendo"');}catch(e){status.textContent+='\nComunicação: '+e.message;}
 }catch(e){status.textContent='Não foi possível ler a auditoria local: '+e.message;}
};
run(async()=>{await refresh();status.textContent=`Versão: ${chrome.runtime.getManifest().version}\n${current.pending?current.pending.state:'Nenhuma OS em revisão.'}\n${current.finalRecording?.active?'Gravação ativa — confirme o OK manualmente.\n':''}${current.batch?'Lote: '+current.batch.state+' · '+(current.batch.completed?.length||0)+' concluídas · '+current.batch.remaining.length+' restantes · '+(current.batch.skipped?.length||0)+' para conferir.':''}`;});


setInterval(async()=>{if(working||!current.batch?.automatic||current.batch.state!=='executando')return;try{await refresh();if(current.batch?.automatic){status.textContent=`Lote: ${current.batch.state}\n${current.batch.completed.length} concluídas · ${current.batch.remaining.length} restantes\nConcluídas: ${current.batch.completed.map(j=>j.reference).join(', ')||'nenhuma'}\nPara conferir: ${current.batch.skipped.map(j=>j.reference||j.publicId).join(', ')||'nenhuma'}${current.batch.error?'\n'+current.batch.error:''}`;}}catch{}},2000);

function batchReport(batch){
 const date=at=>at?new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'em andamento';
 return ['RCO — RELATÓRIO DO LOTE IMAS',`Lote: ${batch.runId}`,`Início: ${date(batch.startedAt)}`,`Fim: ${date(batch.finishedAt)}`,`Estado: ${batch.state}`,`Confirmadas: ${batch.completed.length} | Pendentes de avaliação: ${batch.skipped.length} | Restantes: ${batch.remaining.length}`,'','BAIXAS CONFIRMADAS — conferir no IMAS',...batch.completed.map(j=>`OS ${j.reference} | ${date(j.at)} | ${j.publicId}`),'','PENDENTES DE AVALIAÇÃO — não reenviar fotos sem conferir',...batch.skipped.map(j=>`OS ${j.reference||j.publicId} | ${j.reason} | ${j.publicId}`),'','RESTANTES',...batch.remaining,batch.error||''].join('\n');
}
document.getElementById('batch-report').onclick=()=>run(async()=>{
 await refresh();if(!current.batch?.automatic)throw Error('Nenhum relatório de lote disponível.');
 const report=[...(current.batchHistory||[]).filter(b=>b.automatic).map(batchReport),batchReport(current.batch)].join("\n\n--------------------\n\n");status.textContent=report;
 const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='RCO-relatorio-lote-'+current.batch.startedAt.slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});


document.getElementById('auto-send').onchange=e=>run(async()=>status.textContent=(await call('auto-send',{enabled:e.target.checked})).message);

})();
