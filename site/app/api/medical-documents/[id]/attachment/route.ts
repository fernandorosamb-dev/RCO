import {env} from "cloudflare:workers";
import {requireRole} from "../../../../auth";
import {roles,isOverviewRole} from "../../../../access";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const role=await requireRole(roles);if(!role)return Response.json({error:"Faça login."},{status:401});const {id}=await params;
 const row=await env.DB.prepare("SELECT created_by_role,object_key,content_type,file_name FROM medical_documents WHERE public_id=?").bind(id).first<Record<string,unknown>>();
 if(!row||!isOverviewRole(role)&&row.created_by_role!==role)return Response.json({error:"Documento não encontrado."},{status:404});
 const object=await env.BUCKET.get(String(row.object_key));if(!object)return Response.json({error:"Anexo não encontrado."},{status:404});
 return new Response(object.body,{headers:{"Content-Type":String(row.content_type),"Content-Disposition":`inline; filename="${row.file_name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
}
