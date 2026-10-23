(()=>{
const $=id=>document.getElementById(id);
const status=$('status'),jobs=$('jobs');
let st={},queueJobs=[],working=false;

async function call(action,data={}){
 const request=chrome.runtime.sendMessage({action,...data});
 const quick=['queue','status'].includes(action);
 let timer;
 try{
  const result=await Promise.race([request,...(quick?[new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error(`A extensão não respondeu em 10 s (etapa: ${action}). Atualize a aba do RCO (F5), confira que está logada como Supervisor e abra o popup de novo.`)),10000);})]:[])]);
  if(!result)throw Error('Sem resposta. Confira a Auditoria antes de repetir.');
  if(result.error)throw Error(result.error);
  return result;
 }finally{clearTimeout(timer);}
}
const isCorr=j=>j.origin==='app';
const groups=()=>({
 create:queueJobs.filter(j=>j.ready&&!j.protectedOs&&j.phase==='criar'),
 corr:queueJobs.filter(j=>j.ready&&!j.protectedOs&&j.phase==='encerrar'&&isCorr(j)),
 prev:queueJobs.filter(j=>j.ready&&!j.protectedOs&&j.phase==='encerrar'&&!isCorr(j))
});
function render(){
 const busy=working||st.running||st.batch?.state==='executando';
 $('ver').textContent='v'+chrome.runtime.getManifest().version;
 const g=groups();
 $('create').textContent=`Criar OS corretivas no IMAS (${g.create.length})`;
 $('corr').textContent=`Concluir OS corretivas (${g.corr.length})`;
 $('prev').textContent=`Concluir OS preventivas liberadas (${g.prev.length})`;
 $('create').disabled=busy||!g.create.length;$('corr').disabled=busy||!g.corr.length;$('prev').disabled=busy||!g.prev.length;
 $('stop').disabled=st.batch?.state!=='executando';
 $('force').disabled=busy||!jobs.value;
}
function summary(){
 const b=st.batch,p=st.pending,lines=[];
 const c=st.contractState;
 if(c&&c.state!=='ok')lines.push(`Contrato com o app: ${c.state}${c.note?' — '+c.note:''}`);
 if(p)lines.push(`OS travada: ${p.reference||p.publicId} — ${p.state}. Selecione-a abaixo e use Forçar fechamento.`);
 if(b){
  const semEquip=(b.skipped||[]).filter(j=>/FALTA EQUIPAMENTO/.test(j.reason||''));
  if(semEquip.length)lines.push('⚠ FALTA EQUIPAMENTO em: OS '+semEquip.map(j=>j.reference).join(', ')+'\nNo IMAS: abra a OS > Equipamentos > Adicionar equipamento. Depois rode de novo.');
  lines.push(`Lote ${b.state}: ${b.completed?.length||0} concluídas · ${b.remaining?.length||0} restantes · ${b.skipped?.length||0} para conferir`+(b.error?'\n'+b.error:''));
  for(const j of (b.skipped||[]).filter(j=>!/FALTA EQUIPAMENTO/.test(j.reason||'')).slice(0,8))lines.push(`  • OS ${j.reference}: ${String(j.reason||'').slice(0,160)}`);
 }
 return lines.join('\n');
}
async function refresh(){st=await call('status');render();}
function stateLabel(j){
 if(j.protectedOs)return 'PROTEGIDA (só baixa)';
 if(j.state==='failed')return 'ERRO';
 if(j.state==='processing')return 'TRAVADA?';
 if(!j.ready)return 'PENDENTE';
 return j.phase==='criar'?'criar':'pronta';
}
async function loadQueue(){
 const result=await call('queue');queueJobs=result.jobs;jobs.replaceChildren();
 const list=queueJobs.filter(j=>j.phase==='encerrar'&&j.externalNumber);
 // OS com problema primeiro.
 const rank=j=>j.state==='failed'?0:j.state==='processing'?1:!j.ready?2:3;
 list.sort((a,b)=>rank(a)-rank(b));
 if(!list.length)jobs.append(new Option('Nenhuma OS para forçar',''));
 else jobs.append(new Option('Selecione uma OS para forçar…',''));
 for(const j of list)jobs.append(new Option(`${j.externalNumber} · ${isCorr(j)?'corretiva':'preventiva'} · ${stateLabel(j)}${j.errors?.length?' · '+j.errors[0].slice(0,40):''}`,j.publicId));
 jobs.selectedIndex=0;
 const g=groups();
 return `${queueJobs.length} OS na fila · criar: ${g.create.length} · corretivas: ${g.corr.length} · preventivas liberadas: ${g.prev.length}.`;
}
async function run(fn){
 if(working)return;working=true;render();
 try{status.textContent='Executando…';status.textContent=await fn()||'';}
 catch(e){status.textContent=e.message;}
 finally{working=false;try{await refresh();}catch{}}
}
jobs.onchange=render;
const start=(action,rotulo,lista,aviso)=>()=>run(async()=>{
 const n=lista().length;if(!n)return 'Nada pronto para executar.';
 if(!confirm(`${rotulo}: ${n} OS, uma por vez.\n${aviso}\nIsso grava no sistema do cliente. Continuar?`))return 'Cancelado.';
 return (await call(action)).message;
});
$('create').onclick=start('run-create','Criar no IMAS',()=>groups().create,'A OS nasce como Aberta e o número volta para o app.');
$('corr').onclick=start('run-close-corrective','Concluir corretivas',()=>groups().corr,'Fotos + dados + Salvar; depois a baixa no app.');
$('prev').onclick=start('run-close-preventive','Concluir preventivas liberadas',()=>groups().prev,'Fotos + dados + Salvar; depois a baixa no app.');
$('stop').onclick=()=>run(async()=>(await call('batch-stop')).message);
$('force').onclick=()=>run(async()=>{
 const j=queueJobs.find(x=>x.publicId===jobs.value);if(!j)throw Error('Selecione uma OS.');
 if(!confirm(`Forçar o fechamento da OS ${j.externalNumber}?\n• Se já estiver Concluída no IMAS: só registra a baixa no app.\n• Se não: ignora as travas de tentativa/aprovação desta OS e reprocessa SEM reenviar fotos que já estão no IMAS.`))return 'Cancelado.';
 const r=await call('force-close',{publicId:j.publicId});await loadQueue();return r.message;
});
$('audit').onclick=async()=>{
 try{
  const r=await chrome.storage.local.get(['workerStartup','pending','lastDiagnostic','diagnosticSync','audit','batch','batchHistory']);
  const d=r.lastDiagnostic;
  const fmt=at=>new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const line=e=>`${fmt(e.at)} ${e.kind}${e.osNumber?' · OS '+e.osNumber:''}${e.message?' — '+e.message:''}`;
  const header=[
   `RCO → IMAS · AUDITORIA · v${chrome.runtime.getManifest().version} · ${fmt(new Date())}`,
   `Inicialização: ${r.workerStartup?.state||'?'}${r.workerStartup?.error?' — '+r.workerStartup.error:''}`,
   r.pending?`OS travada: ${r.pending.reference||r.pending.publicId} — ${r.pending.state}`:'Nenhuma OS travada.'
  ];
  const lastRun=d?[`\nÚltima execução (${d.state}) — sincronização: ${r.diagnosticSync||'-'}`,...d.events.slice(-20).map(e=>`${fmt(e.at)} [${e.status}] ${e.step}${e.field?' · '+e.field:''}${e.message?' — '+e.message:''}`)]:[];
  const errors=(r.audit||[]).filter(e=>/falh|erro|bloque|pendente|forcad|forçad|aviso|adiado/i.test(e.kind+' '+(e.message||''))).slice(-30).map(line);
  const full=[...header,...lastRun,'\nERROS E AVISOS (últimos 30):',...(errors.length?errors:['nenhum']),'\nTODOS OS EVENTOS:',...(r.audit||[]).map(line)].join('\n');
  status.textContent=[...header,...lastRun,'\nERROS E AVISOS:',...(errors.length?errors.slice(-12):['nenhum']),'\n(log completo baixado em Downloads)'].join('\n');
  const url=URL.createObjectURL(new Blob([full],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='RCO-auditoria-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){status.textContent='Não foi possível ler a auditoria: '+e.message;}
};
run(async()=>{await refresh();const q=await loadQueue();return [summary(),q].filter(Boolean).join('\n');});
setInterval(async()=>{if(working||st.batch?.state!=='executando')return;try{await refresh();status.textContent=summary();}catch{}},2000);
})();
