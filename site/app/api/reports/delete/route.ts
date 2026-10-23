import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
export async function DELETE(request:Request){
  if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Apenas o Supervisor pode excluir OS."},{status:403});
  try{
    const {publicId}=await request.json();
    if(typeof publicId!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(publicId))return Response.json({error:"OS inválida."},{status:400});
    const result=await env.DB.prepare("UPDATE service_reports SET status='Excluída' WHERE public_id=? AND origin='app' AND imas_os_number='' AND downloaded_at IS NULL AND status<>'Excluída'").bind(publicId).run();
    if(!result.meta.changes)return Response.json({error:"Só é possível excluir uma OS do app ainda não vinculada ao IMAS."},{status:409});
    return Response.json({deleted:true});
  }catch{return Response.json({error:"Não foi possível excluir a OS."},{status:500});}
}
