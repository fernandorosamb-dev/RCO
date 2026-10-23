import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
export async function DELETE(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o supervisor pode excluir fotos na revisão."},{status:403});
 try{
  const {publicId,photoId}=await request.json();
  if(typeof publicId!=="string"||typeof photoId!=="string"||!publicId||!photoId)return Response.json({error:"Informe a OS e a foto."},{status:400});
  const report=await env.DB.prepare("SELECT status,downloaded_at,photo_approval_status FROM service_reports WHERE public_id=?").bind(publicId).first<{status:string;downloaded_at:number|null;photo_approval_status:string}>();
  if(!report||report.status==="Excluída")return Response.json({error:"OS não encontrada."},{status:404});
  if((await env.DB.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id=?").bind(publicId).first<{state:string}>())?.state==="processing")return Response.json({error:"A OS está em processamento. Aguarde antes de alterar fotos."},{status:409});
  if(report.downloaded_at||report.photo_approval_status==="approved")return Response.json({error:"A OS já foi liberada ou baixada. Não excluir evidências pela revisão."},{status:409});
  const photos=await env.DB.prepare("SELECT public_id,object_key FROM report_photos WHERE report_public_id=?").bind(publicId).all<{public_id:string;object_key:string}>();
  const photo=photos.results.find((p:{public_id:string})=>p.public_id===photoId);
  if(!photo)return Response.json({error:"Foto não pertence à OS."},{status:404});
  if(photos.results.length<=1)return Response.json({error:"Mantenha pelo menos 1 foto da execução."},{status:409});
  if(report.photo_approval_status!=="pending"&&photos.results.length<=5)return Response.json({error:"Esta OS não está em revisão de fotos."},{status:409});
  const runs=await env.DB.prepare("SELECT state,trace_json FROM imas_automation_runs WHERE report_public_id=?").bind(publicId).all<{state:string;trace_json:string}>();
  if(runs.results.some((run:{state:string;trace_json:string})=>run.state==="running"||JSON.parse(run.trace_json).some((e:{step:string})=>/^(Enviar arquivos clicado|Aguardar fotos vinculadas|Fotos vinculadas confirmadas|Fotos já vinculadas)/.test(e.step))))return Response.json({error:"Há envio ao IMAS em andamento ou já registrado. Confira os anexos no IMAS antes de alterar evidências."},{status:409});
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE service_reports SET photo_approval_status='pending',photo_approved_at=NULL,status='Aguardando aprovação' WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída' AND photo_approval_status<>'approved'").bind(publicId),
   env.DB.prepare("DELETE FROM report_photos WHERE public_id=? AND report_public_id=? AND (SELECT COUNT(*) FROM report_photos WHERE report_public_id=?)>1 AND EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND photo_approval_status='pending' AND downloaded_at IS NULL)").bind(photoId,publicId,publicId,publicId),
   env.DB.prepare("UPDATE imas_automation_requests SET state='changed',updated_at=? WHERE report_public_id=? AND state='queued'").bind(Date.now(),publicId),
   env.DB.prepare("UPDATE work_orders SET status='Aguardando aprovação',updated_at=? WHERE public_id=(SELECT work_order_public_id FROM service_reports WHERE public_id=? AND photo_approval_status='pending' AND downloaded_at IS NULL)").bind(Date.now(),publicId)
  ]);
  if(!results[1].meta?.changes)return Response.json({error:"A OS mudou. Atualize a revisão."},{status:409});
  await env.BUCKET.delete(photo.object_key).catch(()=>{});
  return Response.json({deleted:true,message:"Foto excluída. Use Aprovar OS para liberar o processamento."});
 }catch{return Response.json({error:"Não foi possível excluir. Atualize e confira a revisão."},{status:500});}
}
