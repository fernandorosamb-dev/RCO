import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o supervisor pode aprovar fotos adicionais."},{status:403});
 try{
  const {publicId,photoIds}=await request.json() as {publicId?:unknown;photoIds?:unknown};
  if(typeof publicId!=="string"||!publicId||!Array.isArray(photoIds)||photoIds.some(v=>typeof v!=="string"||!/^[-a-zA-Z0-9]+$/.test(v)))return Response.json({error:"Informe a OS e as fotos conferidas."},{status:400});
  const row=await env.DB.prepare("SELECT status,downloaded_at,photo_approval_status FROM service_reports WHERE public_id=?").bind(publicId).first<{status:string;downloaded_at:number|null;photo_approval_status:string}>();
  if(!row||row.status==="Excluída")return Response.json({error:"OS não encontrada."},{status:404});
  if(row.status==="Devolvida")return Response.json({error:"Aguarde a correção e o reenvio do colaborador."},{status:409});
  if(row.downloaded_at||row.photo_approval_status==="approved")return Response.json({error:"Esta OS já foi aprovada ou baixada. Atualize a lista."},{status:409});
  const photos=await env.DB.prepare("SELECT public_id FROM report_photos WHERE report_public_id=? ORDER BY public_id").bind(publicId).all<{public_id:string}>();
  const expected=[...photoIds].sort().join(","),actual=photos.results.map((p:{public_id:string})=>p.public_id).join(",");
  if(photos.results.length<1||(photos.results.length<=5&&row.photo_approval_status!=="pending")||expected!==actual)return Response.json({error:"As fotos mudaram ou não precisam de aprovação. Atualize e confira novamente."},{status:409});
  const now=Date.now();
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE service_reports SET status='Concluída',photo_approval_status='approved',photo_approved_at=? WHERE public_id=? AND downloaded_at IS NULL AND status NOT IN ('Excluída','Devolvida') AND photo_approval_status<>'approved' AND (SELECT GROUP_CONCAT(public_id,',') FROM (SELECT public_id FROM report_photos WHERE report_public_id=? ORDER BY public_id))=?").bind(now,publicId,publicId,expected),
   env.DB.prepare("UPDATE work_orders SET status='Concluída',updated_at=? WHERE public_id=(SELECT work_order_public_id FROM service_reports WHERE public_id=? AND photo_approval_status='approved' AND photo_approved_at=?)").bind(now,publicId,now)
  ]);
  if(!results[0].meta?.changes)return Response.json({error:"A OS mudou durante a aprovação. Confira novamente."},{status:409});
  return Response.json({approved:true,message:"Fotos aprovadas. OS liberada para a automação IMAS."});
 }catch{return Response.json({error:"Não foi possível aprovar. A OS continua pendente."},{status:500});}
}
