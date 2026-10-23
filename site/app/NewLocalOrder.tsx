"use client";
import {useState} from "react";
import {Loader2,Send} from "lucide-react";
import {useRoleRoster} from "./useRoleRoster";
import {saoPauloDate} from "./order-deadlines";
import {IMAS_SYSTEMS} from "./imas-config";
import EquipmentPicker from "./EquipmentPicker";
import type {Role} from "./auth";
const initial=()=>({activityType:"Corretiva",area:"",collaborator:"",environment:"",floor:"",equipment:"",imasEquipmentCode:"",description:"",imasSystem:"",imasSubject:"",executionStartedAt:saoPauloDate()+"T09:00",completedAt:saoPauloDate()+"T16:00"});
export default function NewLocalOrder({role}:{role:Role}){
 const {executors}=useRoleRoster();
 const [form,setForm]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const change=(key:keyof ReturnType<typeof initial>,value:string)=>setForm(f=>({...f,[key]:value}));
 async function submit(event:React.FormEvent){
  event.preventDefault();if(!form.imasEquipmentCode){setMessage("Escolha o equipamento na lista do IMAS.");return;}setBusy(true);setMessage("");
  try{
   const body=new FormData();Object.entries(form).forEach(([k,v])=>body.set(k,v));
   body.set("workflow","creation");body.set("observations",form.description.trim()||form.imasSubject.trim());body.set("description",form.description.trim()||form.imasSubject.trim());
   const response=await fetch("/api/local-orders",{method:"POST",body});const data=await response.json();
   if(!response.ok)throw Error(data.error||"Não foi possível solicitar a criação.");
   setForm(initial());setMessage(data.automation?.queued?"Solicitação recebida. Após criar no IMAS e conferir o número oficial, a OS aparecerá na sua fila para execução e encerramento.":data.automation?.message||"Solicitação salva. Aguarde a conferência do supervisor.");
  }catch(e){setMessage(e instanceof Error?e.message:"Falha no envio.");}finally{setBusy(false);}
 }
 return <section className="mx-auto max-w-2xl px-4 py-6"><span className="eyebrow">Corretiva ou teste de equipamento</span><h2 className="mt-2 text-2xl font-bold">Criar OS no IMAS</h2><p className="mt-2 text-sm">Primeiro criamos a OS e recebemos o número oficial. Depois, abra a fila de OS para registrar o serviço realizado e as fotos.</p>
 <form onSubmit={submit} className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200"><fieldset disabled={busy} className="space-y-4">
 <label className="field"><span>Tipo de atividade</span><select value={form.activityType} onChange={e=>change("activityType",e.target.value)}><option>Corretiva</option><option>Teste de equipamento</option></select></label>
 {role==="supervisor"&&<label className="field"><span>Área</span><select required value={form.area} onChange={e=>change("area",e.target.value)}><option value="">Selecione</option>{Object.entries({eletrica:"Elétrica",hidraulica:"Hidráulica",refrigeracao:"Refrigeração",civil:"Civil"}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
 <label className="field"><span>Responsável — cadastro IMAS</span><select required value={form.collaborator} onChange={e=>change("collaborator",e.target.value)}><option value="">Selecione</option>{executors.map(v=><option key={v}>{v}</option>)}</select></label>
 <div className="grid gap-4 sm:grid-cols-2">{([['environment','Local / ambiente'],['floor','Pavimento']] as const).map(([k,label])=><label className="field" key={k}><span>{label}</span><input required maxLength={500} value={form[k]} onChange={e=>change(k,e.target.value)}/></label>)}</div>
 <label className="field"><span>Assunto / serviço solicitado</span><input required maxLength={500} value={form.imasSubject} onChange={e=>change("imasSubject",e.target.value)}/></label>
 <label className="field"><span>Sistema</span><select required value={form.imasSystem} onChange={e=>change("imasSystem",e.target.value)}><option value="">Selecione</option>{IMAS_SYSTEMS.map(v=><option key={v}>{v}</option>)}</select></label>
 <EquipmentPicker code={form.imasEquipmentCode} onChange={code=>change("imasEquipmentCode",code)}/>
 <label className="field"><span>Equipamento / TAG{form.activityType==="Teste de equipamento"?"":" (se aplicável)"}</span><input required={form.activityType==="Teste de equipamento"} maxLength={500} value={form.equipment} onChange={e=>change("equipment",e.target.value)}/></label>
 <div className="grid gap-4 sm:grid-cols-2"><label className="field"><span>Início previsto</span><input required type="datetime-local" value={form.executionStartedAt} onChange={e=>change("executionStartedAt",e.target.value)}/></label><label className="field"><span>Conclusão prevista</span><input required type="datetime-local" value={form.completedAt} onChange={e=>change("completedAt",e.target.value)}/></label></div>
 <label className="field"><span>Descrição da solicitação</span><textarea rows={3} maxLength={10000} value={form.description} onChange={e=>change("description",e.target.value)} placeholder="Descreva o problema ou o teste necessário."/></label>
 <p className="rounded-lg bg-blue-50 p-3 text-sm">As fotos e o relato da execução serão enviados ao encerrar a OS na fila. Criar a OS não registra a baixa.</p>
 <button className="submit-button" type="submit">{busy?<><Loader2 className="animate-spin"/>Enviando…</>:<><Send/>Solicitar criação da OS</>}</button>
 </fieldset>{message&&<p role="status" className="mt-4 text-sm font-semibold">{message}</p>}</form></section>;
}
