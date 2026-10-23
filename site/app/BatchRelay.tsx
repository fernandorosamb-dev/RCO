"use client";
import {useEffect} from "react";
import {reportMonth} from "./report-month";
// Roda só no navegador do supervisor (com a extensão): pega o pedido do engenheiro e dispara o lote do mês.
export default function BatchRelay(){
 useEffect(()=>{let stop=false,running=false;
  async function tick(){if(running||stop)return;running=true;try{
   const pending=await fetch("/api/imas/batch-request",{cache:"no-store"});if(!pending.ok)return;const {request}=await pending.json();if(!request)return;
   const claim=await fetch("/api/imas/batch-request",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:request.id})});if(!claim.ok)return;
   const list=await fetch("/api/reports",{cache:"no-store"});if(!list.ok)return;
   const reports=((await list.json()).reports as {publicId:string;downloadedAt:string|null}[]).filter(r=>!r.downloadedAt&&reportMonth(r as never)===request.month);
   if(reports.length)document.dispatchEvent(new CustomEvent("rco-imas-batch",{detail:{publicIds:reports.map(r=>r.publicId)}}));
  }catch{}finally{running=false;}}
  void tick();const t=window.setInterval(()=>void tick(),30000);return()=>{stop=true;window.clearInterval(t);};},[]);
 return null;
}
