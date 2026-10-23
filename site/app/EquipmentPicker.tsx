"use client";
import {useMemo,useState} from "react";
import {IMAS_EQUIPMENTS,imasEquipmentName} from "./imas-equipments";
// Lista pesquisável do cadastro de equipamentos do IMAS. O colaborador escolhe uma vez; a extensão usa o código para encerrar a OS.
export default function EquipmentPicker({code,required=true,onChange}:{code:string;required?:boolean;onChange:(code:string,name:string)=>void}){
 const [query,setQuery]=useState(""),[open,setOpen]=useState(false);
 const normalized=(value:string)=>value.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
 const matches=useMemo(()=>{const words=normalized(query).split(/\s+/).filter(Boolean);return IMAS_EQUIPMENTS.filter(([c,n])=>words.every(w=>normalized(c+" "+n).includes(w))).slice(0,40);},[query]);
 const name=imasEquipmentName(code);
 return <div className="field"><span>Equipamento no IMAS{required?" (obrigatório)":""}</span>
  {code&&name?<div className="flex flex-wrap items-center gap-2"><b>{code} — {name}</b><button type="button" className="report-button" onClick={()=>{onChange("","");setQuery("");setOpen(true);}}>Trocar</button></div>:<>
   <input value={query} placeholder="Digite parte do nome ou do código (ex.: fan coil, portão, bomba)" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);}}/>
   {open&&<div role="listbox" className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-300 bg-white">
    {!matches.length&&<p className="p-3 text-sm">Nenhum equipamento encontrado. Tente outra palavra.</p>}
    {matches.map(([c,n])=><button type="button" role="option" aria-selected={false} key={c} className="block w-full border-b border-slate-200 p-3 text-left text-sm" onClick={()=>{onChange(c,n);setOpen(false);}}>{c} — {n}</button>)}
   </div>}</>}
 </div>;
}
