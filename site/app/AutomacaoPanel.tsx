"use client";
import {useCallback,useEffect,useState} from "react";
// Painel do supervisor: aciona a extensão "RCO para IMAS" (3.0+) com cliques manuais. Nada roda sozinho.
type QueueJob={publicId:string;externalNumber?:string;phase:string;ready:boolean;errors?:string[];report?:{origin?:string;automationState?:string};approvalRequest?:unknown};
type Run={publicId:string;state:string;step:string;updatedAt:number;events:{at:string;status:string;step:string;message?:string}[]};
const fire=(name:string,detail?:unknown)=>document.dispatchEvent(new CustomEvent(name,{detail}));
export default function AutomacaoPanel(){
 const [jobs,setJobs]=useState<QueueJob[]>([]),[runs,setRuns]=useState<Run[]>([]),[force,setForce]=useState(""),[showAudit,setShowAudit]=useState(false),[note,setNote]=useState("");
 const load=useCallback(async()=>{
  try{const q=await fetch("/api/imas/queue",{cache:"no-store"});if(q.ok)setJobs(((await q.json()).jobs||[]) as QueueJob[]);}catch{}
  try{const d=await fetch("/api/imas/diagnostics",{cache:"no-store"});if(d.ok)setRuns(((await d.json()).runs||[]) as Run[]);}catch{}
 },[]);
 useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener("rco-imas-updated",refresh);window.addEventListener("focus",refresh);return()=>{window.removeEventListener("rco-imas-updated",refresh);window.removeEventListener("focus",refresh);};},[load]);
 const corr=(j:QueueJob)=>j.report?.origin==="app";
 const toCreate=jobs.filter(j=>j.ready&&j.phase==="criar").length;
 const toCorr=jobs.filter(j=>j.ready&&j.phase==="encerrar"&&corr(j)).length;
 const toPrev=jobs.filter(j=>j.ready&&j.phase==="encerrar"&&!corr(j)).length;
 const stuck=jobs.filter(j=>j.phase==="encerrar"&&j.externalNumber).sort((a,b)=>Number(b.report?.automationState==="failed")-Number(a.report?.automationState==="failed"));
 const number=new Map(jobs.map(j=>[j.publicId,j.externalNumber||j.publicId.slice(0,6)]));
 const errors=runs.filter(r=>r.state==="failed").slice(0,15);
 const ask=(text:string,event:string)=>{if(window.confirm(text)){setNote("Comando enviado à extensão. Acompanhe o aviso na parte de baixo da tela.");fire(event);window.setTimeout(()=>void load(),4000);}};
 return <section className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-slate-900" aria-label="Automação IMAS">
  <p className="font-bold">Automação IMAS <span className="text-sm font-normal">(só roda quando você clica; precisa da extensão ligada)</span></p>
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" className="report-button" disabled={!toCreate} onClick={()=>ask(`Criar ${toCreate} OS corretiva(s) no IMAS? O número volta para o app.`,"rco-imas-run-create")}>Criar OS corretivas ({toCreate})</button>
   <button type="button" className="report-button" disabled={!toCorr} onClick={()=>ask(`Concluir ${toCorr} OS corretiva(s) no IMAS?`,"rco-imas-run-corrective")}>Concluir OS corretivas ({toCorr})</button>
   <button type="button" className="report-button" disabled={!toPrev} onClick={()=>ask(`Concluir ${toPrev} OS preventiva(s) liberada(s) no IMAS?`,"rco-imas-run-preventive")}>Concluir preventivas liberadas ({toPrev})</button>
   <button type="button" className="report-button" aria-expanded={showAudit} onClick={()=>{setShowAudit(v=>!v);void load();}}>Auditoria do processo{errors.length?` (${errors.length} erro${errors.length>1?"s":""})`:""}</button>
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-2">
   <select className="field" aria-label="OS para forçar o fechamento" value={force} onChange={e=>setForce(e.target.value)}>
    <option value="">Forçar fechamento: escolha a OS…</option>
    {stuck.map(j=><option key={j.publicId} value={j.publicId}>{j.externalNumber} · {corr(j)?"corretiva":"preventiva"} · {j.report?.automationState==="failed"?"ERRO":j.report?.automationState==="processing"?"TRAVADA?":j.ready?"pronta":"pendente"}</option>)}
   </select>
   <button type="button" className="report-button" disabled={!force} onClick={()=>{if(window.confirm("Forçar o fechamento desta OS?\n• Se já estiver Concluída no IMAS, só registra a baixa no app.\n• Senão, ignora as travas desta OS e reprocessa sem reenviar fotos.")){setNote("Fechamento forçado enviado à extensão.");fire("rco-imas-force",{publicId:force});window.setTimeout(()=>void load(),5000);}}}>Forçar fechamento</button>
  </div>
  {note&&<p role="status" className="mt-2 text-sm font-semibold">{note}</p>}
  {showAudit&&<div className="mt-3 text-sm"><p className="font-semibold">Erros registrados pela extensão (mais recentes primeiro)</p>
   {errors.length===0?<p>Nenhum erro registrado.</p>:<ul className="mt-1 space-y-2">{errors.map(r=>{const last=[...r.events].reverse().find(e=>e.message)||r.events[r.events.length-1];return <li key={r.publicId+r.updatedAt} className="rounded border border-cyan-200 bg-white p-2"><b>OS {number.get(r.publicId)}</b> · {new Date(r.updatedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}<br/>Etapa: {r.step}<br/>{last?.message||"Sem mensagem."}</li>;})}</ul>}
   <p className="mt-2 text-xs">O log completo (.txt) é baixado pelo botão "Auditoria do processo" da extensão.</p></div>}
 </section>;
}
