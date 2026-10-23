"use client";
import {useRoleRoster} from "./useRoleRoster";
import {scheduleWarning} from "./imas-schedule";
import {useState} from "react";
import {Pencil} from "lucide-react";
import {IMAS_SYSTEMS} from "./imas-config";
import type {ExportReport} from "./report-export";
// Edição do engenheiro: nada é gravado na OS; vira um pedido com "antes e depois" para o supervisor.
export default function EngineerEdit({report,onSent,disabled=false}:{report:ExportReport;onSent:()=>Promise<void>;disabled?:boolean}){
  const {executors,names}=useRoleRoster();
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const start=()=>({collaborator:report.collaborator,executionStartedAt:report.executionStartedAt,completedAt:report.completedAt,environment:report.environment,floor:report.floor,observations:report.observations,activityType:report.activityType||"",description:report.description||"",equipment:report.equipment||"",imasSystem:report.imasSystem||"",imasSubject:report.imasSubject||""});
 const [form,setForm]=useState(start);
 const set=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage("");try{
  const response=await fetch("/api/reports/proposals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:report.publicId,action:"edit",fields:form})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||"Não foi possível enviar.");setOpen(false);await onSent();
 }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível enviar.");}finally{setBusy(false);}}
 const input=(key:keyof ReturnType<typeof start>,label:string,type="text")=><label className="field"><span>{label}</span><input required type={type} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 if(!open)return <div><button type="button" className="report-button" disabled={disabled} onClick={()=>{setForm(start());setMessage("");setOpen(true);}}><Pencil size={17}/> Editar</button>{message&&<p role="status" className="mt-2 text-sm font-semibold">{message}</p>}</div>;
 return <form onSubmit={submit} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><fieldset disabled={busy} className="space-y-3">
  <h4 className="font-bold">Editar OS {report.imasOsNumber||report.osNumber}</h4>
  <label className="field"><span>Executor — cadastro IMAS</span><select required value={form.collaborator} onChange={e=>set("collaborator",e.target.value)}><option value="">Selecione</option>{[...new Set([...executors,report.collaborator].filter(Boolean))].map(n=><option key={n}>{n}</option>)}</select></label>
  {report.origin==="app"&&scheduleWarning(form.executionStartedAt,form.completedAt)&&<p role="status" className="rounded-lg border border-amber-300 p-3 text-sm">{scheduleWarning(form.executionStartedAt,form.completedAt)}</p>}<div className="grid gap-3 sm:grid-cols-2">{input("executionStartedAt","Início da execução","datetime-local")}{input("completedAt","Conclusão","datetime-local")}{input("environment","Ambiente")}{input("floor","Pavimento")}</div>
  {report.origin==="app"&&<><label className="field"><span>Sistema no IMAS</span><select required value={form.imasSystem} onChange={e=>set("imasSystem",e.target.value)}><option value="">Selecione</option>{IMAS_SYSTEMS.map(s=><option key={s}>{s}</option>)}</select></label><label className="field"><span>Tipo</span><select value={form.activityType} onChange={e=>set("activityType",e.target.value)}><option>Corretiva</option><option>Teste de equipamento</option></select></label>{input("imasSubject","Assunto")}<label className="field"><span>Descrição</span><textarea required rows={3} value={form.description} onChange={e=>set("description",e.target.value)}/></label><label className="field"><span>Equipamento / TAG</span><input type="text" value={form.equipment} onChange={e=>set("equipment",e.target.value)}/></label></>}
  <label className="field"><span>Serviço realizado</span><textarea required rows={5} value={form.observations} onChange={e=>set("observations",e.target.value)}/></label>
  <div className="flex flex-wrap gap-2"><button type="submit" className="report-button">{busy?"Enviando…":"Enviar alteração"}</button><button type="button" className="report-button" onClick={()=>setOpen(false)}>Cancelar</button></div>
  {message&&<p role="alert" className="text-sm font-semibold text-red-800">{message}</p>}
 </fieldset></form>;
}
