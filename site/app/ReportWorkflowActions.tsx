"use client";
import {useState} from "react";
import {approvalFingerprint} from "./imas-approval";
import type {ExportReport} from "./report-export";
export default function ReportWorkflowActions({report,onSaved}:{report:ExportReport;onSaved:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const official=report.origin==="app"?report.imasOsNumber:report.osNumber;
 const waitingExecution=["Aguardando criação","Aguardando execução"].includes(report.status);
 const failed=report.supervisorReleased&&["failed","completed","review"].includes(report.automationState||"");
 async function update(action:"retry"|"force"|"completed"){
  if((action==="completed"||action==="force")&&!window.confirm(`Confirma que abriu a OS ${official} no IMAS e conferiu que ela está encerrada, com dados e fotos corretos? Esta confirmação registra a baixa na plataforma.`))return;

  const closing=action!=="retry";
  setBusy(true);setMessage("");
  try{
   const response=await fetch(closing?"/api/reports/confirm-closed":"/api/imas/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(closing?{publicId:report.publicId,expectedNumber:official,fingerprint:await approvalFingerprint(report),confirmed:true}:{publicId:report.publicId,action,fingerprint:await approvalFingerprint(report)})});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível atualizar.");
   setMessage(closing?"OS fechada no RCO e retirada da fila conforme sua confirmação no IMAS.":"OS recolocada na fila. Sua aprovação foi mantida.");
   window.dispatchEvent(new Event("rco-imas-updated"));await onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao atualizar.");}finally{setBusy(false);}
 }
 return <div className="mt-3 space-y-3">
 {failed&&<div className="rounded-lg border border-amber-400 p-3"><p className="font-bold">Erro do IMAS · aprovação mantida</p><p className="mt-1 text-sm">{report.automationFeedback?.reason||"A automação não confirmou a gravação. Confira a OS antes de retomar."}</p>{report.automationFeedback?.step&&<p className="mt-1 text-sm">Etapa: {report.automationFeedback.step}</p>}<button className="report-button mt-3" disabled={busy||!official||report.automationState==="processing"} type="button" onClick={()=>void update("force")}>Forçar fechamento</button><p className="mt-2 text-xs">Use se já está encerrada no IMAS. Registra a baixa somente no RCO e retira da fila.</p></div>}
 <div className="rounded-lg border border-slate-300 p-3"><p className="text-sm font-semibold">Situação da OS no IMAS</p><p className="mt-1 text-xs">Confira no IMAS antes de usar.</p><div className="mt-3 flex flex-wrap gap-2">
 <button type="button" className="report-button" disabled={busy||!report.supervisorReleased||["processing","queued"].includes(report.automationState||"")||waitingExecution} onClick={()=>void update("retry")}>Reabrir OS — voltar à fila de encerramento</button>
 <button type="button" className="report-button" disabled={busy||!official||report.automationState==="processing"} onClick={()=>void update("completed")}>Já está OK no IMAS — encerrar no RCO</button>
 </div><p className="mt-2 text-xs">Reabrir: a OS volta à fila mantendo a aprovação, fotos e relatório. Já está OK: registra a baixa só no RCO e tira a OS da fila, sem mexer no IMAS.</p></div>{message&&<p role="status" className="text-sm font-semibold">{message}</p>}</div>;
}
