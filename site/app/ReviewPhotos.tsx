"use client";
import {useState} from "react";
import type {ExportReport} from "./report-export";
import {needsPhotoApproval} from "./photo-policy";
export default function ReviewPhotos({report,supervisor,onSaved}:{report:ExportReport;supervisor:boolean;onSaved:()=>Promise<void>}){
 const [busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState("");
 async function remove(photoId:string,index:number){
  if(!window.confirm(`Excluir a foto ${index+1} da OS ${report.imasOsNumber||report.osNumber}? As outras fotos serão mantidas.`))return;
  setBusy(photoId);setMessage("");
  try{const r=await fetch("/api/reports/review-photos",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:report.publicId,photoId})});const data=await r.json();if(!r.ok)throw Error(data.error);await onSaved();setMessage(data.message);}
  catch(e){setMessage(e instanceof Error?e.message:"Falha ao excluir foto.");}finally{setBusy(null);}
 }
 return <div className="mt-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{report.photos.map((photo,i)=><div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50" key={photo.publicId}><a href={photo.url} target="_blank" rel="noreferrer"><img loading="lazy" className="aspect-square w-full object-contain" src={photo.url} alt={`Foto ${i+1} da OS ${report.imasOsNumber||report.osNumber}`}/><span className="block p-2 text-sm font-bold text-blue-900">Ver foto {i+1}</span></a>{supervisor&&needsPhotoApproval(report)&&<button type="button" className="m-2 min-h-11 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold text-red-800 disabled:opacity-50" disabled={busy!==null||report.photos.length<=1} onClick={()=>void remove(photo.publicId,i)}>{busy===photo.publicId?"Excluindo...":"Excluir foto"}</button>}</div>)}</div>{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
