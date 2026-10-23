"use client";
import {useCallback,useEffect,useState} from "react";
import {FIELD_LABELS} from "./report-labels";
type Proposal={publicId:string;reportPublicId:string;action:string;reason:string;before:Record<string,string>;after:Record<string,string>;osNumber:string;collaborator:string;environment:string;floor:string;createdAt:number};
const titles:Record<string,string>={approve:"Pediu para APROVAR e enviar para conclusão",reject:"Pediu para REJEITAR",return:"Pediu para DEVOLVER ao colaborador",edit:"Propôs ALTERAR a OS"};
// Fila do supervisor: tudo que o engenheiro pediu, com o que mudou e como estava.
export default function ProposalsPanel({onChanged}:{onChanged?:()=>Promise<void>|void}){
 const [items,setItems]=useState<Proposal[]>([]),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 const load=useCallback(async()=>{try{const r=await fetch("/api/reports/proposals",{cache:"no-store"});if(r.ok)setItems((await r.json()).proposals||[]);}catch{}},[]);
 useEffect(()=>{void load();const t=window.setInterval(()=>void load(),45000);window.addEventListener("focus",load);return()=>{window.clearInterval(t);window.removeEventListener("focus",load);};},[load]);
 async function decide(id:string,decision:"apply"|"dismiss"){setBusy(id);setMessage("");try{const r=await fetch("/api/reports/proposals/decide",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:id,decision})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Não foi possível concluir.");setMessage(d.message||(decision==="apply"?"Aplicado.":"Recusado."));await load();await onChanged?.();}catch(e){setMessage(e instanceof Error?e.message:"Falha.");}finally{setBusy("");}}
 if(!items.length&&!message)return null;
 return <section className="mt-5 rounded-xl border border-violet-300 bg-violet-50 p-4" aria-label="Pedidos do engenheiro"><h3 className="text-lg font-bold">Pedidos do engenheiro · {items.length}</h3>{message&&<p role="status" className="mt-2 text-sm font-semibold">{message}</p>}
  <div className="mt-3 space-y-3">{items.map(p=><article key={p.publicId} className="rounded-lg border border-violet-200 bg-white p-3"><p className="font-bold">OS {p.osNumber} · {p.collaborator}</p><p className="text-sm text-slate-600">{p.environment} · {p.floor}</p><p className="mt-1 text-sm font-semibold">{titles[p.action]||p.action}</p>{p.reason&&<p className="mt-1 text-sm"><b>Motivo:</b> {p.reason}</p>}
   {p.action==="edit"&&<table className="mt-2 w-full text-left text-sm"><thead><tr><th className="p-1">Campo</th><th className="p-1">Como estava</th><th className="p-1">Como ficará</th></tr></thead><tbody>{Object.keys(p.after).map(k=><tr key={k} className="border-t border-slate-200 align-top"><td className="p-1 font-semibold">{FIELD_LABELS[k]||k}</td><td className="whitespace-pre-line p-1 text-red-900">{p.before[k]||"—"}</td><td className="whitespace-pre-line p-1 text-emerald-900">{p.after[k]||"—"}</td></tr>)}</tbody></table>}
   <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="report-button" disabled={!!busy} onClick={()=>void decide(p.publicId,"apply")}>{busy===p.publicId?"Aguarde…":"Autorizar"}</button><button type="button" className="report-button" disabled={!!busy} onClick={()=>void decide(p.publicId,"dismiss")}>Recusar</button></div></article>)}</div></section>;
}
