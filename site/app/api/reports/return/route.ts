import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente supervisor pode devolver OS."},{status:403});
 try{
  const {publicId,reason}=await request.json();
  if(typeof publicId!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(publicId)||typeof reason!=="string"||!reason.trim()||reason.trim().length>1000)return Response.json({error:"Informe o motivo da devolução (até 1.000 caracteres)."},{status:400});
  const row=await env.DB.prepare("SELECT downloaded_at,status FROM service_reports WHERE public_id=?").bind(publicId).first<{downloaded_at:number|null;status:string}>();
  if(!row)return Response.json({error:"OS não encontrada."},{status:404});
  if(row.downloaded_at||row.status==="Excluída")return Response.json({error:"A OS já foi baixada ou excluída."},{status:409});
  const active=await env.DB.prepare("SELECT state,updated_at FROM imas_automation_runs WHERE report_public_id=? ORDER BY updated_at DESC LIMIT 1").bind(publicId).first<{state:string;updated_at:number}>();
  if(active?.state==="running"&&Date.now()-active.updated_at<180000)return Response.json({error:"A OS está em execução. Aguarde o resultado antes de devolver."},{status:409});
  const token=crypto.randomUUID(),now=Date.now();
  const results=await env.DB.batch([
   env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) VALUES (?,?,'','returned',?,?) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,state='returned',fingerprint='',updated_at=excluded.updated_at WHERE imas_automation_requests.state<>'processing'").bind(publicId,token,now,now),
   env.DB.prepare("UPDATE service_reports SET status='Devolvida',return_reason=?,photo_approval_status='not_required',photo_approved_at=NULL WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída' AND EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='returned')").bind(reason.trim(),publicId,publicId,token),
   env.DB.prepare("UPDATE work_orders SET status='Aguardando aprovação',updated_at=? WHERE public_id=(SELECT work_order_public_id FROM service_reports WHERE public_id=? AND status='Devolvida') AND EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='returned')").bind(now,publicId,publicId,token)
  ]);
  if(!results[1].meta?.changes)return Response.json({error:"A OS começou a ser processada. Aguarde antes de devolver."},{status:409});
  return Response.json({returned:true,message:"OS devolvida ao colaborador e retirada da fila automática."});
 }catch{return Response.json({error:"Não foi possível devolver a OS."},{status:500});}
}
