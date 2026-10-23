import {env} from "cloudflare:workers";
import {requireRole} from "../../../../auth";
import {applyChange,rejectReport} from "../../../../report-actions";
import {approvalFingerprint} from "../../../../imas-approval";
import {GET as reportsGet} from "../../route";
import {POST as approvePost} from "../../../imas/approve/route";
import {POST as returnPost} from "../../return/route";
import type {ExportReport} from "../../../../report-export";
type Row={public_id:string;report_public_id:string;action:string;reason:string;before_json:string;after_json:string};
async function run(row:Row,url:string):Promise<Response>{
 const id=row.report_public_id;
 if(row.action==="edit")return await applyChange(id,JSON.parse(row.before_json),JSON.parse(row.after_json)).then(r=>r.ok?Response.json({message:r.message}):Response.json({error:r.error},{status:r.status}));
 if(row.action==="reject")return await rejectReport(id).then(r=>r.ok?Response.json({message:r.message}):Response.json({error:r.error},{status:r.status}));
 if(row.action==="return")return returnPost(new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:id,reason:row.reason})}));
 const list=await reportsGet();if(!list.ok)return Response.json({error:"Não foi possível consultar a OS."},{status:503});
 const report=((await list.json()).reports as ExportReport[]).find(r=>r.publicId===id);
 if(!report)return Response.json({error:"OS não encontrada ou já baixada."},{status:404});
 return approvePost(new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:id,photoIds:report.photos.map(p=>p.publicId),fingerprint:await approvalFingerprint(report)})}));
}
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o supervisor decide."},{status:403});
 try{
  const {publicId,decision}=await request.json();
  if(typeof publicId!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(publicId)||!["apply","dismiss"].includes(decision))return Response.json({error:"Pedido inválido."},{status:400});
  if(decision==="dismiss"){
   const r=await env.DB.prepare("UPDATE change_requests SET state='dismissed',decided_at=? WHERE public_id=? AND state='pending'").bind(Date.now(),publicId).run();
   return r.meta?.changes?Response.json({dismissed:true}):Response.json({error:"Pedido já decidido."},{status:409});
  }
  const claim=await env.DB.prepare("UPDATE change_requests SET state='applying' WHERE public_id=? AND state='pending'").bind(publicId).run();
  if(!claim.meta?.changes)return Response.json({error:"Pedido já decidido."},{status:409});
  const row=await env.DB.prepare("SELECT public_id,report_public_id,action,reason,before_json,after_json FROM change_requests WHERE public_id=?").bind(publicId).first<Row>();
  let response:Response;
  try{response=await run(row!,request.url);}catch{response=Response.json({error:"Falha ao aplicar."},{status:500});}
  if(response.ok){await env.DB.prepare("UPDATE change_requests SET state='applied',decided_at=? WHERE public_id=?").bind(Date.now(),publicId).run();return Response.json({applied:true,message:(await response.json().catch(()=>({}))).message||"Aplicado."});}
  await env.DB.prepare("UPDATE change_requests SET state='pending' WHERE public_id=? AND state='applying'").bind(publicId).run();
  const payload=await response.json().catch(()=>({}));
  return Response.json({error:payload.error||"Não foi possível aplicar."},{status:response.status||409});
 }catch{return Response.json({error:"Não foi possível decidir."},{status:500});}
}
