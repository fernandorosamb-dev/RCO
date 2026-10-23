"use client";
import {useState} from "react";
import {useRoleRoster} from "./useRoleRoster";
import type {RoleResponsible} from "./role-roster";
export default function RoleResponsibles(){
 const {profiles}=useRoleRoster();
 return <section className="mb-6 rounded-xl border border-orange-300 p-4"><h3 className="text-xl font-bold">Responsáveis por cargo</h3><p className="mt-1 text-sm">Altere aqui quem responde por cada cargo. O nome do executor nos relatórios enviados é preservado.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{profiles.map(profile=><ResponsibleRow key={profile.area+profile.revision} profile={profile}/>)}</div></section>;
}
function ResponsibleRow({profile}:{profile:RoleResponsible}){
 const [name,setName]=useState(profile.name),[imasName,setImasName]=useState(profile.imasName),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage("");try{const response=await fetch("/api/role-responsibles",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({area:profile.area,name,imasName,revision:profile.revision})});const result=await response.json();if(!response.ok)throw Error(result.error);setMessage("Salvo.");window.dispatchEvent(new Event("rco-roster-updated"));}catch(e){setMessage(e instanceof Error?e.message:"Não foi possível salvar.");}finally{setBusy(false);}}
 return <form onSubmit={save} className="rounded-lg border border-slate-400 p-3"><fieldset disabled={busy} className="space-y-2"><h4 className="font-bold">{profile.title}</h4><label className="field"><span>Nome do responsável</span><input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span>Nome completo no IMAS</span><input maxLength={300} value={imasName} onChange={e=>setImasName(e.target.value)} placeholder="Copie como aparece no cadastro do IMAS"/></label>{!imasName&&<p className="text-sm text-amber-500">As OS ficam atribuídas a {name}. Para automatizar no IMAS, confirme o nome cadastrado acima.</p>}<button type="submit" className="report-button">{busy?"Salvando…":"Salvar responsável"}</button>{message&&<p role="status" className="text-sm">{message}</p>}</fieldset></form>;
}
