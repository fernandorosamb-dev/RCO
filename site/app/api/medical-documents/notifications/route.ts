import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
const seenColumn=(role:string)=>role==="supervisor"?"supervisor_seen_at":"engineer_seen_at";
export async function GET(){
 const role=await requireRole(["supervisor","engenheiro"]);if(!role)return Response.json({error:"Acesso restrito."},{status:403});
 const rows=await env.DB.prepare(`SELECT public_id,reference,data_json,email_status,created_at FROM medical_documents WHERE ${seenColumn(role)} IS NULL ORDER BY created_at DESC LIMIT 50`).all<Record<string,unknown>>();
 return Response.json({notifications:rows.results.map((row:Record<string,unknown>)=>{const data=JSON.parse(String(row.data_json));return {publicId:row.public_id,reference:row.reference,person:data.person,kind:data.kind,emailStatus:row.email_status,createdAt:row.created_at};})},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
 // Leitura de notificações: não autoriza o engenheiro a editar documentos ou registros de RH.
 const role=await requireRole(["supervisor","engenheiro"]);if(!role)return Response.json({error:"Acesso restrito."},{status:403});
 const body=await request.json();const ids=body.publicIds;if(!Array.isArray(ids)||!ids.length||ids.length>50||!ids.every(id=>typeof id==="string"&&/^[a-f0-9-]{36}$/i.test(id)))return Response.json({error:"Notificações inválidas."},{status:400});
 await env.DB.prepare(`UPDATE medical_documents SET ${seenColumn(role)}=? WHERE public_id IN (${ids.map(()=>"?").join(",")}) AND ${seenColumn(role)} IS NULL`).bind(Date.now(),...ids).run();return Response.json({ok:true});
}
