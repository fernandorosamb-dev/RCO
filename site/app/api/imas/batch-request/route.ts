import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
const MAX_AGE=6*60*60*1000;
// Engenheiro dá o comando; a execução acontece na máquina do supervisor (página aberta com a extensão).
export async function POST(request:Request){
 if(await requireRole(["engenheiro"])!=="engenheiro")return Response.json({error:"Acesso restrito."},{status:403});
 try{
  const {month}=await request.json();
  if(typeof month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:"Selecione o mês."},{status:400});
  const now=Date.now();
  const open=await env.DB.prepare("SELECT public_id FROM batch_requests WHERE month=? AND state='pending' AND created_at>?").bind(month,now-MAX_AGE).first();
  if(!open)await env.DB.prepare("INSERT INTO batch_requests (public_id,month,requested_by,state,created_at) VALUES (?,?,?,'pending',?)").bind(crypto.randomUUID(),month,"engenheiro",now).run();
  return Response.json({sent:true,message:"Enviado."},{status:201});
 }catch{return Response.json({error:"Não foi possível enviar."},{status:500});}
}
// Supervisor: consulta e "pega" (uma única vez) o pedido pendente.
export async function GET(){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Acesso restrito."},{status:403});
 const row=await env.DB.prepare("SELECT public_id,month FROM batch_requests WHERE state='pending' AND created_at>? ORDER BY created_at ASC LIMIT 1").bind(Date.now()-MAX_AGE).first<{public_id:string;month:string}>();
 return Response.json({request:row?{id:row.public_id,month:row.month}:null},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Acesso restrito."},{status:403});
 const {id}=await request.json().catch(()=>({}));
 if(typeof id!=="string")return Response.json({error:"Pedido inválido."},{status:400});
 const r=await env.DB.prepare("UPDATE batch_requests SET state='claimed',claimed_at=? WHERE public_id=? AND state='pending'").bind(Date.now(),id).run();
 return r.meta?.changes?Response.json({claimed:true}):Response.json({error:"Pedido já pego."},{status:409});
}
