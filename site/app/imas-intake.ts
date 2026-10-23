import {env} from "cloudflare:workers";
import {imasJob} from "./imas-jobs";
import {approvalFingerprint} from "./imas-approval";
import type {ExportReport} from "./report-export";
// Admission only: execution stays in the installed browser extension.
export async function submitToImas(publicId:string){
 try{
  const row=await env.DB.prepare("SELECT * FROM service_reports WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída'").bind(publicId).first<Record<string,unknown>>();
  if(!row)return {queued:false,review:true,message:"OS indisponível para processamento."};
  const camel=(record:Record<string,unknown>)=>Object.fromEntries(Object.entries(record).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
  const photos=await env.DB.prepare("SELECT public_id,file_name FROM report_photos WHERE report_public_id=? ORDER BY created_at,id").bind(publicId).all<{public_id:string;file_name:string}>();
  const order=row.work_order_public_id?await env.DB.prepare("SELECT assigned_area,unit,description,equipment FROM work_orders WHERE public_id=?").bind(row.work_order_public_id).first<Record<string,unknown>>():null;
  const report={...camel(row),workOrder:order?camel(order):null,photos:photos.results.map(p=>({publicId:p.public_id,fileName:p.file_name,url:`/api/photos/${p.public_id}`}))} as ExportReport;
  const job=imasJob(report),now=Date.now(),fingerprint=await approvalFingerprint(report);
  const state=job.ready?'queued':'review';
  const result=await env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,fingerprint=excluded.fingerprint,state=excluded.state,requested_at=excluded.requested_at,updated_at=excluded.updated_at WHERE imas_automation_requests.state<>'processing'").bind(publicId,crypto.randomUUID(),fingerprint,state,now,now).run();
  if(!result.meta?.changes)return {queued:false,review:true,message:"OS já está em processamento. Aguarde a conferência."};
  return {queued:job.ready,review:!job.ready,message:job.ready?"OS recebida e colocada na fila automática do IMAS.":`OS recebida. Revisão do supervisor: ${job.errors.join(" · ")}.`};
 }catch{return {queued:false,review:true,message:"OS salva. Não foi possível confirmar a entrada na fila; o supervisor deve conferir."};}
}
