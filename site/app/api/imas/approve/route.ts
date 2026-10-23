import {failedAttemptSince,type AttemptSummary} from "../../../imas-queue-admission";
import {recoverStalledApprovals} from "../../../imas-timeout";
import {FABRICIO_REVIEW_AFTER} from "../../../supervisor-holds";
import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {GET as reportsGet} from "../../reports/route";
import {POST as approvePhotos} from "../../reports/photo-approval/route";
import {imasJob} from "../../../imas-jobs";
import {approvalFingerprint} from "../../../imas-approval";
import {needsPhotoApproval} from "../../../photo-policy";
import type {ExportReport} from "../../../report-export";
async function reportById(id:string){const res=await reportsGet();if(!res.ok)throw Error("Não foi possível consultar a OS.");return ((await res.json()).reports as ExportReport[]).find(r=>r.publicId===id);}
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente supervisor pode aprovar OS."},{status:403});
 try{
  await recoverStalledApprovals();
  const body=await request.json();const id=body.publicId;
  if(body.action==="force")return Response.json({error:"Forçar fechamento agora confirma a baixa somente no RCO. Atualize a página e use o botão corrigido."},{status:409});
  if(typeof id!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(id))return Response.json({error:"Informe a OS."},{status:400});
  let report=await reportById(id);if(!report)return Response.json({error:"OS não encontrada ou já baixada."},{status:404});
  const job=imasJob(report);const errors=job.errors.filter(e=>e!=="Revisão de fotos: aguardar aprovação do supervisor"&&e!=="Revisão do supervisor: conferir OS do Fabrício antes de liberar"&&e!=="OS devolvida: aguardar correção e reenvio do colaborador");
  if(errors.length)return Response.json({error:errors.join(" · ")},{status:409});
  const fingerprint=await approvalFingerprint(report);
  if(body.action!=="claim"&&body.fingerprint!==fingerprint)return Response.json({error:"Os dados ou fotos mudaram. Atualize a OS antes de aprovar."},{status:409});
  if(body.action==="claim"){
   if(!job.ready||typeof body.requestId!=="string")return Response.json({error:"A OS não está pronta para executar."},{status:409});
   const pending=await env.DB.prepare("SELECT requested_at FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='queued'").bind(id,body.requestId).first<{requested_at:number}>();
   const lastAttempt=await env.DB.prepare("SELECT state,trace_json,updated_at FROM imas_automation_runs WHERE report_public_id=? ORDER BY updated_at DESC LIMIT 1").bind(id).first<AttemptSummary>();
   if(!pending||failedAttemptSince(pending.requested_at,lastAttempt))return Response.json({error:"A tentativa anterior falhou ou a aprovação mudou. Use Voltar à fila para retomar a OS já aprovada."},{status:409});
   const result=await env.DB.prepare("UPDATE imas_automation_requests SET state='processing',updated_at=? WHERE report_public_id=? AND request_id=? AND fingerprint=? AND state='queued' AND EXISTS(SELECT 1 FROM service_reports WHERE public_id=imas_automation_requests.report_public_id AND status<>'Devolvida' AND downloaded_at IS NULL)").bind(Date.now(),id,body.requestId,fingerprint).run();
   if(!result.meta?.changes)return Response.json({error:"A aprovação mudou ou já foi recebida. Nenhuma repetição autorizada."},{status:409});
   return Response.json({claimed:true});
  }
  const previous=await env.DB.prepare("SELECT request_id,state,fingerprint,requested_at FROM imas_automation_requests WHERE report_public_id=?").bind(id).first<{request_id:string;state:string;fingerprint:string;requested_at:number}>();
  if(body.action==="retry"&&(!previous||previous.fingerprint!==fingerprint||!["queued","failed","completed"].includes(previous.state)))return Response.json({error:"Os dados mudaram ou falta a aprovação do conteúdo. Revise a OS antes de liberar."},{status:409});
  if(previous?.state==="processing")return Response.json({error:"A OS já está em processamento. Aguarde o resultado."},{status:409});
  const active=await env.DB.prepare("SELECT state,trace_json,updated_at FROM imas_automation_runs WHERE report_public_id=? ORDER BY updated_at DESC LIMIT 1").bind(id).first<AttemptSummary>();
  if(active?.state==="running"&&Date.now()-active.updated_at<180000)return Response.json({error:"A OS já está em execução. Aguarde."},{status:409});
  // Nova aprovação do supervisor encerra explicitamente a devolução, em uma única transação.
  if(report.status==="Devolvida"){
   const candidate={...report,status:"Concluída",photoApprovalStatus:"approved",supervisorReleased:true};
   const candidateJob=imasJob(candidate);
   if(!candidateJob.ready)return Response.json({error:candidateJob.errors.join(" · ")},{status:409});
   const photoIds=report.photos.map(p=>p.publicId).sort();
   if(!Array.isArray(body.photoIds)||body.photoIds.some((p:unknown)=>typeof p!=="string")||[...body.photoIds].sort().join(",")!==photoIds.join(","))return Response.json({error:"As fotos mudaram. Atualize e confira novamente."},{status:409});
   const current=await reportById(id);
   if(!current||current.status!=="Devolvida"||await approvalFingerprint(current)!==fingerprint)return Response.json({error:"A OS mudou. Atualize antes de aprovar."},{status:409});
   const now=Date.now(),requestId=crypto.randomUUID();
   const columns=["origin","os_number","imas_os_number","collaborator","execution_started_at","completed_at","environment","floor","observations","activity_type","imas_subject","imas_system","imas_opened_at","imas_activation","imas_client_reference"];
   const values=[report.origin,report.osNumber,report.imasOsNumber||"",report.collaborator,report.executionStartedAt,report.completedAt,report.environment,report.floor,report.observations,report.activityType,report.imasSubject||"",report.imasSystem||"",report.imasOpenedAt||"",report.imasActivation||"",report.imasClientReference||""];
   const results=await env.DB.batch([
    env.DB.prepare(`UPDATE service_reports SET status='Concluída',return_reason='',photo_approval_status='approved',photo_approved_at=? WHERE public_id=? AND status='Devolvida' AND downloaded_at IS NULL AND ${columns.map(c=>c+"=?").join(" AND ")} AND NOT EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND state='processing') AND (SELECT GROUP_CONCAT(public_id,',') FROM (SELECT public_id FROM report_photos WHERE report_public_id=? ORDER BY public_id))=?`).bind(now,id,...values,id,id,photoIds.join(",")),
    env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) SELECT ?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND status='Concluída' AND photo_approved_at=? AND downloaded_at IS NULL) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,fingerprint=excluded.fingerprint,state='queued',requested_at=excluded.requested_at,updated_at=excluded.updated_at WHERE imas_automation_requests.state<>'processing'").bind(id,requestId,fingerprint,now,now,id,now),
    env.DB.prepare("UPDATE work_orders SET status='Concluída',updated_at=? WHERE public_id=(SELECT work_order_public_id FROM service_reports WHERE public_id=? AND photo_approved_at=? AND status='Concluída')").bind(now,id,now),
   ]);
   if(!results[0].meta?.changes||!results[1].meta?.changes)return Response.json({error:"A OS mudou ou começou a ser processada. Atualize antes de aprovar."},{status:409});
   return Response.json({queued:true,requestId,message:"Devolução encerrada. OS aprovada e colocada na fila automática."});
  }
  if(needsPhotoApproval(report)){
   const response=await approvePhotos(new Request(request.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:id,photoIds:body.photoIds})}));
   if(!response.ok)return response;
   report=await reportById(id);if(!report)return Response.json({error:"A OS mudou. Atualize a lista."},{status:409});
  }
  if(!imasJob({...report,supervisorReleased:true}).ready)return Response.json({error:"A OS mudou. Revise os campos antes de aprovar."},{status:409});
  const currentHash=await approvalFingerprint(report);
  if(currentHash!==fingerprint)return Response.json({error:"A OS mudou durante a aprovação. Atualize e confira os dados."},{status:409});
  if(previous?.state==="queued"&&previous.fingerprint===currentHash&&previous.requested_at>FABRICIO_REVIEW_AFTER&&!failedAttemptSince(previous.requested_at,active))return Response.json({queued:true,requestId:previous.request_id});
  const now=Date.now(),requestId=crypto.randomUUID();
  const result=await env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) VALUES (?,?,?,'queued',?,?) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,fingerprint=excluded.fingerprint,state='queued',requested_at=excluded.requested_at,updated_at=excluded.updated_at WHERE imas_automation_requests.state<>'processing'").bind(id,requestId,currentHash,now,now).run();
  if(!result.meta?.changes)return Response.json({error:"A OS já começou a ser processada."},{status:409});
  return Response.json({queued:true,requestId,message:"OS aprovada e colocada na fila automática."});
 }catch{return Response.json({error:"Não foi possível aprovar a OS. Tente novamente."},{status:500});}
}
