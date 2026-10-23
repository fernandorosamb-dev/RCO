import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {medicalEmail} from "../../../medical-documents";
export async function GET(){
 if(!await requireRole(["supervisor"]))return Response.json({error:"Faça login como Supervisor na plataforma RCO."},{status:403});
 const rows=await env.DB.prepare("SELECT public_id,reference,data_json,file_name,content_type,email_status FROM medical_documents WHERE email_status IN ('pending_configuration','pending_supervisor','failed') ORDER BY created_at ASC LIMIT 200").all<Record<string,unknown>>();
 // Base de consulta para a extensão separada de RH. Não há claim, upload ou envio.
 // Liberação exige validação no computador: a data nunca habilita o envio sozinha.
 return Response.json({schemaVersion:1,mode:"desktop",automationEnabled:false,releaseRequired:true,message:"Envio automático desativado. Aguardando configuração e liberação do Supervisor.",expectedSender:"fernandorosa.mb@gmail.com",pendingCount:rows.results.length,jobs:rows.results.map((row:Record<string,unknown>)=>({publicId:row.public_id,reference:row.reference,status:row.email_status,email:medicalEmail(String(row.reference),JSON.parse(String(row.data_json))),attachment:{url:`/api/medical-documents/${row.public_id}/attachment`,fileName:row.file_name,contentType:row.content_type}}))},{headers:{"Cache-Control":"private, no-store"}});
}
