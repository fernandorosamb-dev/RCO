import {env} from "cloudflare:workers";
import {requireRole} from "../../auth";
import {roles,isOverviewRole} from "../../access";
import {documentStaff} from "../../document-staff";
import {validateDocument} from "../../service-documents";
export async function GET(){
 const role=await requireRole(roles);if(!role)return Response.json({error:"Faça login."},{status:401});
 try{
  const query=isOverviewRole(role)?env.DB.prepare("SELECT * FROM service_documents ORDER BY created_at DESC LIMIT 200"):env.DB.prepare("SELECT * FROM service_documents WHERE created_by_role=? ORDER BY created_at DESC LIMIT 200").bind(role);
  const rows=await query.all<Record<string,unknown>>();
  return Response.json({staff:documentStaff.filter(person=>isOverviewRole(role)||person.area===role),documents:rows.results.map(row=>({...row,data:JSON.parse(String(row.data_json)),data_json:undefined}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({error:"Não foi possível carregar os documentos. Tente novamente."},{status:503});}
}
export async function POST(request:Request){
 const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);if(!role)return Response.json({error:"Acesso somente de consulta."},{status:403});
 try{
  const body=await request.json();const data=validateDocument(body.data);const now=Date.now();const id=crypto.randomUUID();const reference=`PORT-${data.date.replaceAll("-","")}-${id.slice(0,8).toUpperCase()}`;
  const approved=role==="supervisor"&&body.approve===true;
  await env.DB.prepare("INSERT INTO service_documents (public_id,reference,created_by_role,kind,data_json,status,approved_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,reference,role,data.kind,JSON.stringify(data),approved?"approved":"pending",approved?"FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO":"",now,now).run();
  return Response.json({publicId:id,approved},{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao salvar documento."},{status:400});}
}
export async function PATCH(request:Request){
 if(!await requireRole(["supervisor"]))return Response.json({error:"Somente o supervisor pode autorizar."},{status:403});
 try{
  const body=await request.json();const data=validateDocument(body.data);
  const result=await env.DB.prepare("UPDATE service_documents SET kind=?,data_json=?,status='approved',approved_by=?,updated_at=? WHERE public_id=? AND status='pending' AND updated_at=?").bind(data.kind,JSON.stringify(data),"FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO",Date.now(),String(body.publicId||""),Number(body.updatedAt)).run();
  if(!result.meta.changes)return Response.json({error:"Documento já autorizado ou alterado. Atualize a lista."},{status:409});
  return Response.json({approved:true,publicId:body.publicId});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Falha ao autorizar."},{status:400});}
}
