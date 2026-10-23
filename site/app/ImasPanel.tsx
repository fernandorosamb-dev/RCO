"use client";
import {useEffect,useState} from "react";
import type {ExportReport} from "./report-export";
import {requiresSupervisorReview} from "./supervisor-holds";
import {imasJob} from "./imas-jobs";
import {approvalFingerprint} from "./imas-approval";
import ReportEditor from "./ReportEditor";
import EngineerEdit from "./EngineerEdit";
import ReviewPhotos from "./ReviewPhotos";
// Engenheiro: as ações viram pedidos para o supervisor; ele só vê que o pedido foi enviado.
let sentCache:{at:number;ids:Promise<string[]>}|null=null;
const sentIds=()=>{if(!sentCache||Date.now()-sentCache.at>10000)sentCache={at:Date.now(),ids:fetch("/api/reports/proposals",{cache:"no-store"}).then(r=>r.ok?r.json():{sent:[]}).then(d=>d.sent||[]).catch(()=>[])};return sentCache.ids;};
export default function ImasPanel({report,onSaved,mode="supervisor"}:{report:ExportReport;onSaved:()=>Promise<void>;reviewOnly?:boolean;mode?:"supervisor"|"engineer"}){
 const eng=mode==="engineer";
 const job=imasJob(report),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[reviewing,setReviewing]=useState(false),[number,setNumber]=useState(""),[returning,setReturning]=useState(false),[reason,setReason]=useState(""),[sent,setSent]=useState(false);
 useEffect(()=>{if(eng)void sentIds().then(ids=>setSent(ids.includes(report.publicId)));},[eng,report.publicId]);
 const waiting=(report.automationState==="queued"&&!requiresSupervisorReview(report))||report.automationState==="processing";
 const post=async(url:string,body:unknown,method="POST")=>{const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||"Não foi possível concluir.");return result;};
 const run=async(task:()=>Promise<string|void>,fail:string)=>{setBusy(true);setMessage("");try{const text=await task();if(text)setMessage(text);await onSaved();}catch(e){setMessage(e instanceof Error?e.message:fail);}finally{setBusy(false);}};
 const propose=async(action:string,extra:Record<string,unknown>={})=>{await post("/api/reports/proposals",{publicId:report.publicId,action,...extra});sentCache=null;setSent(true);setReviewing(false);setReturning(false);return "Enviado.";};
 const approve=()=>run(async()=>{if(eng)return propose("approve");await post("/api/imas/approve",{publicId:report.publicId,photoIds:report.photos.map(p=>p.publicId),fingerprint:await approvalFingerprint(report)});document.dispatchEvent(new CustomEvent("rco-imas-approved",{detail:{publicId:report.publicId}}));return "OS aprovada e enviada para conclusão automática.";},"Não foi possível aprovar.");
 const reject=()=>{
  const isNew=report.origin==="app"&&!job.externalNumber;
  if(!eng&&!window.confirm(isNew?`Rejeitar a OS ${report.osNumber}? Ela será excluída e não será criada no IMAS.`:`Rejeitar a OS ${report.imasOsNumber||report.osNumber}? Os dados enviados serão zerados e a OS volta para a fila do colaborador.`))return;
  return run(async()=>{if(eng)return propose("reject");return (await post("/api/reports/reject",{publicId:report.publicId})).message;},"Não foi possível rejeitar.");
 };
 const giveBack=(event:React.FormEvent)=>{event.preventDefault();return run(async()=>{if(eng)return propose("return",{reason});const r=await post("/api/reports/return",{publicId:report.publicId,reason});setReturning(false);return r.message;},"Não foi possível devolver.");};
 const link=()=>run(async()=>{await post("/api/imas/link",{publicId:report.publicId,osNumber:number});},"Falha no vínculo.");
 const locked=busy||report.automationState==="processing"||sent;
 return <section className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-slate-900"><p className="font-bold">{sent?"Pedido enviado":report.automationState==="processing"?"OS em processamento":waiting?"OS na fila automática":"Revisão da OS"}</p>
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" className="report-button" disabled={locked||waiting||report.status==="Devolvida"} onClick={()=>void approve()}>{busy?"Aguarde…":waiting?"Aprovada":"Aprovar"}</button>
   <button type="button" className="report-button" disabled={locked} onClick={()=>void reject()}>Rejeitar</button>
   <button type="button" className="report-button" disabled={busy||report.automationState==="processing"} aria-expanded={reviewing} onClick={()=>setReviewing(v=>!v)}>{reviewing?"Fechar revisão":"Revisar"}</button>
  </div>
  {report.returnReason&&<p className="mt-3 text-sm"><b>Correção solicitada:</b> {report.returnReason}</p>}
  {message&&<p role="status" className="mt-2 text-sm font-semibold">{message}</p>}
  {reviewing&&<div className="mt-4 space-y-3"><p className="whitespace-pre-line text-sm">{report.observations}</p><ReviewPhotos report={report} supervisor={!eng} onSaved={onSaved}/>
   <div className="flex flex-wrap gap-2"><button type="button" className="report-button" disabled={locked||report.status==="Devolvida"} onClick={()=>setReturning(v=>!v)}>Devolver ao colaborador</button><button type="button" className="report-button" disabled={locked||waiting||report.status==="Devolvida"} onClick={()=>void approve()}>Aprovar</button></div>
   {returning&&<form onSubmit={giveBack} className="space-y-2"><label className="field"><span>O que o colaborador precisa corrigir?</span><textarea required maxLength={1000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="report-button" disabled={busy} type="submit">Confirmar devolução</button><button className="report-button ml-2" type="button" onClick={()=>setReturning(false)}>Cancelar</button></form>}
   {eng?<EngineerEdit report={report} disabled={locked} onSent={async()=>{sentCache=null;setSent(true);setReviewing(false);setMessage("Enviado.");await onSaved();}}/>:<ReportEditor report={report} supervisor onSaved={onSaved} buttonLabel="Editar"/>}
   {!eng&&!job.externalNumber&&report.origin==="app"&&<details><summary>OS criada manualmente no IMAS</summary><label className="field"><span>Número oficial no IMAS</span><input inputMode="numeric" value={number} onChange={e=>setNumber(e.target.value.replace(/\D/g,""))}/></label><button type="button" className="report-button" disabled={busy||!number} onClick={()=>void link()}>Vincular número</button></details>}
  </div>}
 </section>;
}
