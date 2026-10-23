import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
const MAX_AGE=6*60*60*1000;
// O Supervisor autorizou o comando do engenheiro. Consumidor: extensão na máquina do Supervisor.
export async function POST(request:Request){
 if(await requireRole(["engenheiro"])!=="engenheiro")return Response.json({error:"Acesso restrito."},{status:403});
 try{
  const {month}=await request.json();
  if(typeof month!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:"Selecione o mês."},{status:400});
  const now=Date.now();
  await env.DB.prepare("INSERT INTO batch_requests (public_id,month,requested_by,state,created_at) SELECT ?,?,?,'authorized',? WHERE NOT EXISTS(SELECT 1 FROM batch_requests WHERE month=? AND state='authorized' AND created_at>?)").bind(crypto.randomUUID(),month,"engenheiro",now,month,now-MAX_AGE).run();
  return Response.json({sent:true,authorized:true,message:"Lote autorizado. Aguardando a extensão no computador do Supervisor."},{status:201});
 }catch{return Response.json({error:"Não foi possível enviar."},{status:500});}
}
export async function GET(){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Acesso restrito."},{status:403});
 const rows=await env.DB.prepare("SELECT public_id,month,created_at FROM batch_requests WHERE state='authorized' AND created_at>? ORDER BY created_at ASC").bind(Date.now()-MAX_AGE).all<{public_id:string;month:string;created_at:number}>();
 return Response.json({requests:rows.results.map(row=>({id:row.public_id,month:row.month,authorized:true,createdAt:row.created_at}))},{headers:{"Cache-Control":"no-store"}});
}
/** Claim atômico antes de iniciar o lote: a mesma requisição só pode ser recebida uma vez. */
export async function PATCH(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Acesso restrito."},{status:403});
 const {id,decision,action}=await request.json().catch(()=>({}));
 const claim=decision==="apply"||action==="claim";
 if(typeof id!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(id)||(!claim&&decision!=="dismiss"))return Response.json({error:"Pedido inválido."},{status:400});
 const r=await env.DB.prepare("UPDATE batch_requests SET state=?,claimed_at=? WHERE public_id=? AND state='authorized' AND created_at>?").bind(claim?"claimed":"dismissed",Date.now(),id,Date.now()-MAX_AGE).run();
 return r.meta?.changes?Response.json({claimed:true}):Response.json({error:"Pedido já recebido ou expirado."},{status:409});
}
