import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {diffProposal} from "../../../report-actions";
const ACTIONS=["approve","reject","return","edit"];
type Row={public_id:string;report_public_id:string;action:string;reason:string;before_json:string;after_json:string;created_at:number;os_number:string;imas_os_number:string;collaborator:string;environment:string;floor:string};
export async function GET(){
 const role=await requireRole(["supervisor","engenheiro"]);if(!role)return Response.json({error:"Acesso restrito."},{status:403});
 try{
  const rows=await env.DB.prepare("SELECT c.public_id,c.report_public_id,c.action,c.reason,c.before_json,c.after_json,c.created_at,r.os_number,r.imas_os_number,r.collaborator,r.environment,r.floor FROM change_requests c JOIN service_reports r ON r.public_id=c.report_public_id WHERE c.state='pending' AND r.downloaded_at IS NULL AND r.status<>'Excluída' ORDER BY c.created_at ASC").all<Row>();
  // O engenheiro só vê que o pedido foi enviado; o conteúdo é do supervisor.
  if(role==="engenheiro")return Response.json({sent:rows.results.map(r=>r.report_public_id)},{headers:{"Cache-Control":"no-store"}});
  return Response.json({proposals:rows.results.map(r=>({publicId:r.public_id,reportPublicId:r.report_public_id,action:r.action,reason:r.reason,before:JSON.parse(r.before_json||"{}"),after:JSON.parse(r.after_json||"{}"),createdAt:r.created_at,osNumber:r.imas_os_number||r.os_number,collaborator:r.collaborator,environment:r.environment,floor:r.floor}))},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Não foi possível carregar."},{status:500});}
}
export async function POST(request:Request){
 if(await requireRole(["engenheiro"])!=="engenheiro")return Response.json({error:"Acesso restrito."},{status:403});
 try{
  const body=await request.json();const id=body.publicId,action=body.action;
  if(typeof id!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(id)||!ACTIONS.includes(action))return Response.json({error:"Pedido inválido."},{status:400});
  const reason=typeof body.reason==="string"?body.reason.trim().slice(0,1000):"";
  if(action==="return"&&!reason)return Response.json({error:"Informe o motivo."},{status:400});
  const report=await env.DB.prepare("SELECT downloaded_at,status FROM service_reports WHERE public_id=?").bind(id).first<{downloaded_at:number|null;status:string}>();
  if(!report)return Response.json({error:"OS não encontrada."},{status:404});
  if(report.downloaded_at||report.status==="Excluída")return Response.json({error:"A OS já foi baixada ou excluída."},{status:409});
  let before="{}",after="{}";
  if(action==="edit"){
   const diff=await diffProposal(id,body.fields&&typeof body.fields==="object"?body.fields:{});
   if(!diff.ok)return Response.json({error:diff.error},{status:diff.status});
   before=JSON.stringify(diff.before);after=JSON.stringify(diff.after);
  }
  const now=Date.now();
  await env.DB.batch([
   env.DB.prepare("UPDATE change_requests SET state='dismissed',decided_at=? WHERE report_public_id=? AND state='pending'").bind(now,id),
   env.DB.prepare("INSERT INTO change_requests (public_id,report_public_id,requested_by,action,reason,before_json,after_json,state,created_at) VALUES (?,?,?,?,?,?,?,'pending',?)").bind(crypto.randomUUID(),id,"engenheiro",action,reason,before,after,now),
  ]);
  return Response.json({sent:true,message:"Enviado."},{status:201});
 }catch{return Response.json({error:"Não foi possível enviar."},{status:500});}
}
