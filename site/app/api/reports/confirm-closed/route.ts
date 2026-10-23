import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {approvalFingerprint} from "../../../imas-approval";
import type {ExportReport} from "../../../report-export";

// Declaração do Supervisor: já encerrada no IMAS. Esta rota só altera o RCO.
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o Supervisor pode confirmar a baixa manual."},{status:403});
 try{
  const {publicId,expectedNumber,fingerprint,confirmed}=await request.json();
  if(typeof publicId!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(publicId)||typeof expectedNumber!=="string"||!/^[1-9]\d{0,11}$/.test(expectedNumber)||confirmed!==true)return Response.json({error:"Confirme o número oficial e o encerramento já conferido no IMAS."},{status:400});
  const row=await env.DB.prepare("SELECT * FROM service_reports WHERE public_id=?").bind(publicId).first<Record<string,unknown>>();
  if(!row||row.status==="Excluída")return Response.json({error:"OS não encontrada."},{status:404});
  const number=row.origin==="app"?row.imas_os_number:row.os_number;
  if(number!==expectedNumber)return Response.json({error:"O número oficial mudou. Atualize a OS antes de confirmar."},{status:409});
  if(row.downloaded_at)return Response.json({downloaded:true,alreadyClosed:true});
  const photos=await env.DB.prepare("SELECT public_id FROM report_photos WHERE report_public_id=? ORDER BY created_at,id").bind(publicId).all<{public_id:string}>();
  const report={...Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v])),photos:photos.results.map(p=>({publicId:p.public_id}))} as ExportReport;
  if(typeof fingerprint!=="string"||fingerprint!==await approvalFingerprint(report))return Response.json({error:"Os dados ou fotos mudaram. Atualize antes de confirmar o fechamento."},{status:409});
  const now=Date.now(),runId="manual-"+crypto.randomUUID();
  const columns=["origin","os_number","imas_os_number","collaborator","execution_started_at","completed_at","environment","floor","observations","activity_type","imas_subject","imas_system","imas_opened_at","imas_activation","imas_client_reference"];
  const same=columns.map(c=>c+"=?").join(" AND ");
  const photoIds=photos.results.map(p=>p.public_id).join(",");
  const trace=JSON.stringify([{at:new Date(now).toISOString(),status:"ok",step:"Baixa manual confirmada pelo Supervisor",message:"Supervisor confirmou que a OS oficial já está encerrada no IMAS. Sincronização somente no RCO; nenhuma foto ou comando enviado ao IMAS."}]);
  const changed="EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND downloaded_at=? AND status='Concluída')";
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE service_reports SET downloaded_at=?,status='Concluída',return_reason='' WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída' AND ${same} AND (SELECT GROUP_CONCAT(public_id,',') FROM (SELECT public_id FROM report_photos WHERE report_public_id=? ORDER BY created_at,id)) IS ? AND NOT EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND state='processing')`).bind(now,publicId,...columns.map(c=>row[c]),publicId,photoIds||null,publicId),
   env.DB.prepare(`UPDATE imas_automation_requests SET state='completed',updated_at=? WHERE report_public_id=? AND ${changed}`).bind(now,publicId,publicId,now),
   env.DB.prepare(`UPDATE work_orders SET status='Concluída',updated_at=? WHERE public_id=? AND ${changed}`).bind(now,row.work_order_public_id||"",publicId,now),
   env.DB.prepare(`INSERT INTO imas_automation_runs (run_id,report_public_id,version,state,step,trace_json,diagnostics_json,updated_at) SELECT ?,?,'app','completed','Baixa manual confirmada pelo Supervisor',?,'[]',? WHERE ${changed}`).bind(runId,publicId,trace,now,publicId,now),
  ]);
  if(!result[0].meta?.changes)return Response.json({error:"A OS mudou ou está em processamento. Atualize antes de confirmar."},{status:409});
  return Response.json({downloaded:true,manualConfirmation:true,message:"OS fechada no RCO e retirada da fila conforme sua confirmação no IMAS."});
 }catch{return Response.json({error:"Não foi possível confirmar a baixa no RCO."},{status:500});}
}
